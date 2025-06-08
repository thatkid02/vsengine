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
    this.channelId = null;
    this.channelInfo = null;
    this.ntpOffset = 0;
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
    this.clearReconnect();
    this.clearHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /**
   * Join a sync channel
   */
  async joinChannel(channelId, userId, userName) {
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
    this.channelId = channelId.trim();

    this.send({
      type: 'JOIN_CHANNEL',
      channelId,
      userId: this.userId,
      userName
    });
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
   * Send play command
   */
  async sendPlay(position, targetTime = null) {
    if (!this.connected || !this.channelId) return;
    
    try {
      this.ws.send(JSON.stringify({
        type: 'PLAY_COMMAND',
        position,
        targetTime: targetTime || (Date.now() / 1000 + 0.1),
        timestamp: Date.now() / 1000
      }));
    } catch (error) {
      console.error('Failed to send play command:', error);
    }
  }

  /**
   * Send pause command
   */
  async sendPause(position) {
    if (!this.connected || !this.channelId) return;
    
    try {
      this.ws.send(JSON.stringify({
        type: 'PAUSE_COMMAND',
        position,
        timestamp: Date.now() / 1000
      }));
    } catch (error) {
      console.error('Failed to send pause command:', error);
    }
  }

  /**
   * Send seek command
   */
  async sendSeek(position, targetTime = null) {
    if (!this.connected || !this.channelId) return;
    
    try {
      this.ws.send(JSON.stringify({
        type: 'SEEK_COMMAND',
        position,
        targetTime: targetTime || (Date.now() / 1000 + 0.2),
        timestamp: Date.now() / 1000
      }));
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

  /**
   * Handle incoming messages
   */
  handleMessage(message) {
    try {
      console.log('Received message:', message);

      switch (message.type) {
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

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.emit('error', error);
    }
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
   * Get NTP-synchronized time
   */
  getNTPTime() {
    return (Date.now() + this.ntpOffset) / 1000;
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
        this.send({ type: 'HEARTBEAT' });
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
            this.joinChannel(this.channelId, this.userId, this.userName);
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
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.connected,
      userId: this.userId,
      userName: this.userName,
      channelId: this.channelId,
      channelInfo: this.channelInfo,
      ntpOffset: this.ntpOffset,
      isCloudflare: this.isCloudflare
    };
  }
}

module.exports = SyncClient;