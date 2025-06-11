const WebSocket = require('ws');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class SyncClient extends EventEmitter {
  constructor(serverUrl = 'ws://localhost:3000') {
    super();
    this.serverUrl = serverUrl;
    this.ws = null;
    this.connected = false;
    this.userId = null;
    this.userName = null;
    this.userMode = 'localplay'; // Default mode
    this.channelId = null;
    this.channelInfo = null;
    this.users = new Map();
    this.sharedFiles = new Map();
    this.screenSharers = new Set();
    this.channelMode = 'mixed';
    
    // NTP synchronization
    this.ntpOffset = 0;
    this.lastSyncTime = 0;
    this.syncAccuracy = null;
    
    // File sharing state
    this.fileUploads = new Map();
    this.fileDownloads = new Map();
    
    // Screen sharing state
    this.screenShareConnections = new Map(); // userId -> RTCPeerConnection
    this.localScreenStream = null;
    this.screenShareElement = null;
    
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.heartbeatInterval = null;
    this.eventHandlers = new Map();
    this.isCloudflare = false;
  }

  /**
   * Connect to sync server
   */
  async connect(channelId = null) {
    return new Promise((resolve, reject) => {
      try {
        // Validate server URL
        if (!this.serverUrl || this.serverUrl.trim() === '') {
          throw new Error('Server URL cannot be empty');
        }

        // Check if this is a Cloudflare Workers URL
        this.isCloudflare = this.serverUrl.includes('workers.dev') || 
                           this.serverUrl.includes('cloudflare');
        
        // Ensure proper WebSocket URL format
        let wsUrl = this.serverUrl.trim();
        
        // Remove any existing protocol
        wsUrl = wsUrl.replace(/^(ws|wss):\/\//, '');
        
        // Add wss:// protocol
        wsUrl = 'wss://' + wsUrl;
        
        // Validate URL format
        try {
          new URL(wsUrl);
        } catch (e) {
          throw new Error(`Invalid server URL: ${wsUrl}`);
        }
        
        // For Cloudflare, append channel as query parameter
        if (this.isCloudflare) {
          const url = new URL(wsUrl);
          // Use provided channelId or default to 'default'
          const finalChannelId = channelId && channelId.trim() ? channelId.trim() : 'default';
          url.searchParams.set('channel', finalChannelId);
          wsUrl = url.toString();
        }
        
        console.log('Connecting to WebSocket URL:', wsUrl);
        
        // Add connection timeout
        const connectionTimeout = setTimeout(() => {
          if (!this.connected) {
            this.ws?.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000); // 10 second timeout
        
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          console.log('Connected to sync server');
          this.connected = true;
          this.setupHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            console.log('Received message:', message);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse message:', error, 'Raw data:', data.toString());
          }
        });

        this.ws.on('close', (code, reason) => {
          clearTimeout(connectionTimeout);
          console.log('Disconnected from sync server:', { code, reason: reason.toString() });
          this.connected = false;
          this.emit('disconnected', { code, reason });
          this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
          clearTimeout(connectionTimeout);
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });

      } catch (error) {
        console.error('Connection setup error:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    console.log('Disconnecting from sync server');
    this.clearReconnect();
    this.clearHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /**
   * Join a sync channel with mode selection
   */
  async joinChannel(channelId, userId, userName, mode = 'localplay') {
    // Validate required parameters
    if (!channelId || channelId.trim() === '') {
      throw new Error('Channel ID is required');
    }
    
    if (!this.connected) {
      // For Cloudflare, we need to reconnect with the channel parameter
      if (this.isCloudflare) {
        await this.disconnect();
        await this.connect(channelId.trim());
      } else {
        throw new Error('Not connected to server');
      }
    }

    this.userId = userId || uuidv4();
    this.userName = userName;
    this.userMode = mode;
    this.channelId = channelId.trim();

    // For Cloudflare, join is handled automatically by the connection
    // For other servers, send explicit join message
    if (!this.isCloudflare) {
      this.send({
        type: 'JOIN_CHANNEL',
        channelId,
        userId: this.userId,
        userName
      });
    }
    
    // Send a heartbeat to ensure connection is established (with small delay)
    if (this.isCloudflare) {
      setTimeout(() => {
        if (this.connected) {
          this.send({ type: 'heartbeat' });
        }
      }, 100); // 100ms delay to ensure server session is ready
    }
  }

  /**
   * Leave current channel
   */
  leaveChannel() {
    if (!this.connected || !this.channelId) {
      return;
    }

    this.send({
      type: 'LEAVE_CHANNEL'
    });

    this.channelId = null;
    this.channelInfo = null;
  }

  /**
   * Change user mode
   */
  changeMode(newMode) {
    if (!this.connected || !this.channelId) return;
    
    const validModes = ['localplay', 'screenshare_host', 'screenshare_viewer', 'file_download', 'observer'];
    if (!validModes.includes(newMode)) {
      throw new Error('Invalid mode');
    }

    this.userMode = newMode;
    this.send({
      type: 'change_mode',
      mode: newMode
    });
  }

  /**
   * Send play command (enhanced)
   */
  async sendPlay(position, targetTime = null) {
    if (!this.connected || !this.channelId) return;
    
    try {
      // Use enhanced message for Cloudflare
      if (this.isCloudflare) {
        this.send({
          type: 'play',
          position,
          targetTime: targetTime || (Date.now() / 1000 + 0.1),
          timestamp: Date.now() / 1000
        });
      } else {
        // Legacy message
        this.send({
          type: 'PLAY_COMMAND',
          position,
          targetTime: targetTime || (Date.now() / 1000 + 0.1),
          timestamp: Date.now() / 1000
        });
      }
    } catch (error) {
      console.error('Failed to send play command:', error);
    }
  }

  /**
   * Send pause command (enhanced)
   */
  async sendPause(position) {
    if (!this.connected || !this.channelId) return;
    
    try {
      // Use enhanced message for Cloudflare
      if (this.isCloudflare) {
        this.send({
          type: 'pause',
          position,
          timestamp: Date.now() / 1000
        });
      } else {
        // Legacy message
        this.send({
          type: 'PAUSE_COMMAND',
          position,
          timestamp: Date.now() / 1000
        });
      }
    } catch (error) {
      console.error('Failed to send pause command:', error);
    }
  }

  /**
   * Send seek command (enhanced)
   */
  async sendSeek(position, targetTime = null) {
    if (!this.connected || !this.channelId) return;
    
    try {
      // Use enhanced message for Cloudflare
      if (this.isCloudflare) {
        this.send({
          type: 'seek',
          position,
          targetTime: targetTime || (Date.now() / 1000 + 0.2),
          timestamp: Date.now() / 1000
        });
      } else {
        // Legacy message
        this.send({
          type: 'SEEK_COMMAND',
          position,
          targetTime: targetTime || (Date.now() / 1000 + 0.2),
          timestamp: Date.now() / 1000
        });
      }
    } catch (error) {
      console.error('Failed to send seek command:', error);
    }
  }

  /**
   * Send sync state update
   */
  async sendSyncState(position, playing) {
    if (!this.connected || !this.channelId) return;
    
    try {
      this.ws.send(JSON.stringify({
        type: 'SYNC_STATE',
        position,
        playing,
        timestamp: Date.now() / 1000
      }));
    } catch (error) {
      console.error('Failed to send sync state:', error);
    }
  }

  // File sharing methods
  async uploadFile(file, onProgress = null) {
    if (!this.connected || !this.channelId) {
      throw new Error('Not connected to channel');
    }

    const fileId = uuidv4();
    const chunkSize = 64 * 1024; // 64KB chunks
    const chunkCount = Math.ceil(file.size / chunkSize);
    
    // Start upload
    this.send({
      type: 'file_upload',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      chunkCount: chunkCount
    });

    // Store upload info
    this.fileUploads.set(fileId, {
      file,
      chunkCount,
      uploadedChunks: 0,
      onProgress
    });

    return fileId;
  }

  async downloadFile(fileId) {
    if (!this.connected || !this.channelId) {
      throw new Error('Not connected to channel');
    }

    this.send({
      type: 'file_download_request',
      fileId
    });
  }

  // Screen sharing methods (simplified for Node.js context)
  async startScreenShare(quality = 'medium', frameRate = 30) {
    if (!this.connected || !this.channelId) {
      throw new Error('Not connected to channel');
    }

    this.send({
      type: 'screenshare_start',
      quality,
      frameRate
    });

    this.emit('screenShareStarted', { quality, frameRate });
    return { success: true, quality, frameRate };
  }

  stopScreenShare() {
    if (this.connected && this.channelId) {
      this.send({
        type: 'screenshare_stop',
        newMode: 'observer'
      });
    }

    this.emit('screenShareStopped');
    return { success: true };
  }

  async connectToScreenShare(hostId) {
    if (!this.connected || !this.channelId) {
      throw new Error('Not connected to channel');
    }

    // Change to viewer mode
    this.changeMode('screenshare_viewer');
    
    this.emit('screenShareConnectionRequested', { hostId });
    return { success: true, hostId };
  }

  /**
   * Handle incoming messages (enhanced)
   */
  handleMessage(message) {
    try {
      console.log('Received message:', message);

      switch (message.type) {
        // Legacy handlers
        case 'CHANNEL_INFO':
          this.handleChannelInfo(message);
          break;
        case 'USER_JOINED':
          this.emit('userJoined', {
            userId: message.userId,
            userName: message.userName
          });
          break;
        case 'USER_LEFT':
          this.emit('userLeft', {
            userId: message.userId,
            userName: message.userName
          });
          break;
        case 'PLAY_COMMAND':
          this.emit('playCommand', {
            position: message.position,
            targetTime: message.targetTime
          });
          break;
        case 'PAUSE_COMMAND':
          this.emit('pauseCommand', {
            position: message.position
          });
          break;
        case 'SEEK_COMMAND':
          this.emit('seekCommand', {
            position: message.position,
            targetTime: message.targetTime
          });
          break;
        case 'SYNC_STATE':
          this.emit('syncState', {
            position: message.position,
            playing: message.playing
          });
          break;
        case 'ERROR':
          this.emit('error', new Error(message.error));
          break;
        case 'HEARTBEAT':
          // Reset reconnect attempts on successful heartbeat
          this.reconnectAttempts = 0;
          break;

        // Enhanced handlers
        case 'welcome':
          this.handleWelcome(message);
          break;
        case 'user_joined':
          this.handleUserJoined(message);
          break;
        case 'user_left':
          this.handleUserLeft(message);
          break;
        case 'user_mode_changed':
          this.handleUserModeChanged(message);
          break;
        case 'play':
          this.emit('playCommand', {
            position: message.position,
            targetTime: message.targetTime || (Date.now() / 1000 + 0.1),
            triggeredBy: message.triggeredBy,
            userMode: message.userMode
          });
          break;
        case 'pause':
          this.emit('pauseCommand', {
            position: message.position,
            triggeredBy: message.triggeredBy,
            userMode: message.userMode
          });
          break;
        case 'seek':
          this.emit('seekCommand', {
            position: message.position,
            targetTime: message.targetTime || (Date.now() / 1000 + 0.2),
            triggeredBy: message.triggeredBy,
            userMode: message.userMode
          });
          break;
        case 'mode_changed':
          this.handleModeChanged(message);
          break;
        case 'file_upload_started':
          this.handleFileUploadStarted(message);
          break;
        case 'file_upload_progress':
          this.handleFileUploadProgress(message);
          break;
        case 'file_available':
          this.handleFileAvailable(message);
          break;
        case 'file_download_ready':
          this.handleFileDownloadReady(message);
          break;
        case 'screenshare_available':
          this.handleScreenShareAvailable(message);
          break;
        case 'screenshare_ended':
          this.handleScreenShareEnded(message);
          break;
        case 'screenshare_offer':
          this.handleScreenShareOffer(message);
          break;
        case 'screenshare_answer':
          this.handleScreenShareAnswer(message);
          break;
        case 'ice_candidate':
          this.handleIceCandidate(message);
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.emit('error', error);
    }
  }

  /**
   * Handle enhanced welcome message
   */
  handleWelcome(message) {
    this.userId = message.userId;
    this.userName = message.userName;
    this.userMode = message.userMode;
    
    // Update local state
    this.users.clear();
    message.users.forEach(user => {
      this.users.set(user.id, user);
    });
    
    this.sharedFiles.clear();
    message.sharedFiles.forEach(file => {
      this.sharedFiles.set(file.id, file);
    });
    
    this.screenSharers.clear();
    message.screenSharers.forEach(userId => {
      this.screenSharers.add(userId);
    });
    
    this.channelMode = message.channelMode;
    
    // Update NTP offset
    if (message.ntpOffset !== undefined) {
      this.ntpOffset = message.ntpOffset;
    }
    
    this.emit('welcome', {
      userId: this.userId,
      userName: this.userName,
      userMode: this.userMode,
      users: Array.from(this.users.values()),
      sharedFiles: Array.from(this.sharedFiles.values()),
      screenSharers: Array.from(this.screenSharers),
      channelMode: this.channelMode
    });
  }

  handleUserJoined(message) {
    this.users.set(message.user.id, message.user);
    this.screenSharers.clear();
    message.screenSharers.forEach(userId => {
      this.screenSharers.add(userId);
    });
    
    this.emit('userJoined', {
      user: message.user,
      totalUsers: message.totalUsers,
      screenSharers: Array.from(this.screenSharers)
    });
  }

  handleUserLeft(message) {
    this.users.delete(message.userId);
    this.screenSharers.delete(message.userId);
    
    this.emit('userLeft', {
      userId: message.userId,
      userName: message.userName,
      totalUsers: message.totalUsers
    });
  }

  handleUserModeChanged(message) {
    const user = this.users.get(message.userId);
    if (user) {
      user.mode = message.newMode;
    }
    
    this.screenSharers.clear();
    message.screenSharers.forEach(userId => {
      this.screenSharers.add(userId);
    });
    
    this.emit('userModeChanged', {
      userId: message.userId,
      userName: message.userName,
      oldMode: message.oldMode,
      newMode: message.newMode,
      screenSharers: Array.from(this.screenSharers)
    });
  }

  handleModeChanged(message) {
    this.userMode = message.newMode;
    this.emit('modeChanged', {
      oldMode: message.oldMode,
      newMode: message.newMode
    });
  }

  handleFileUploadStarted(message) {
    this.emit('fileUploadStarted', message);
  }

  handleFileUploadProgress(message) {
    this.emit('fileUploadProgress', message);
  }

  handleFileAvailable(message) {
    this.sharedFiles.set(message.fileId, message);
    this.emit('fileAvailable', message);
  }

  handleFileDownloadReady(message) {
    this.emit('fileDownloadReady', message);
  }

  handleScreenShareAvailable(message) {
    this.screenSharers.add(message.hostId);
    this.emit('screenShareAvailable', message);
  }

  handleScreenShareEnded(message) {
    this.screenSharers.delete(message.hostId);
    this.emit('screenShareEnded', message);
  }

  handleScreenShareOffer(message) {
    this.emit('screenShareOffer', message);
  }

  handleScreenShareAnswer(message) {
    this.emit('screenShareAnswer', message);
  }

  handleIceCandidate(message) {
    this.emit('iceCandidate', message);
  }

  /**
   * Handle channel info update
   */
  handleChannelInfo(payload) {
    this.channelInfo = payload.channel;
    
    // Update NTP offset from server timestamp
    if (payload.timestamp) {
      const serverTime = payload.timestamp * 1000; // Convert to milliseconds
      const localTime = Date.now();
      this.ntpOffset = serverTime - localTime;
    }
    
    this.emit('channelInfo', this.channelInfo);
  }

  /**
   * Send message to server
   */
  send(message) {
    if (!this.connected || !this.ws) {
      console.error('Cannot send message: not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  /**
   * Setup heartbeat
   */
  setupHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.connected) {
        if (this.isCloudflare) {
          this.send({ type: 'heartbeat' });
        } else {
          this.send({ type: 'HEARTBEAT' });
        }
      }
    }, 30000); // 30 seconds
  }

  /**
   * Clear heartbeat
   */
  clearHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Attempt to reconnect
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect, attempt ${this.reconnectAttempts} of ${this.maxReconnectAttempts}`);
    setTimeout(async () => {
      if (!this.connected) {
        console.log('Attempting to reconnect...');
        try {
          await this.connect(this.channelId);
          
          // Rejoin channel if we were in one
          if (this.channelId && this.userId && this.userName) {
            this.joinChannel(this.channelId, this.userId, this.userName, this.userMode);
          }
          
          this.clearReconnect();
        } catch (error) {
          console.error('Reconnection failed:', error);
          this.attemptReconnect();
        }
      }
    }, this.reconnectDelay);
  }

  /**
   * Clear reconnection attempts
   */
  clearReconnect() {
    this.reconnectAttempts = 0;
  }

  /**
   * Get connection status (enhanced)
   */
  getStatus() {
    return {
      connected: this.connected,
      userId: this.userId,
      userName: this.userName,
      userMode: this.userMode,
      channelId: this.channelId,
      channelInfo: this.channelInfo,
      users: Array.from(this.users.values()),
      sharedFiles: Array.from(this.sharedFiles.values()),
      screenSharers: Array.from(this.screenSharers),
      channelMode: this.channelMode,
      ntpOffset: this.ntpOffset,
      isCloudflare: this.isCloudflare,
      syncAccuracy: this.getSyncAccuracy()
    };
  }

  /**
   * Get sync accuracy rating
   */
  getSyncAccuracy() {
    const offset = Math.abs(this.ntpOffset);
    if (offset < 50) return 'Excellent';
    if (offset < 100) return 'Good';
    if (offset < 200) return 'Fair';
    return 'Poor';
  }
}

module.exports = SyncClient; 