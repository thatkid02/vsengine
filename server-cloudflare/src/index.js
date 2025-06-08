// Cloudflare Workers entry point for Video Sync Engine

export { SyncChannel } from './sync-channel.js';
export { CloudflareNTPSync } from './ntp-sync.js';
import { CloudflareNTPSync } from './ntp-sync.js';

// Global NTP sync instance
let ntpSync = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
      'Access-Control-Allow-Credentials': 'true',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        headers: {
          ...corsHeaders,
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    try {
      // Initialize NTP sync if not done already (but don't block WebSocket upgrades)
      if (!ntpSync) {
        ntpSync = new CloudflareNTPSync();
        // Initialize async without blocking
        ntpSync.init().catch(console.error);
      }

      // Health check endpoint
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          ntpTime: ntpSync.getNTPTime(),
          ntpOffset: ntpSync.getOffset(),
          lastSync: ntpSync.getLastSync(),
          worker: 'cloudflare',
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }

      // List channels endpoint
      if (url.pathname === '/channels') {
        // In production, you might want to store this in KV or a database
        return new Response(JSON.stringify([]), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }

      // WebSocket upgrade
      if (request.headers.get('Upgrade') === 'websocket') {
        // Extract channel ID from URL
        const channelParam = url.searchParams.get('channel');
        
        // Validate channel ID
        if (!channelParam || channelParam.trim() === '') {
          return new Response('Channel ID required', { 
            status: 400,
            headers: corsHeaders
          });
        }
        
        const channelId = channelParam.trim();
        
        // Get the Durable Object instance for this channel
        const id = env.SYNC_CHANNELS.idFromName(channelId);
        const channel = env.SYNC_CHANNELS.get(id);
        
        // Don't block on NTP sync - let it happen asynchronously
        
        // Pass NTP sync instance to the channel (with fallback values)
        const ntpOffset = ntpSync ? ntpSync.getOffset() : 0;
        const ntpTime = ntpSync ? ntpSync.getNTPTime() : Date.now() / 1000;
        

        
        // Create new headers object preserving all original headers
        const newHeaders = new Headers(request.headers);
        newHeaders.set('X-NTP-Offset', ntpOffset.toString());
        newHeaders.set('X-NTP-Time', ntpTime.toString());
        
        const modifiedRequest = new Request(request, {
          headers: newHeaders
        });
        
        // Forward the WebSocket request to the Durable Object
        return channel.fetch(modifiedRequest);
      }

      // Default response with WebSocket instructions
      return new Response(JSON.stringify({
        message: 'Video Sync Engine - Cloudflare Workers',
        websocket: {
          url: `wss://${url.hostname}/?channel=YOUR_CHANNEL_ID`,
          instructions: 'Connect to this WebSocket URL with your channel ID'
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        error: error.message,
        stack: error.stack
      }), { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
  },
};