# Video Sync Engine

A real-time video synchronization system that allows 5 users across different continents to watch local video files in perfect sync. One user acts as the "controller" who can seek/pause/play, and all others follow automatically.

## Features

- **Real-time Synchronization**: Sub-second latency for play/pause/seek commands
- **Cross-continental Support**: Handles users across different continents with varying network latency (50-300ms)
- **Local Video Playback**: Each user plays their own local copy of the video file
- **Single Controller Model**: One designated user controls playback, others are viewers
- **Automatic Sync Correction**: Detects and corrects drift between players
- **NTP Time Synchronization**: Uses Google NTP for global time reference
- **Beautiful UI**: Modern, dark-themed desktop application

## System Architecture

- **Time Sync**: Google NTP for universal time reference
- **Communication**: WebSocket for sync commands with WebRTC fallback
- **Video Player**: VLC integration via HTTP interface
- **Platform**: macOS only, Electron-based desktop application

## Quick Start

### Prerequisites

1. **VLC Media Player** - [Download VLC](https://www.videolan.org/vlc/)
2. **Node.js 16+** - [Download Node.js](https://nodejs.org/)
3. **macOS** - Currently only supports macOS

### Server Setup

1. Navigate to the server directory:
```bash
cd sync-video-engine/server
npm install
```

2. Start the server:
```bash
npm start
```

The server will start on port 3000 by default.

### Client Setup

1. Navigate to the client directory:
```bash
cd sync-video-engine/client
npm install
```

2. Start the Electron app:
```bash
npm start
```

## Usage

### For the Controller (First User)

1. Launch the application
2. Click "Connect" to connect to the sync server
3. Enter a Channel ID (e.g., "movie-night")
4. Click "Join Channel" - you'll automatically become the controller
5. Click "Open Video File" and select your video
6. Use play/pause/seek controls to control playback for everyone

### For Viewers

1. Launch the application
2. Click "Connect" to connect to the sync server
3. Enter the same Channel ID as the controller
4. Click "Join Channel"
5. Open the same video file on your computer
6. Your video will automatically sync with the controller

## How It Works

1. **NTP Synchronization**: All clients sync their clocks with Google's NTP server
2. **Channel Creation**: First user to join a channel becomes the controller
3. **Command Broadcasting**: Controller's play/pause/seek commands are broadcast with NTP timestamps
4. **Timed Execution**: Viewers execute commands at the specified NTP time
5. **Drift Correction**: System continuously monitors and corrects playback drift

## Technical Details

### Sync Accuracy
- Target: <1 second drift between all clients
- Command latency: <2 seconds globally
- Drift correction: Automatic with smooth playback rate adjustment

### Network Protocol
```javascript
{
  "type": "PLAY_COMMAND",
  "position": 125.45,          // Video position in seconds
  "targetTime": 1640995200.123, // NTP timestamp for execution
  "timestamp": 1640995200.000   // Current NTP time
}
```

## Troubleshooting

### VLC Not Connecting
- Make sure VLC is installed
- The app will automatically start VLC with the correct settings
- If manual start needed: `/Applications/VLC.app/Contents/MacOS/VLC --intf http --http-password vlcpassword`

### Sync Issues
- Check that all users have the exact same video file
- Ensure stable internet connection
- Verify server is accessible from all locations

## Development

### Project Structure
```
sync-video-engine/
├── server/          # WebSocket sync server
├── client/          # Electron desktop app
└── docs/           # Documentation
```

### Building from Source
```bash
# Server
cd server && npm install

# Client
cd client && npm install

# Run in development
npm run dev
```

## License

MIT License - See LICENSE file for details