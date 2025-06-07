const axios = require('axios');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class VLCController {
  constructor() {
    this.host = 'localhost';
    this.port = 8080;
    this.password = 'vlcpassword'; // Default password
    this.baseURL = `http://${this.host}:${this.port}`;
    this.vlcProcess = null;
    this.isConnected = false;
    this.lastPosition = 0;
    this.lastState = 'stopped';
  }

  /**
   * Start VLC with HTTP interface enabled
   */
  async startVLC(videoPath = null) {
    try {
      // Kill any existing VLC process
      await this.killVLC();

      // VLC command with HTTP interface
      const vlcPath = '/Applications/VLC.app/Contents/MacOS/VLC';
      const args = [
        '--intf', 'http',
        '--http-host', this.host,
        '--http-port', this.port,
        '--http-password', this.password,
        '--extraintf', 'macosx',
        '--no-video-title-show',
        '--no-media-library',
        '--no-playlist-autostart'
      ];

      if (videoPath) {
        args.push(videoPath);
      }

      return new Promise((resolve, reject) => {
        this.vlcProcess = exec(`"${vlcPath}" ${args.join(' ')}`, (error) => {
          if (error && error.code !== null) {
            console.error('VLC process error:', error);
            reject(error);
          }
        });

        // Wait for VLC to start
        setTimeout(async () => {
          const connected = await this.waitForConnection();
          if (connected) {
            resolve(true);
          } else {
            reject(new Error('Failed to connect to VLC'));
          }
        }, 2000);
      });
    } catch (error) {
      console.error('Failed to start VLC:', error);
      throw error;
    }
  }

  /**
   * Kill VLC process
   */
  async killVLC() {
    return new Promise((resolve) => {
      exec('pkill -f "VLC.*--intf http"', (error) => {
        if (error && error.code !== 1) {
          console.error('Error killing VLC:', error);
        }
        this.vlcProcess = null;
        this.isConnected = false;
        resolve();
      });
    });
  }

  /**
   * Wait for VLC HTTP interface to be ready
   */
  async waitForConnection(maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.getStatus();
        this.isConnected = true;
        console.log('Connected to VLC HTTP interface');
        return true;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    return false;
  }

  /**
   * Make authenticated request to VLC
   */
  async makeRequest(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.baseURL}/requests/${endpoint}`, {
        params,
        auth: {
          username: '',
          password: this.password
        },
        timeout: 1000
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('VLC authentication failed. Check password.');
      }
      throw error;
    }
  }

  /**
   * Get current status
   */
  async getStatus() {
    const status = await this.makeRequest('status.json');
    
    // Parse status
    const state = status.state || 'stopped';
    const position = status.time || 0; // Position in seconds
    const length = status.length || 0; // Total length in seconds
    const volume = status.volume || 0;
    
    this.lastPosition = position;
    this.lastState = state;
    
    return {
      state,
      position,
      length,
      volume,
      playing: state === 'playing',
      currentFile: status.information?.category?.meta?.filename
    };
  }

  /**
   * Play video at specific position
   */
  async play(position = null) {
    const params = { command: 'pl_play' };
    await this.makeRequest('status.json', params);
    
    if (position !== null) {
      await this.seek(position);
    }
  }

  /**
   * Pause video
   */
  async pause() {
    const params = { command: 'pl_pause' };
    await this.makeRequest('status.json', params);
  }

  /**
   * Toggle play/pause
   */
  async togglePlayPause() {
    const status = await this.getStatus();
    if (status.playing) {
      await this.pause();
    } else {
      await this.play();
    }
  }

  /**
   * Seek to position (in seconds)
   */
  async seek(position) {
    const params = {
      command: 'seek',
      val: Math.floor(position)
    };
    await this.makeRequest('status.json', params);
  }

  /**
   * Set playback rate (1.0 = normal speed)
   */
  async setRate(rate) {
    const params = {
      command: 'rate',
      val: rate
    };
    await this.makeRequest('status.json', params);
  }

  /**
   * Open a video file
   */
  async openFile(filePath) {
    // Encode file path for URL
    const encodedPath = encodeURIComponent(filePath);
    const params = {
      command: 'in_play',
      input: `file:///${encodedPath}`
    };
    await this.makeRequest('status.json', params);
  }

  /**
   * Clear playlist
   */
  async clearPlaylist() {
    const params = { command: 'pl_empty' };
    await this.makeRequest('status.json', params);
  }

  /**
   * Set volume (0-320, where 256 = 100%)
   */
  async setVolume(volume) {
    const vlcVolume = Math.floor((volume / 100) * 256);
    const params = {
      command: 'volume',
      val: vlcVolume
    };
    await this.makeRequest('status.json', params);
  }

  /**
   * Sync to target position with smooth correction
   */
  async syncToPosition(targetPosition, isPlaying, smoothCorrection = true) {
    const status = await this.getStatus();
    const currentPosition = status.position;
    const drift = Math.abs(currentPosition - targetPosition);

    // Threshold for drift correction
    const MINOR_DRIFT_THRESHOLD = 0.5; // 500ms
    const MAJOR_DRIFT_THRESHOLD = 2.0; // 2 seconds

    if (drift < MINOR_DRIFT_THRESHOLD) {
      // No correction needed
      if (status.playing !== isPlaying) {
        if (isPlaying) {
          await this.play();
        } else {
          await this.pause();
        }
      }
      return;
    }

    if (drift < MAJOR_DRIFT_THRESHOLD && smoothCorrection) {
      // Minor drift - adjust playback rate
      const ahead = currentPosition > targetPosition;
      const rate = ahead ? 0.95 : 1.05;
      await this.setRate(rate);
      
      // Reset rate after correction time
      const correctionTime = (drift / 0.05) * 1000; // Time to correct at 5% speed difference
      setTimeout(() => {
        this.setRate(1.0);
      }, correctionTime);
    } else {
      // Major drift - hard seek
      await this.seek(targetPosition);
    }

    // Ensure correct play state
    if (status.playing !== isPlaying) {
      if (isPlaying) {
        await this.play();
      } else {
        await this.pause();
      }
    }
  }

  /**
   * Execute command at specific NTP time
   */
  async executeAtTime(command, targetTime, position = null) {
    const currentTime = Date.now() / 1000; // Current time in seconds
    const delay = (targetTime - currentTime) * 1000; // Delay in milliseconds

    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    switch (command) {
      case 'play':
        await this.play(position);
        break;
      case 'pause':
        await this.pause();
        break;
      case 'seek':
        if (position !== null) {
          await this.seek(position);
        }
        break;
    }
  }

  /**
   * Get VLC configuration instructions
   */
  static getSetupInstructions() {
    return `
VLC Setup Instructions:
1. Install VLC if not already installed
2. The application will automatically start VLC with HTTP interface enabled
3. Default password is set to: vlcpassword
4. Make sure no other instance of VLC is running

Manual VLC Setup (if automatic start fails):
1. Open VLC
2. Go to VLC > Preferences > Show All
3. Navigate to Interface > Main interfaces
4. Check "Web" 
5. Go to Interface > Main interfaces > Lua
6. Set HTTP Password to: vlcpassword
7. Save and restart VLC

Command line start:
/Applications/VLC.app/Contents/MacOS/VLC --intf http --http-password vlcpassword
    `;
  }
}

module.exports = VLCController;