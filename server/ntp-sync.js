const ntpClient = require('ntp-client');

class NTPSync {
  constructor() {
    this.timeOffset = 0;
    this.lastSync = null;
    this.syncInterval = null;
    this.ntpServer = 'time.google.com';
    this.ntpPort = 123;
  }

  /**
   * Initialize NTP synchronization
   */
  async init() {
    try {
      await this.syncTime();
      
      // Re-sync every 5 minutes
      this.syncInterval = setInterval(() => {
        this.syncTime();
      }, 5 * 60 * 1000);
      
      console.log('NTP sync initialized with', this.ntpServer);
      return true;
    } catch (error) {
      console.error('Failed to initialize NTP sync:', error);
      return false;
    }
  }

  /**
   * Sync with NTP server and calculate offset
   */
  async syncTime() {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      ntpClient.getNetworkTime(this.ntpServer, this.ntpPort, (err, date) => {
        if (err) {
          console.error('NTP sync error:', err);
          reject(err);
          return;
        }

        const endTime = Date.now();
        const roundTripTime = endTime - startTime;
        const ntpTime = date.getTime();
        const localTime = startTime + (roundTripTime / 2);
        
        this.timeOffset = ntpTime - localTime;
        this.lastSync = new Date();
        
        console.log(`NTP sync completed. Offset: ${this.timeOffset}ms, RTT: ${roundTripTime}ms`);
        resolve(this.timeOffset);
      });
    });
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
   * Cleanup
   */
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

module.exports = NTPSync;