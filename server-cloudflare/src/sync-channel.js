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
    
    // New: File sharing and screen sharing state
    this.sharedFiles = new Map(); // fileId -> file info
    this.screenSharers = new Set(); // userIds who are sharing screen
    this.channelMode = 'mixed'; // 'mixed', 'screenshare_only', 'localplay_only'
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
      
      // Extract channel from URL for auto-join
      const channelId = url.searchParams.get('channel');
      
      await this.handleSession(server, channelId);
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }
    
    return new Response('Expected WebSocket', { status: 400 });
  }

  async handleSession(webSocket, channelId = null) {
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
      autoJoinChannel: channelId, // Store channel for auto-join
    };
    
    this.sessions.set(webSocket, session);
    
    console.log(`New WebSocket session created: ${sessionId}, channelId: ${channelId}, total sessions: ${this.sessions.size}`);
    
    // Send initial heartbeat
    this.sendHeartbeat(webSocket);
    
    // If channel ID provided, wait for first heartbeat to auto-join
    if (channelId) {
      session.pendingAutoJoin = true;
    }
    
    // Set up message handler
    webSocket.addEventListener('message', async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        await this.handleMessage(webSocket, data);
      } catch (error) {
        console.error('Message parse error:', error);
        console.error('Raw message data:', msg.data);
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

  async handleMessage(ws, data) {
    console.log('Received message:', data.type);
    const session = this.sessions.get(ws);
    
    // Ensure session exists before processing messages
    if (!session) {
      console.error('Message received but no session found');
      this.sendError(ws, 'Session not found');
      return;
    }
    
    switch (data.type) {
      // Legacy handlers (keep for backward compatibility)
      case 'JOIN_CHANNEL':
        await this.handleJoinChannel(ws, session, data);
        break;
      case 'LEAVE_CHANNEL':
        await this.handleLeaveChannel(ws, session);
        break;
      case 'SYNC_STATE':
        await this.handleSyncState(ws, session, data);
        break;
      case 'PLAY_COMMAND':
        await this.handlePlayCommand(ws, session, data);
        break;
      case 'PAUSE_COMMAND':
        await this.handlePauseCommand(ws, session, data);
        break;
      case 'SEEK_COMMAND':
        await this.handleSeekCommand(ws, session, data);
        break;
      case 'HEARTBEAT':
        this.sendHeartbeat(ws);
        break;
        
      // New enhanced handlers
      case 'join':
        this.handleJoin(ws, data);
        break;
      case 'heartbeat':
        this.handleHeartbeat(ws, data);
        break;
      case 'play':
        this.handlePlay(ws, data);
        break;
      case 'pause':
        this.handlePause(ws, data);
        break;
      case 'seek':
        this.handleSeek(ws, data);
        break;
      case 'change_mode':
        this.handleChangeMode(ws, data);
        break;
      case 'file_upload':
        this.handleFileUpload(ws, data);
        break;
      case 'file_download_request':
        this.handleFileDownloadRequest(ws, data);
        break;
      case 'file_share':
        this.handleFileShare(ws, data);
        break;
      case 'screenshare_start':
        this.handleScreenShareStart(ws, data);
        break;
      case 'screenshare_stop':
        this.handleScreenShareStop(ws, data);
        break;
      case 'screenshare_offer':
        this.handleScreenShareOffer(ws, data);
        break;
      case 'screenshare_answer':
        this.handleScreenShareAnswer(ws, data);
        break;
      case 'ice_candidate':
        this.handleIceCandidate(ws, data);
        break;
      default:
        console.log('Unknown message type:', data.type);
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
    console.log(`Broadcasting message type: ${message.type}, excluding user: ${excludeUserId}, total users: ${this.users.size}`);
    this.users.forEach((user, userId) => {
      if (userId !== excludeUserId && user.ws.readyState === 1) {
        console.log(`Sending ${message.type} to user ${userId}`);
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
    console.log(`Sending HEARTBEAT to WebSocket, readyState: ${ws.readyState}`);
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

  handleJoin(ws, data) {
    const userId = data.userId;
    const userMode = data.mode || 'localplay'; // Default to localplay for backward compatibility
    const userName = data.userName || `User ${userId.substring(0, 8)}`;
    
    console.log(`handleJoin called for user ${userName} (${userId}), mode: ${userMode}`);
    
    if (this.users.has(userId)) {
      console.log(`User ${userId} already in channel - rejecting`);
      this.sendError(ws, 'User already in channel');
      return;
    }

    if (this.users.size >= this.MAX_USERS) {
      this.sendError(ws, 'Channel is full');
      return;
    }

    // Store user info with new mode system
    const userInfo = {
      id: userId,
      name: userName,
      mode: userMode, // 'localplay', 'screenshare_host', 'screenshare_viewer', 'file_download', 'observer'
      joinedAt: this.getNTPTime(),
      lastSeen: this.getNTPTime(),
      fileInfo: null, // For file sharing
      screenShareInfo: null, // For screen sharing
      ws: ws, // Store WebSocket reference for broadcasting
    };

    this.users.set(userId, userInfo);
    
    // Update existing session instead of overwriting it
    const session = this.sessions.get(ws);
    if (session) {
      session.userId = userId;
      session.userName = userName;
      session.joined = true;
      session.lastHeartbeat = this.getNTPTime();
    }

    // Update screen sharers set
    if (userMode === 'screenshare_host') {
      this.screenSharers.add(userId);
    }

    // Send welcome message with enhanced state
    this.sendMessage(ws, {
      type: 'welcome',
      userId: userId,
      userName: userName,
      userMode: userMode,
      videoState: this.videoState,
      users: Array.from(this.users.values()),
      sharedFiles: Array.from(this.sharedFiles.values()),
      screenSharers: Array.from(this.screenSharers),
      channelMode: this.channelMode,
      ntpOffset: this.ntpOffset,
      serverTime: this.getNTPTime()
    });

    // Notify others about new user
    this.broadcast({
      type: 'user_joined',
      user: userInfo,
      screenSharers: Array.from(this.screenSharers),
      totalUsers: this.users.size
    }, userId);

    console.log(`User ${userName} (${userId}) joined in ${userMode} mode. Total users: ${this.users.size}`);
  }

  // Helper method for sending messages
  sendMessage(ws, message) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

  // Enhanced handlers for the new system
  handleHeartbeat(ws, data) {
    console.log(`handleHeartbeat called`);
    const session = this.sessions.get(ws);
    if (session) {
      session.lastHeartbeat = this.getNTPTime();
      
      // Handle auto-join on first heartbeat
      if (session.pendingAutoJoin && session.autoJoinChannel) {
        const userId = crypto.randomUUID();
        const userName = `User ${userId.substring(0, 8)}`;
        
        // Store the user info in session before calling handleJoin
        session.userId = userId;
        session.userName = userName;
        
        this.handleJoin(ws, {
          userId: userId,
          userName: userName,
          mode: 'localplay'
        });
        
        session.pendingAutoJoin = false;
      }
      
      const user = this.users.get(session.userId);
      if (user) {
        user.lastSeen = this.getNTPTime();
      }
    }
    this.sendHeartbeat(ws);
  }

  handlePlay(ws, data) {
    const session = this.sessions.get(ws);
    if (!session) return;
    
    const user = this.users.get(session.userId);
    if (!user || (user.mode !== 'localplay' && user.mode !== 'screenshare_host')) {
      this.sendError(ws, 'Only localplay or screenshare_host users can control playback');
      return;
    }

    this.videoState.position = data.position || 0;
    this.videoState.playing = true;
    this.videoState.lastUpdate = this.getNTPTime();

    this.broadcast({
      type: 'play',
      position: this.videoState.position,
      timestamp: this.getNTPTime(),
      triggeredBy: user.name,
      userMode: user.mode
    });
  }

  handlePause(ws, data) {
    const session = this.sessions.get(ws);
    if (!session) return;
    
    const user = this.users.get(session.userId);
    if (!user || (user.mode !== 'localplay' && user.mode !== 'screenshare_host')) {
      this.sendError(ws, 'Only localplay or screenshare_host users can control playback');
      return;
    }

    this.videoState.position = data.position || 0;
    this.videoState.playing = false;
    this.videoState.lastUpdate = this.getNTPTime();

    this.broadcast({
      type: 'pause',
      position: this.videoState.position,
      timestamp: this.getNTPTime(),
      triggeredBy: user.name,
      userMode: user.mode
    });
  }

  handleSeek(ws, data) {
    const session = this.sessions.get(ws);
    if (!session) return;
    
    const user = this.users.get(session.userId);
    if (!user || (user.mode !== 'localplay' && user.mode !== 'screenshare_host')) {
      this.sendError(ws, 'Only localplay or screenshare_host users can control playback');
      return;
    }

    this.videoState.position = data.position || 0;
    this.videoState.lastUpdate = this.getNTPTime();

    this.broadcast({
      type: 'seek',
      position: this.videoState.position,
      timestamp: this.getNTPTime(),
      triggeredBy: user.name,
      userMode: user.mode
    });
  }

  handleChangeMode(ws, data) {
    const session = this.sessions.get(ws);
    if (!session) return;
    
    const user = this.users.get(session.userId);
    if (!user) return;

    const oldMode = user.mode;
    const newMode = data.mode;

    // Validate mode transition
    const validModes = ['localplay', 'screenshare_host', 'screenshare_viewer', 'file_download', 'observer'];
    if (!validModes.includes(newMode)) {
      this.sendError(ws, 'Invalid mode');
      return;
    }

    // Update user mode
    user.mode = newMode;
    user.lastSeen = this.getNTPTime();

    // Update screen sharers set
    if (oldMode === 'screenshare_host') {
      this.screenSharers.delete(session.userId);
    }
    if (newMode === 'screenshare_host') {
      this.screenSharers.add(session.userId);
    }

    // Notify user of successful mode change
    this.sendMessage(ws, {
      type: 'mode_changed',
      userId: session.userId,
      oldMode,
      newMode,
      timestamp: this.getNTPTime()
    });

    // Notify others
    this.broadcast({
      type: 'user_mode_changed',
      userId: session.userId,
      userName: user.name,
      oldMode,
      newMode,
      screenSharers: Array.from(this.screenSharers),
      timestamp: this.getNTPTime()
    }, [ws]);
  }

  // File sharing handlers
  handleFileUpload(ws, data) {
    const session = this.sessions.get(ws);
    if (!session) return;
    
    const user = this.users.get(session.userId);
    if (!user) return;

    const fileId = crypto.randomUUID();
    const fileInfo = {
      id: fileId,
      name: data.fileName,
      size: data.fileSize,
      type: data.fileType || 'video/mp4',
      uploadedBy: user.name,
      uploadedAt: this.getNTPTime(),
      chunkCount: data.chunkCount || 1,
      receivedChunks: 0,
      data: new Map() // Store chunks
    };

    this.sharedFiles.set(fileId, fileInfo);

    // Notify uploader
    this.sendMessage(ws, {
      type: 'file_upload_started',
      fileId,
      fileName: data.fileName,
      timestamp: this.getNTPTime()
    });

    // Notify others about new file being uploaded
    this.broadcast({
      type: 'file_upload_progress',
      fileId,
      fileName: data.fileName,
      uploadedBy: user.name,
      progress: 0,
      timestamp: this.getNTPTime()
    }, [ws]);
  }

  handleFileDownloadRequest(ws, data) {
    const session = this.sessions.get(ws);
    if (!session) return;
    
    const user = this.users.get(session.userId);
    const fileInfo = this.sharedFiles.get(data.fileId);
    
    if (!fileInfo) {
      this.sendError(ws, 'File not found');
      return;
    }

    // Update user mode to downloading
    user.mode = 'file_download';
    user.fileInfo = {
      fileId: data.fileId,
      downloadStarted: this.getNTPTime()
    };

    this.sendMessage(ws, {
      type: 'file_download_ready',
      fileId: data.fileId,
      fileName: fileInfo.name,
      fileSize: fileInfo.size,
      fileType: fileInfo.type,
      timestamp: this.getNTPTime()
    });
  }

  handleFileShare(ws, data) {
    // Handle file chunk sharing
    const session = this.sessions.get(ws);
    if (!session) return;
    
    const fileInfo = this.sharedFiles.get(data.fileId);
    if (!fileInfo) {
      this.sendError(ws, 'File not found');
      return;
    }

    // Store chunk data
    fileInfo.data.set(data.chunkIndex, data.chunkData);
    fileInfo.receivedChunks++;

    const progress = (fileInfo.receivedChunks / fileInfo.chunkCount) * 100;

    // Notify about upload progress
    this.broadcast({
      type: 'file_upload_progress',
      fileId: data.fileId,
      fileName: fileInfo.name,
      progress: Math.round(progress),
      timestamp: this.getNTPTime()
    });

    // If file complete, notify everyone
    if (fileInfo.receivedChunks >= fileInfo.chunkCount) {
      this.broadcast({
        type: 'file_available',
        fileId: data.fileId,
        fileName: fileInfo.name,
        fileSize: fileInfo.size,
        fileType: fileInfo.type,
        uploadedBy: fileInfo.uploadedBy,
        timestamp: this.getNTPTime()
      });
    }
  }

  // Screen sharing handlers
  handleScreenShareStart(ws, data) {
    const session = this.sessions.get(ws);
    if (!session) return;
    
    const user = this.users.get(session.userId);
    if (!user) return;

    // Change user mode to screen share host
    user.mode = 'screenshare_host';
    user.screenShareInfo = {
      startedAt: this.getNTPTime(),
      quality: data.quality || 'medium',
      frameRate: data.frameRate || 30
    };

    this.screenSharers.add(session.userId);

    // Notify user
    this.sendMessage(ws, {
      type: 'screenshare_started',
      userId: session.userId,
      timestamp: this.getNTPTime()
    });

    // Notify others
    this.broadcast({
      type: 'screenshare_available',
      hostId: session.userId,
      hostName: user.name,
      quality: data.quality,
      frameRate: data.frameRate,
      timestamp: this.getNTPTime()
    }, [ws]);
  }

  handleScreenShareStop(ws, data) {
    const session = this.sessions.get(ws);
    if (!session) return;
    
    const user = this.users.get(session.userId);
    if (!user) return;

    // Remove from screen sharers
    this.screenSharers.delete(session.userId);
    user.screenShareInfo = null;

    // Change mode back to observer or localplay
    user.mode = data.newMode || 'observer';

    // Notify user
    this.sendMessage(ws, {
      type: 'screenshare_stopped',
      userId: session.userId,
      timestamp: this.getNTPTime()
    });

    // Notify others
    this.broadcast({
      type: 'screenshare_ended',
      hostId: session.userId,
      hostName: user.name,
      timestamp: this.getNTPTime()
    }, [ws]);
  }

  handleScreenShareOffer(ws, data) {
    // Forward WebRTC offer to specific viewer
    const targetUser = this.users.get(data.targetUserId);
    if (targetUser && targetUser.ws) {
      this.sendMessage(targetUser.ws, {
        type: 'screenshare_offer',
        hostId: data.hostId,
        offer: data.offer,
        timestamp: this.getNTPTime()
      });
    }
  }

  handleScreenShareAnswer(ws, data) {
    // Forward WebRTC answer to host
    const targetUser = this.users.get(data.hostId);
    if (targetUser && targetUser.ws) {
      this.sendMessage(targetUser.ws, {
        type: 'screenshare_answer',
        viewerId: data.viewerId,
        answer: data.answer,
        timestamp: this.getNTPTime()
      });
    }
  }

  handleIceCandidate(ws, data) {
    // Forward ICE candidate to target user
    const targetUser = this.users.get(data.targetUserId);
    if (targetUser && targetUser.ws) {
      this.sendMessage(targetUser.ws, {
        type: 'ice_candidate',
        fromUserId: data.fromUserId,
        candidate: data.candidate,
        timestamp: this.getNTPTime()
      });
    }
  }
}