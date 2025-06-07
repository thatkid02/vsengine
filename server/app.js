const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const NTPSync = require('./ntp-sync');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ server });

// Initialize NTP sync
const ntpSync = new NTPSync();

// Channel management
const channels = new Map(); // channelId -> { users, controller, videoState }
const userSessions = new Map(); // ws -> { userId, channelId }

// Constants
const MAX_USERS_PER_CHANNEL = 5;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// Message types
const MessageType = {
  JOIN_CHANNEL: 'JOIN_CHANNEL',
  LEAVE_CHANNEL: 'LEAVE_CHANNEL',
  SYNC_STATE: 'SYNC_STATE',
  PLAY_COMMAND: 'PLAY_COMMAND',
  PAUSE_COMMAND: 'PAUSE_COMMAND',
  SEEK_COMMAND: 'SEEK_COMMAND',
  HEARTBEAT: 'HEARTBEAT',
  ERROR: 'ERROR',
  CHANNEL_INFO: 'CHANNEL_INFO',
  USER_JOINED: 'USER_JOINED',
  USER_LEFT: 'USER_LEFT',
  CONTROLLER_CHANGED: 'CONTROLLER_CHANGED'
};

// Video state
class VideoState {
  constructor() {
    this.position = 0;
    this.playing = false;
    this.lastUpdate = ntpSync.getNTPTime();
  }

  update(position, playing) {
    this.position = position;
    this.playing = playing;
    this.lastUpdate = ntpSync.getNTPTime();
  }

  getCurrentPosition() {
    if (this.playing) {
      const elapsed = ntpSync.getNTPTime() - this.lastUpdate;
      return this.position + elapsed;
    }
    return this.position;
  }
}

// Channel class
class Channel {
  constructor(id) {
    this.id = id;
    this.users = new Map(); // userId -> { ws, name, isController }
    this.videoState = new VideoState();
    this.controller = null;
  }

  addUser(userId, ws, name) {
    if (this.users.size >= MAX_USERS_PER_CHANNEL) {
      throw new Error('Channel is full');
    }

    this.users.set(userId, { ws, name, isController: false });

    // First user becomes controller
    if (this.users.size === 1) {
      this.setController(userId);
    }

    return true;
  }

  removeUser(userId) {
    const user = this.users.get(userId);
    if (!user) return false;

    this.users.delete(userId);

    // If controller left, assign new controller
    if (this.controller === userId && this.users.size > 0) {
      const newController = this.users.keys().next().value;
      this.setController(newController);
    }

    return true;
  }

  setController(userId) {
    // Reset previous controller
    if (this.controller) {
      const prevController = this.users.get(this.controller);
      if (prevController) {
        prevController.isController = false;
      }
    }

    // Set new controller
    this.controller = userId;
    const user = this.users.get(userId);
    if (user) {
      user.isController = true;
    }
  }

  broadcast(message, excludeUserId = null) {
    this.users.forEach((user, userId) => {
      if (userId !== excludeUserId && user.ws.readyState === 1) {
        user.ws.send(JSON.stringify(message));
      }
    });
  }

  getInfo() {
    return {
      id: this.id,
      userCount: this.users.size,
      maxUsers: MAX_USERS_PER_CHANNEL,
      controller: this.controller,
      users: Array.from(this.users.entries()).map(([userId, user]) => ({
        userId,
        name: user.name,
        isController: user.isController
      })),
      videoState: {
        position: this.videoState.getCurrentPosition(),
        playing: this.videoState.playing
      }
    };
  }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  // Send heartbeat
  const heartbeat = setInterval(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: MessageType.HEARTBEAT,
        timestamp: ntpSync.getNTPTime()
      }));
    }
  }, HEARTBEAT_INTERVAL);

  // Message handler
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(ws, message);
    } catch (error) {
      console.error('Invalid message:', error);
      ws.send(JSON.stringify({
        type: MessageType.ERROR,
        error: 'Invalid message format'
      }));
    }
  });

  // Close handler
  ws.on('close', () => {
    clearInterval(heartbeat);
    handleDisconnect(ws);
  });

  // Error handler
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clearInterval(heartbeat);
    handleDisconnect(ws);
  });
});

// Message handlers
function handleMessage(ws, message) {
  const { type, ...payload } = message;

  switch (type) {
    case MessageType.JOIN_CHANNEL:
      handleJoinChannel(ws, payload);
      break;
    case MessageType.LEAVE_CHANNEL:
      handleLeaveChannel(ws);
      break;
    case MessageType.SYNC_STATE:
      handleSyncState(ws, payload);
      break;
    case MessageType.PLAY_COMMAND:
      handlePlayCommand(ws, payload);
      break;
    case MessageType.PAUSE_COMMAND:
      handlePauseCommand(ws, payload);
      break;
    case MessageType.SEEK_COMMAND:
      handleSeekCommand(ws, payload);
      break;
    case MessageType.HEARTBEAT:
      // Echo heartbeat back
      ws.send(JSON.stringify({
        type: MessageType.HEARTBEAT,
        timestamp: ntpSync.getNTPTime()
      }));
      break;
    default:
      ws.send(JSON.stringify({
        type: MessageType.ERROR,
        error: 'Unknown message type'
      }));
  }
}

