# Video Sync Engine - Setup Guide

This guide will walk you through setting up the Video Sync Engine for your group.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [Client Setup](#client-setup)
4. [VLC Configuration](#vlc-configuration)
5. [Network Configuration](#network-configuration)
6. [Deployment](#deployment)
7. [Testing](#testing)

## Prerequisites

### Required Software
- **Node.js 16+**: Required for both server and client
- **VLC Media Player**: Latest version for macOS
- **macOS**: Currently only macOS is supported

### Network Requirements
- **Server**: Publicly accessible IP address or domain
- **Clients**: Stable broadband connection (minimum 5 Mbps)
- **Ports**: 
  - Server: Port 3000 (WebSocket)
  - VLC: Port 8080 (local HTTP interface)

## Server Setup

### 1. Clone or Download the Project
```bash
git clone <repository-url>
cd sync-video-engine/server
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Server (Optional)
Create a `.env` file for custom configuration:
```env
PORT=3000
NODE_ENV=production
```

### 4. Start the Server

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm start
```

### 5. Verify Server is Running
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "ntpOffset": 42,
  "lastSync": "2024-01-01T00:00:00.000Z",
  "channels": 0,
  "connections": 0
}
```

## Client Setup

### 1. Navigate to Client Directory
```bash
cd sync-video-engine/client
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Default Server (Optional)
Edit `main.js` to change default server URL:
```javascript
const store = new Store({
  defaults: {
    serverUrl: 'ws://your-server-ip:3000',  // Change this
    userName: 'User',
    lastVideoPath: null
  }
});
```

### 4. Build the Application

#### For Development
```bash
npm start
```

#### For Distribution
```bash
npm run dist
```

The built application will be in the `dist` folder.

## VLC Configuration

### Automatic Configuration
The application automatically configures VLC when starting. No manual setup required.

### Manual Configuration (If Needed)

1. Open VLC
2. Go to **VLC → Preferences**
3. Click **Show All** (bottom left)
4. Navigate to **Interface → Main interfaces**
5. Check **Web**
6. Go to **Interface → Main interfaces → Lua**
7. Set **Lua HTTP Password** to: `vlcpassword`
8. Save and restart VLC

### Command Line Start
```bash
/Applications/VLC.app/Contents/MacOS/VLC \
  --intf http \
  --http-host localhost \
  --http-port 8080 \
  --http-password vlcpassword \
  --extraintf macosx
```

## Network Configuration

### For Local Testing
No special configuration needed. Use `ws://localhost:3000` as server URL.

### For Remote Deployment

#### Server Side
1. **Firewall**: Open port 3000 for WebSocket connections
2. **Reverse Proxy** (Optional but recommended):

Example Nginx configuration:
```nginx
server {
    listen 80;
    server_name sync.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. **SSL/TLS** (Recommended):
```nginx
server {
    listen 443 ssl;
    server_name sync.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Client Side
Update server URL to:
- Without SSL: `ws://your-server-ip:3000`
- With SSL: `wss://sync.yourdomain.com`

## Deployment

### Server Deployment Options

#### Option 1: DigitalOcean
1. Create a droplet (Ubuntu 20.04+)
2. SSH into the server
3. Install Node.js:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```
4. Clone and setup the project
5. Use PM2 for process management:
```bash
npm install -g pm2
pm2 start server/app.js --name sync-server
pm2 save
pm2 startup
```

#### Option 2: AWS EC2
1. Launch an EC2 instance (t2.micro is sufficient)
2. Configure security group to allow port 3000
3. Follow same steps as DigitalOcean

#### Option 3: Heroku
1. Create `Procfile` in server directory:
```
web: node app.js
```
2. Deploy:
```bash
heroku create your-app-name
git push heroku main
```

### Client Distribution

1. Build the client:
```bash
cd client
npm run dist
```

2. Distribute the `.dmg` file from `dist/` folder

3. Users can download and install like any macOS application

## Testing

### 1. Local Testing
- Start server locally
- Open multiple client instances
- Use different user names
- Join same channel
- Test sync functionality

### 2. Network Latency Testing
Use network tools to simulate latency:
```bash
# On macOS, use Network Link Conditioner
# Or use tc command for testing
```

### 3. Multi-User Testing Checklist
- [ ] 5 users can join same channel
- [ ] First user becomes controller
- [ ] Play/pause commands sync within 1 second
- [ ] Seek commands execute correctly
- [ ] Controller change works when user leaves
- [ ] Reconnection works properly
- [ ] Video stays in sync over 2+ hours

### 4. Performance Monitoring
Monitor server performance:
```bash
# Check server health
curl http://your-server:3000/health

# Monitor logs
pm2 logs sync-server

# Check system resources
htop
```

## Troubleshooting

### Common Issues

#### "Cannot connect to server"
- Check server is running
- Verify firewall settings
- Test with `ws://` instead of `wss://`

#### "VLC not responding"
- Ensure VLC is installed
- Try manual VLC start with HTTP interface
- Check VLC HTTP password is correct

#### "Videos out of sync"
- Verify all users have same video file
- Check network stability
- Look for high latency in server logs

### Debug Mode
Run client in debug mode:
```bash
npm run dev
```

This opens DevTools for debugging.

## Security Considerations

1. **Server Security**:
   - Use SSL/TLS in production
   - Implement rate limiting
   - Consider adding authentication

2. **VLC Security**:
   - VLC HTTP interface is local only
   - Password is hardcoded but only accessible locally

3. **Network Security**:
   - All traffic should use WSS in production
   - Consider VPN for private groups

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review server logs
3. Test with local setup first
4. Document error messages and steps to reproduce