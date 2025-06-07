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
    this.isController = false;
    this.ntpOffset = 0;
    this.reconnectInterval = null;
    this.heartbeatInterval = null;
    this.isCloudflare = false;
  }

  /**
   * Connect to sync server
   */
  async connect(channelId = null) {
    return new Promise((resolve, reject) => {
      try {
        // Check if this is a Cloudflare Workers URL
        this.isCloudflare = this.serverUrl.includes('workers.dev') || 
                           this.serverUrl.includes('cloudflare');
        
        // For Cloudflare, append channel as query parameter
        let wsUrl = this.serverUrl;
        if (this.isCloudflare && channelId) {
          const url = new URL(this.serverUrl);
          url.searchParams.set('channel', channelId);
          wsUrl = url.toString();
        }
        
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          console.log('Connected to sync server');
          this.connected = true;
          this.setupHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        });

        this.ws.on('close', () => {
          console.log('Disconnected from sync server');
          this.connected = false;
          this.isController = false;
          this.clearHeartbeat();
          this.emit('disconnected');
          this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });

      } catch (error) {
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
    if (!this.connected) {
      // For Cloudflare, we need to reconnect with the channel parameter
      if (this.isCloudflare) {
        await this.disconnect();
        await this.connect(channelId);
      } else {
        throw new Error('Not connected to server');
      }
    }

    this.userId = userId || uuidv4();
    this.userName = userName;
    this.channelId = channelId;

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
    this.isController = false;
  }

  /**
   * Send play command (controller only)
   */
  sendPlay(position, targetTime = null) {
    if (!this.isController) {
      console.warn('Only controller can send play commands');
      return;
    }

    this.send({
      type: 'PLAY_COMMAND',
      position,
      targetTime: targetTime || (this.getNTPTime() + 0.1)
    });
  }

  /**
   * Send pause command (controller only)
   */
  sendPause(position) {
    if (!this.isController) {
      console.warn('Only controller can send pause commands');
      return;
    }

    this.send({
      type: 'PAUSE_COMMAND',
      position
    });
  }

  /**
   * Send seek command (controller only)
   */
  sendSeek(position, targetTime = null) {
    if (!this.isController) {
      console.warn('Only controller can send seek commands');
      return;
    }

    this.send({
      type: 'SEEK_COMMAND',
      position,
      targetTime: targetTime || (this.getNTPTime() + 0.2)
    });
  }

  /**
   * Send sync state update (controller only)
   */
  sendSyncState(position, playing) {
    if (!this.isController) {
      return;
    }

    this.send({
      type: 'SYNC_STATE',
      position,
      playing
    });
  }

  /**
   * Handle incoming messages
   */
  handleMessage(message) {
    const { type, ...payload } = message;

    switch (type) {
      case 'CHANNEL_INFO':
        this.handleChannelInfo(payload);
        break;
      case 'USER_JOINED':
        this.emit('userJoined', payload);
        break;
      case 'USER_LEFT':
        this.emit('userLeft', payload);
        break;
      case 'CONTROLLER_CHANGED':
        this.handleControllerChanged(payload);
        break;
      case 'SYNC_STATE':
        this.emit('syncState', payload);
        break;
      case 'PLAY_COMMAND':
        this.emit('playCommand', payload);
        break;
      case 'PAUSE_COMMAND':
        this.emit('pauseCommand', payload);
        break;
      case 'SEEK_COMMAND':
        this.emit('seekCommand', payload);
        break;
      case 'HEARTBEAT':
        this.handleHeartbeat(payload);
        break;
      case 'ERROR':
        this.emit('error', new Error(payload.error));
        break;
    }
  }

  /**
   * Handle channel info update
   */
  handleChannelInfo(payload) {
    this.channelInfo = payload.channel;
    this.isController = this.channelInfo.controller === this.userId;
    
    // Update NTP offset from server timestamp
    if (payload.timestamp) {
      const serverTime = payload.timestamp * 1000; // Convert to milliseconds
      const localTime = Date.now();
      this.ntpOffset = serverTime - localTime;
    }

    this.emit('channelInfo', this.channelInfo);
  }

  /**
   * Handle controller change
   */
  handleControllerChanged(payload) {
    if (this.channelInfo) {
      this.channelInfo.controller = payload.newController;
      this.isController = payload.newController === this.userId;
    }
    this.emit('controllerChanged', payload);
  }

  /**
   * Handle heartbeat
   */
  handleHeartbeat(payload) {
    // Update NTP offset
    if (payload.timestamp) {
      const serverTime = payload.timestamp * 1000;
      const localTime = Date.now();
      this.ntpOffset = serverTime - localTime;
    }
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
    if (this.reconnectInterval) return;

    this.reconnectInterval = setInterval(async () => {
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
        }
      }
    }, 5000); // Try every 5 seconds
  }

  /**
   * Clear reconnection attempts
   */
  clearReconnect() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
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
      isController: this.isController,
      channelInfo: this.channelInfo,
      ntpOffset: this.ntpOffset,
      isCloudflare: this.isCloudflare
    };
  }
}

module.exports = SyncClient;