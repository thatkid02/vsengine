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
- **Cloudflare Workers Support**: Deploy server on Cloudflare's edge network
- **Easy Distribution**: Build installers for macOS, Windows, and Linux

## System Architecture

- **Time Sync**: Google NTP for universal time reference
- **Communication**: WebSocket for sync commands with WebRTC fallback
- **Video Player**: VLC integration via HTTP interface
- **Platform**: macOS, Windows, Linux support via Electron
- **Server Options**: Node.js or Cloudflare Workers

## Quick Start

### Prerequisites

1. **VLC Media Player** - [Download VLC](https://www.videolan.org/vlc/)
2. **Node.js 16+** - [Download Node.js](https://nodejs.org/)

### Option 1: Traditional Server (Node.js)

#### Server Setup

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

### Option 2: Cloudflare Workers (Recommended for Production)

#### Deploy to Cloudflare

1. Navigate to the Cloudflare server directory:
```bash
cd sync-video-engine/server-cloudflare
npm install
```

2. Deploy to Cloudflare:
```bash
wrangler login
wrangler deploy
```

3. Your WebSocket URL will be:
```
wss://video-sync-engine.YOUR-SUBDOMAIN.workers.dev
```

See [Cloudflare Deployment Guide](server-cloudflare/README.md) for detailed instructions.

### Client Setup

#### For Development

1. Navigate to the client directory:
```bash
cd sync-video-engine/client
npm install
```

2. Start the Electron app:
```bash
npm start
```

#### Building Installers for Distribution

1. Navigate to the client directory:
```bash
cd sync-video-engine/client
```

2. Run the build script:
```bash
chmod +x build-installer.sh
./build-installer.sh
```

This will create:
- **macOS**: `.dmg` file for easy installation
- **Windows**: `.exe` installer
- **Linux**: `.AppImage` file

The installer files will be in the `dist/` directory.

#### For macOS Code Signing (Optional)

Set environment variables before building:
```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_ID_PASSWORD="your-app-specific-password"
export APPLE_TEAM_ID="your-team-id" # Optional
npm run dist
```

## Usage

### For the Controller (First User)

1. Launch the application
2. Enter the server URL (e.g., `wss://your-server.workers.dev`)
3. Click "Connect" to connect to the sync server
4. Enter a Channel ID (e.g., "movie-night")
5. Click "Join Channel" - you'll automatically become the controller
6. Click "Open Video File" and select your video
7. Use play/pause/seek controls to control playback for everyone

### For Viewers

1. Launch the application
2. Enter the same server URL as the controller
3. Click "Connect" to connect to the sync server
4. Enter the same Channel ID as the controller
5. Click "Join Channel"
6. Open the same video file on your computer
7. Your video will automatically sync with the controller

## Server Deployment Options

### 1. Cloudflare Workers (Recommended)
- **Pros**: Global edge network, auto-scaling, no server management
- **Cons**: 6-hour WebSocket limit, no traditional NTP
- **Cost**: Free tier includes 100k requests/day
- **Guide**: [Cloudflare Deployment](server-cloudflare/README.md)

### 2. Traditional VPS (Node.js)
- **Pros**: Full control, no time limits, traditional NTP support
- **Cons**: Manual scaling, server management required
- **Options**: DigitalOcean, AWS EC2, Heroku
- **Guide**: [Setup Guide](docs/setup-guide.md)

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

## Building from Source

### Install Dependencies
```bash
# Server (choose one)
cd server && npm install        # Node.js server
cd server-cloudflare && npm install  # Cloudflare Workers

# Client
cd client && npm install
```

### Development Mode
```bash
# Quick start script (Node.js server + client)
./start.sh

# Or manually:
# Terminal 1 - Server
cd server && npm start

# Terminal 2 - Client
cd client && npm dev
```

### Build Client Installer
```bash
cd client
./build-installer.sh  # Builds for your current platform

# Or specific platforms:
npm run dist         # macOS
npm run build -- --win   # Windows
npm run build -- --linux # Linux
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

### Build Issues
- Ensure you have the latest Node.js (16+)
- On macOS, you may need Xcode Command Line Tools
- For Windows builds on macOS/Linux, install Wine

## Documentation

- [Setup Guide](docs/setup-guide.md) - Detailed server setup
- [User Manual](docs/user-manual.md) - End-user instructions
- [Cloudflare Guide](server-cloudflare/README.md) - Cloudflare deployment

## Project Structure
```
sync-video-engine/
├── server/              # Node.js WebSocket server
├── server-cloudflare/   # Cloudflare Workers server
├── client/              # Electron desktop app
│   ├── dist/           # Built installers (after building)
│   ├── assets/         # Icons and resources
│   └── scripts/        # Build scripts
└── docs/               # Documentation
```

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
1. Check the [User Manual](docs/user-manual.md)
2. Review the [Setup Guide](docs/setup-guide.md)
3. Test with local setup first
4. Report issues with detailed steps to reproduce