function handleJoinChannel(ws, { channelId, userId, userName }) {
  // Validate input
  if (!channelId || !userId || !userName) {
    ws.send(JSON.stringify({
      type: MessageType.ERROR,
      error: 'Missing required fields'
    }));
    return;
  }

  // Check if user already in a channel
  if (userSessions.has(ws)) {
    handleLeaveChannel(ws);
  }

  // Get or create channel
  let channel = channels.get(channelId);
  if (!channel) {
    channel = new Channel(channelId);
    channels.set(channelId, channel);
  }

  // Try to add user
  try {
    channel.addUser(userId, ws, userName);
    userSessions.set(ws, { userId, channelId });

    // Send channel info to new user
    ws.send(JSON.stringify({
      type: MessageType.CHANNEL_INFO,
      channel: channel.getInfo(),
      timestamp: ntpSync.getNTPTime()
    }));

    // Notify others
    channel.broadcast({
      type: MessageType.USER_JOINED,
      userId,
      userName,
      timestamp: ntpSync.getNTPTime()
    }, userId);

    console.log(`User ${userName} (${userId}) joined channel ${channelId}`);
  } catch (error) {
    ws.send(JSON.stringify({
      type: MessageType.ERROR,
      error: error.message
    }));
  }
}

function handleLeaveChannel(ws) {
  const session = userSessions.get(ws);
  if (!session) return;

  const { userId, channelId } = session;
  const channel = channels.get(channelId);
  
  if (channel) {
    const user = channel.users.get(userId);
    const wasController = channel.controller === userId;
    
    channel.removeUser(userId);
    
    // Notify others
    channel.broadcast({
      type: MessageType.USER_LEFT,
      userId,
      userName: user?.name,
      timestamp: ntpSync.getNTPTime()
    });

    // If controller changed, notify
    if (wasController && channel.controller) {
      channel.broadcast({
        type: MessageType.CONTROLLER_CHANGED,
        newController: channel.controller,
        timestamp: ntpSync.getNTPTime()
      });
    }

    // Remove empty channels
    if (channel.users.size === 0) {
      channels.delete(channelId);
    }
  }

  userSessions.delete(ws);
}

function handleSyncState(ws, { position, playing }) {
  const session = userSessions.get(ws);
  if (!session) return;

  const channel = channels.get(session.channelId);
  if (!channel) return;

  // Only controller can update state
  if (channel.controller !== session.userId) {
    ws.send(JSON.stringify({
      type: MessageType.ERROR,
      error: 'Only controller can update sync state'
    }));
    return;
  }

  // Update video state
  channel.videoState.update(position, playing);

  // Broadcast to all users
  channel.broadcast({
    type: MessageType.SYNC_STATE,
    position,
    playing,
    timestamp: ntpSync.getNTPTime()
  });
}

function handlePlayCommand(ws, { position, targetTime }) {
  const session = userSessions.get(ws);
  if (!session) return;

  const channel = channels.get(session.channelId);
  if (!channel) return;

  // Only controller can issue commands
  if (channel.controller !== session.userId) {
    ws.send(JSON.stringify({
      type: MessageType.ERROR,
      error: 'Only controller can issue play commands'
    }));
    return;
  }

  // Update state
  channel.videoState.update(position, true);

  // Broadcast command
  channel.broadcast({
    type: MessageType.PLAY_COMMAND,
    position,
    targetTime: targetTime || ntpSync.getNTPTime() + 0.1, // 100ms in future
    timestamp: ntpSync.getNTPTime()
  });
}

function handlePauseCommand(ws, { position }) {
  const session = userSessions.get(ws);
  if (!session) return;

  const channel = channels.get(session.channelId);
  if (!channel) return;

  // Only controller can issue commands
  if (channel.controller !== session.userId) {
    ws.send(JSON.stringify({
      type: MessageType.ERROR,
      error: 'Only controller can issue pause commands'
    }));
    return;
  }

  // Update state
  channel.videoState.update(position, false);

  // Broadcast command
  channel.broadcast({
    type: MessageType.PAUSE_COMMAND,
    position,
    timestamp: ntpSync.getNTPTime()
  });
}

function handleSeekCommand(ws, { position, targetTime }) {
  const session = userSessions.get(ws);
  if (!session) return;

  const channel = channels.get(session.channelId);
  if (!channel) return;

  // Only controller can issue commands
  if (channel.controller !== session.userId) {
    ws.send(JSON.stringify({
      type: MessageType.ERROR,
      error: 'Only controller can issue seek commands'
    }));
    return;
  }

  // Update state
  channel.videoState.update(position, channel.videoState.playing);

  // Broadcast command
  channel.broadcast({
    type: MessageType.SEEK_COMMAND,
    position,
    targetTime: targetTime || ntpSync.getNTPTime() + 0.2, // 200ms in future
    timestamp: ntpSync.getNTPTime()
  });
}

function handleDisconnect(ws) {
  handleLeaveChannel(ws);
  console.log('WebSocket disconnected');
}

// REST API endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ntpOffset: ntpSync.getOffset(),
    lastSync: ntpSync.getLastSync(),
    channels: channels.size,
    connections: wss.clients.size
  });
});

app.get('/channels', (req, res) => {
  const channelList = Array.from(channels.values()).map(channel => ({
    id: channel.id,
    userCount: channel.users.size,
    maxUsers: MAX_USERS_PER_CHANNEL
  }));
  res.json(channelList);
});

// Start server
async function startServer() {
  try {
    // Initialize NTP sync
    await ntpSync.init();
    
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`WebSocket server ready`);
      console.log(`NTP sync active with offset: ${ntpSync.getOffset()}ms`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    ntpSync.destroy();
    console.log('Server closed');
  });
});

// Start the server
startServer();