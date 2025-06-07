// Cloudflare Workers entry point for Video Sync Engine

export { SyncChannel } from './sync-channel.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Health check endpoint
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
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
        // Extract channel ID from URL or generate one
        const channelId = url.searchParams.get('channel') || 'default';
        
        // Get the Durable Object instance for this channel
        const id = env.SYNC_CHANNELS.idFromName(channelId);
        const channel = env.SYNC_CHANNELS.get(id);
        
        // Forward the WebSocket request to the Durable Object
        return channel.fetch(request);
      }

      // Default response
      return new Response('Video Sync Engine - Cloudflare Workers\n\nWebSocket endpoint: wss://your-worker.workers.dev/?channel=YOUR_CHANNEL_ID', {
        headers: {
          'Content-Type': 'text/plain',
          ...corsHeaders,
        },
      });

    } catch (error) {
      return new Response(`Error: ${error.message}`, { 
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};