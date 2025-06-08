// Durable Object class for handling sync channels
export class SyncChannel {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // ws -> session info
    this.users = new Map(); // userId -> user info
    this.videoState = {
      position: 0,
      playing: false,
      lastUpdate: this.getNTPTime(),
    };
    this.MAX_USERS = parseInt(env.MAX_USERS_PER_CHANNEL || '5');
    this.ntpOffset = 0; // Will be set from request headers
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    // Extract NTP sync data from headers
    const ntpOffset = parseFloat(request.headers.get('X-NTP-Offset') || '0');
    const ntpTime = parseFloat(request.headers.get('X-NTP-Time') || '0');
    
    this.ntpOffset = ntpOffset;
    
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      await this.handleSession(server);
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }
    
    return new Response('Expected WebSocket', { status: 400 });
  }

  async handleSession(webSocket) {
    // Accept the WebSocket connection
    webSocket.accept();
    
    // Create session
    const sessionId = crypto.randomUUID();
    const session = {
      id: sessionId,
      ws: webSocket,
      userId: null,
      userName: null,
      joined: false,
      quit: false,
    };
    
    this.sessions.set(webSocket, session);
    
    // Send initial heartbeat
    this.sendHeartbeat(webSocket);
    
    // Set up message handler
    webSocket.addEventListener('message', async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        await this.handleMessage(webSocket, data);
      } catch (error) {
        this.sendError(webSocket, 'Invalid message format');
      }
    });
    
    // Set up close handler
    webSocket.addEventListener('close', () => {
      this.handleDisconnect(webSocket);
    });
    
    // Set up error handler
    webSocket.addEventListener('error', () => {
      this.handleDisconnect(webSocket);
    });
  }

  async handleMessage(ws, message) {
    const session = this.sessions.get(ws);
    if (!session) return;
    
    const { type, ...payload } = message;
    
    switch (type) {
      case 'JOIN_CHANNEL':
        await this.handleJoinChannel(ws, session, payload);
        break;
      case 'LEAVE_CHANNEL':
        await this.handleLeaveChannel(ws, session);
        break;
      case 'SYNC_STATE':
        await this.handleSyncState(ws, session, payload);
        break;
      case 'PLAY_COMMAND':
        await this.handlePlayCommand(ws, session, payload);
        break;
      case 'PAUSE_COMMAND':
        await this.handlePauseCommand(ws, session, payload);
        break;
      case 'SEEK_COMMAND':
        await this.handleSeekCommand(ws, session, payload);
        break;
      case 'HEARTBEAT':
        this.sendHeartbeat(ws);
        break;
      default:
        this.sendError(ws, 'Unknown message type');
    }
  }

  async handleJoinChannel(ws, session, { channelId, userId, userName }) {
    if (!userId || !userName) {
      this.sendError(ws, 'Missing required fields');
      return;
    }
    
    if (session.joined) {
      this.sendError(ws, 'Already in channel');
      return;
    }
    
    if (this.users.size >= this.MAX_USERS) {
      this.sendError(ws, 'Channel is full');
      return;
    }
    
    // Add user
    session.userId = userId;
    session.userName = userName;
    session.joined = true;
    
    const userInfo = {
      userId,
      userName,
      ws,
    };
    
    this.users.set(userId, userInfo);
    
    // Send channel info to new user
    ws.send(JSON.stringify({
      type: 'CHANNEL_INFO',
      channel: this.getChannelInfo(),
      timestamp: this.getNTPTime(),
      ntpOffset: this.ntpOffset,
    }));
    
    // Notify others
    this.broadcast({
      type: 'USER_JOINED',
      userId,
      userName,
      timestamp: this.getNTPTime(),
    }, userId);
  }

  async handleLeaveChannel(ws, session) {
    if (!session.joined) return;
    
    const { userId } = session;
    this.users.delete(userId);
    
    // Notify others
    this.broadcast({
      type: 'USER_LEFT',
      userId,
      userName: session.userName,
      timestamp: this.getNTPTime(),
    });
    
    session.joined = false;
  }

  async handleSyncState(ws, session, { position, playing }) {
    this.videoState = {
      position,
      playing,
      lastUpdate: this.getNTPTime(),
    };
    
    this.broadcast({
      type: 'SYNC_STATE',
      position,
      playing,
      timestamp: this.getNTPTime(),
    });
  }

  async handlePlayCommand(ws, session, { position, targetTime }) {
    this.videoState.position = position;
    this.videoState.playing = true;
    this.videoState.lastUpdate = this.getNTPTime();
    
    this.broadcast({
      type: 'PLAY_COMMAND',
      position,
      targetTime: targetTime || (this.getNTPTime() + 0.1),
      timestamp: this.getNTPTime(),
    });
  }

  async handlePauseCommand(ws, session, { position }) {
    this.videoState.position = position;
    this.videoState.playing = false;
    this.videoState.lastUpdate = this.getNTPTime();
    
    this.broadcast({
      type: 'PAUSE_COMMAND',
      position,
      timestamp: this.getNTPTime(),
    });
  }

  async handleSeekCommand(ws, session, { position, targetTime }) {
    this.videoState.position = position;
    this.videoState.lastUpdate = this.getNTPTime();
    
    this.broadcast({
      type: 'SEEK_COMMAND',
      position,
      targetTime: targetTime || (this.getNTPTime() + 0.2),
      timestamp: this.getNTPTime(),
    });
  }

  handleDisconnect(ws) {
    const session = this.sessions.get(ws);
    if (session && session.joined) {
      this.handleLeaveChannel(ws, session);
    }
    this.sessions.delete(ws);
  }

  getChannelInfo() {
    return {
      id: this.state.id,
      userCount: this.users.size,
      maxUsers: this.MAX_USERS,
      users: Array.from(this.users.entries()).map(([userId, user]) => ({
        userId,
        name: user.userName
      })),
      videoState: {
        position: this.videoState.position,
        playing: this.videoState.playing
      }
    };
  }

  broadcast(message, excludeUserId = null) {
    this.users.forEach((user, userId) => {
      if (userId !== excludeUserId && user.ws.readyState === 1) {
        user.ws.send(JSON.stringify(message));
      }
    });
  }

  sendError(ws, error) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      error,
      timestamp: this.getNTPTime(),
    }));
  }

  sendHeartbeat(ws) {
    ws.send(JSON.stringify({
      type: 'HEARTBEAT',
      timestamp: this.getNTPTime(),
    }));
  }

  /**
   * Get current NTP time in seconds
   */
  getNTPTime() {
    const localTime = Date.now();
    const ntpTime = localTime + this.ntpOffset;
    return ntpTime / 1000; // Return seconds with decimal for milliseconds
  }
}