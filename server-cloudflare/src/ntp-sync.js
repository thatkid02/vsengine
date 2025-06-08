class CloudflareNTPSync {
  constructor() {
    this.timeOffset = 0;
    this.lastSync = null;
    this.ntpServers = [
      'https://timeapi.io/api/Time/current/zone?timeZone=UTC',
      'https://worldtimeapi.org/api/timezone/Etc/UTC'
    ];
  }

  /**
   * Initialize NTP synchronization
   */
  async init() {
    try {
      await this.syncTime();
      console.log('NTP sync initialized with offset:', this.timeOffset + 'ms');
      return true;
    } catch (error) {
      console.error('Failed to initialize NTP sync:', error);
      return false;
    }
  }

  /**
   * Sync with HTTP time service and calculate offset
   */
  async syncTime() {
    const maxRetries = 3;
    let lastError = null;

    for (const server of this.ntpServers) {
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          const startTime = Date.now();
          
          const response = await fetch(server, {
            method: 'GET',
            headers: {
              'User-Agent': 'VideoSyncEngine/1.0'
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const endTime = Date.now();
          const roundTripTime = endTime - startTime;
          
          const data = await response.json();
          let serverTime;

          // Parse different API formats
          if (server.includes('worldtimeapi.org')) {
            // WorldTimeAPI format: { "utc_datetime": "2025-06-08T05:04:07.801500+00:00" }
            serverTime = new Date(data.utc_datetime).getTime();
          } else if (server.includes('timeapi.io')) {
            // TimeAPI.io format: { "dateTime": "2025-06-08T05:04:16.4772212" }
            // Note: timeapi.io returns UTC time in dateTime field
            serverTime = new Date(data.dateTime + 'Z').getTime(); // Add Z to indicate UTC
          } else {
            throw new Error('Unknown time API format');
          }

          // Calculate offset accounting for network latency
          const localTime = startTime + (roundTripTime / 2);
          this.timeOffset = serverTime - localTime;
          this.lastSync = new Date();

          console.log(`NTP sync completed with ${server}`);
          console.log(`Offset: ${this.timeOffset}ms, RTT: ${roundTripTime}ms`);
          
          return this.timeOffset;

        } catch (error) {
          lastError = error;
          console.warn(`NTP sync attempt ${retry + 1} failed for ${server}:`, error.message);
          
          if (retry < maxRetries - 1) {
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retry) * 1000));
          }
        }
      }
    }

    // If all servers failed, throw the last error
    throw new Error(`All NTP servers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Get current NTP timestamp in seconds with millisecond precision
   */
  getNTPTime() {
    const localTime = Date.now();
    const ntpTime = localTime + this.timeOffset;
    return ntpTime / 1000; // Return seconds with decimal for milliseconds
  }

  /**
   * Get time offset in milliseconds
   */
  getOffset() {
    return this.timeOffset;
  }

  /**
   * Get last sync time
   */
  getLastSync() {
    return this.lastSync;
  }

  /**
   * Check if sync is recent (within last 10 minutes)
   */
  isSyncRecent() {
    if (!this.lastSync) return false;
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    return this.lastSync.getTime() > tenMinutesAgo;
  }

  /**
   * Re-sync if needed (called before critical operations)
   */
  async ensureRecentSync() {
    if (!this.isSyncRecent()) {
      try {
        await this.syncTime();
      } catch (error) {
        console.warn('Failed to re-sync time, using cached offset:', error.message);
      }
    }
  }
}

export { CloudflareNTPSync }; 