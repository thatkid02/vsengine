# Video Sync Engine - Cloudflare Workers Deployment

This is the Cloudflare Workers version of the Video Sync Engine server, using Durable Objects for WebSocket support.

## Prerequisites

1. **Cloudflare Account** with Workers subscription
2. **Wrangler CLI** installed (`npm install -g wrangler`)
3. **Node.js 16+** for development

## Quick Deploy

### 1. Install Dependencies
```bash
cd server-cloudflare
npm install
```

### 2. Configure Wrangler
```bash
# Login to Cloudflare
wrangler login

# Update wrangler.toml with your settings:
# - Change 'name' if desired
# - Update route pattern or use workers.dev
```

### 3. Deploy to Cloudflare
```bash
# Deploy to production
npm run deploy

# Or deploy to workers.dev for testing
wrangler deploy
```

### 4. Get Your WebSocket URL
After deployment, you'll get a URL like:
- `https://video-sync-engine.YOUR-SUBDOMAIN.workers.dev`
- Or your custom domain if configured

The WebSocket endpoint will be:
- `wss://video-sync-engine.YOUR-SUBDOMAIN.workers.dev/?channel=CHANNEL_ID`

## Configuration

### Edit `wrangler.toml`:

```toml
name = "your-app-name"  # Change this to your app name

# For custom domain:
route = { pattern = "sync.yourdomain.com/*", zone_name = "yourdomain.com" }

# Or use workers.dev:
workers_dev = true
```

## Client Configuration

Update your client to use the Cloudflare Workers URL:

```javascript
// In your client settings
const serverUrl = 'wss://video-sync-engine.YOUR-SUBDOMAIN.workers.dev';
```

## How It Works

1. **Durable Objects**: Each channel is a separate Durable Object instance
2. **WebSocket Routing**: Channels are routed via URL parameter: `?channel=CHANNEL_ID`
3. **Automatic Scaling**: Cloudflare handles scaling automatically
4. **Global Network**: Low latency worldwide through Cloudflare's edge network

## Features

- ✅ WebSocket support via Durable Objects
- ✅ Automatic scaling
- ✅ Global edge network
- ✅ No server management
- ✅ Built-in DDoS protection
- ✅ 100k requests/day free tier

## Monitoring

### View Logs
```bash
# Real-time logs
npm run tail

# Or
wrangler tail
```

### Dashboard
View metrics at: https://dash.cloudflare.com/workers

## Costs

- **Free Tier**: 100,000 requests/day, 10ms CPU time per request
- **Paid Plan**: $5/month for 10 million requests
- **Durable Objects**: $0.15/GB storage + request costs

## Limitations

- No traditional NTP (uses Cloudflare's synchronized time)
- 1MB WebSocket message size limit
- 6 hour maximum WebSocket duration
- CPU time limits per request

## Troubleshooting

### "Durable Objects not enabled"
Enable Durable Objects in your Cloudflare dashboard under Workers settings.

### "Route pattern invalid"
Ensure you own the domain and it's active in Cloudflare.

### WebSocket connection fails
- Check CORS headers if connecting from browser
- Ensure using `wss://` protocol
- Verify channel parameter is included

## Development

### Local Testing
```bash
npm run dev
# Visit http://localhost:3000
```

### Deploy to Staging
```bash
wrangler deploy --env staging
```

## Security

- All connections use TLS/WSS
- No data persistence (sessions only)
- Cloudflare's built-in security features
- Rate limiting available through Cloudflare

## Support

For Cloudflare-specific issues:
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects Guide](https://developers.cloudflare.com/workers/learning/using-durable-objects/)

## Migration from Node.js Server

The Cloudflare Workers version is compatible with the original Node.js server protocol. Simply update the WebSocket URL in your client configuration.