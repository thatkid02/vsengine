/**
 * Screen Sharing Module for Renderer Process
 * Handles WebRTC connections and screen capture
 */

class ScreenSharingManager {
  constructor() {
    this.localStream = null;
    this.peerConnections = new Map(); // hostId -> RTCPeerConnection
    this.isSharing = false;
    this.watchingHost = null;
    
    // WebRTC configuration
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' }
      ]
    };
  }

  /**
   * Start screen sharing
   */
  async startScreenShare(quality = 'medium', frameRate = 30) {
    try {
      // For Electron, use desktop capturer
      if (window.api && window.api.screen) {
        return await this.startElectronScreenShare(quality, frameRate);
      }
      
      // Fallback to browser getDisplayMedia if available
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        return await this.startBrowserScreenShare(quality, frameRate);
      }

      throw new Error('Screen sharing is not supported in this environment');

    } catch (error) {
      console.error('Failed to start screen sharing:', error);
      throw new Error(`Screen share failed: ${error.message}`);
    }
  }

  /**
   * Start screen sharing using Electron's desktop capturer
   */
  async startElectronScreenShare(quality = 'medium', frameRate = 30) {
    try {
      // Get available screen sources
      const sources = await window.api.screen.getSources();
      
      if (sources.length === 0) {
        throw new Error('No screens available for sharing');
      }

      // For now, use the first screen source (can be enhanced with a selector UI later)
      const source = sources.find(s => s.name.includes('Screen')) || sources[0];
      
      // Get screen dimensions based on quality
      const constraints = {
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop'
          }
        },
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id,
            minWidth: quality === 'high' ? 1920 : quality === 'medium' ? 1280 : 854,
            maxWidth: quality === 'high' ? 1920 : quality === 'medium' ? 1280 : 854,
            minHeight: quality === 'high' ? 1080 : quality === 'medium' ? 720 : 480,
            maxHeight: quality === 'high' ? 1080 : quality === 'medium' ? 720 : 480,
            minFrameRate: frameRate,
            maxFrameRate: frameRate
          }
        }
      };

      // Get user media with desktop capturer source
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Handle when user stops sharing
      this.localStream.getVideoTracks()[0].addEventListener('ended', () => {
        this.stopScreenShare();
      });

      this.isSharing = true;
      
      console.log('Electron screen sharing started successfully');
      return {
        success: true,
        stream: this.localStream,
        quality,
        frameRate,
        source: source.name
      };

    } catch (error) {
      console.error('Electron screen share error:', error);
      throw new Error(`Electron screen share failed: ${error.message}`);
    }
  }

  /**
   * Fallback browser screen sharing
   */
  async startBrowserScreenShare(quality = 'medium', frameRate = 30) {
    try {
      const constraints = {
        video: {
          width: quality === 'high' ? 1920 : quality === 'medium' ? 1280 : 854,
          height: quality === 'high' ? 1080 : quality === 'medium' ? 720 : 480,
          frameRate: frameRate,
          cursor: 'always'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      };

      this.localStream = await navigator.mediaDevices.getDisplayMedia(constraints);
      
      this.localStream.getVideoTracks()[0].addEventListener('ended', () => {
        this.stopScreenShare();
      });

      this.isSharing = true;
      
      console.log('Browser screen sharing started successfully');
      return {
        success: true,
        stream: this.localStream,
        quality,
        frameRate
      };

    } catch (error) {
      // Provide user-friendly error messages
      let message = 'Failed to start screen sharing';
      if (error.name === 'NotAllowedError') {
        message = 'Screen sharing permission denied. Please allow screen access and try again.';
      } else if (error.name === 'NotFoundError') {
        message = 'No screen available for sharing.';
      } else if (error.name === 'NotSupportedError') {
        message = 'Screen sharing is not supported in this environment.';
      }
      
      throw new Error(message);
    }
  }

  /**
   * Stop screen sharing
   */
  stopScreenShare() {
    try {
      // Stop all tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          track.stop();
        });
        this.localStream = null;
      }

      // Close all peer connections
      this.peerConnections.forEach((pc) => {
        pc.close();
      });
      this.peerConnections.clear();

      this.isSharing = false;
      
      console.log('Screen sharing stopped');
      return { success: true };
      
    } catch (error) {
      console.error('Error stopping screen share:', error);
      throw new Error('Failed to stop screen sharing');
    }
  }

  /**
   * Connect to watch someone's screen share
   */
  async connectToScreenShare(hostId) {
    try {
      if (this.peerConnections.has(hostId)) {
        throw new Error('Already connected to this host');
      }

      const peerConnection = new RTCPeerConnection(this.rtcConfig);
      this.peerConnections.set(hostId, peerConnection);

      // Set up event handlers
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          // Send ICE candidate to server
          window.api.sync.sendMessage({
            type: 'ice_candidate',
            targetUserId: hostId,
            fromUserId: window.currentUserId,
            candidate: event.candidate
          });
        }
      };

      peerConnection.ontrack = (event) => {
        console.log('Received remote stream from host:', hostId);
        this.displayRemoteStream(event.streams[0], hostId);
      };

      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') {
          this.handleConnectionFailure(hostId);
        }
      };

      // Create offer to start connection
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      // Send offer to host via server
      window.api.sync.sendMessage({
        type: 'screenshare_offer',
        hostId: hostId,
        viewerId: window.currentUserId,
        offer: offer
      });

      this.watchingHost = hostId;
      
      return { success: true, hostId };

    } catch (error) {
      console.error('Failed to connect to screen share:', error);
      throw new Error(`Failed to connect to screen share: ${error.message}`);
    }
  }

  /**
   * Handle incoming WebRTC offer (for hosts)
   */
  async handleScreenShareOffer(viewerId, offer) {
    try {
      if (!this.isSharing || !this.localStream) {
        throw new Error('Not currently sharing screen');
      }

      const peerConnection = new RTCPeerConnection(this.rtcConfig);
      this.peerConnections.set(viewerId, peerConnection);

      // Add local stream to connection
      this.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.localStream);
      });

      // Set up event handlers
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          window.api.sync.sendMessage({
            type: 'ice_candidate',
            targetUserId: viewerId,
            fromUserId: window.currentUserId,
            candidate: event.candidate
          });
        }
      };

      // Set remote description and create answer
      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // Send answer back to viewer
      window.api.sync.sendMessage({
        type: 'screenshare_answer',
        hostId: window.currentUserId,
        viewerId: viewerId,
        answer: answer
      });

      console.log('Screen share offer handled for viewer:', viewerId);

    } catch (error) {
      console.error('Failed to handle screen share offer:', error);
    }
  }

  /**
   * Handle incoming WebRTC answer (for viewers)
   */
  async handleScreenShareAnswer(hostId, answer) {
    try {
      const peerConnection = this.peerConnections.get(hostId);
      if (!peerConnection) {
        throw new Error('No peer connection found for host');
      }

      await peerConnection.setRemoteDescription(answer);
      console.log('Screen share answer handled from host:', hostId);

    } catch (error) {
      console.error('Failed to handle screen share answer:', error);
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  async handleIceCandidate(fromUserId, candidate) {
    try {
      const peerConnection = this.peerConnections.get(fromUserId);
      if (!peerConnection) {
        console.warn('No peer connection found for user:', fromUserId);
        return;
      }

      await peerConnection.addIceCandidate(candidate);
      console.log('ICE candidate added for user:', fromUserId);

    } catch (error) {
      console.error('Failed to handle ICE candidate:', error);
    }
  }

  /**
   * Display remote stream in UI
   */
  displayRemoteStream(stream, hostId) {
    const videoElement = document.getElementById('screenShareVideo');
    if (videoElement) {
      videoElement.srcObject = stream;
      videoElement.play();
      
      // Show the screen share viewer
      const viewerSection = document.getElementById('screenShareViewer');
      if (viewerSection) {
        viewerSection.style.display = 'block';
      }
      
      console.log('Displaying remote stream from host:', hostId);
    }
  }

  /**
   * Handle connection failure
   */
  handleConnectionFailure(userId) {
    console.error('Connection failed with user:', userId);
    
    const peerConnection = this.peerConnections.get(userId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(userId);
    }
    
    if (this.watchingHost === userId) {
      this.watchingHost = null;
      
      // Hide video viewer
      const viewerSection = document.getElementById('screenShareViewer');
      if (viewerSection) {
        viewerSection.style.display = 'none';
      }
    }
  }

  /**
   * Disconnect from screen share
   */
  disconnectFromScreenShare() {
    try {
      if (this.watchingHost) {
        const peerConnection = this.peerConnections.get(this.watchingHost);
        if (peerConnection) {
          peerConnection.close();
          this.peerConnections.delete(this.watchingHost);
        }
        this.watchingHost = null;
      }

      // Hide video viewer
      const viewerSection = document.getElementById('screenShareViewer');
      if (viewerSection) {
        viewerSection.style.display = 'none';
      }

      const videoElement = document.getElementById('screenShareVideo');
      if (videoElement) {
        videoElement.srcObject = null;
      }

      console.log('Disconnected from screen share');
      return { success: true };

    } catch (error) {
      console.error('Error disconnecting from screen share:', error);
      throw new Error('Failed to disconnect from screen share');
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isSharing: this.isSharing,
      watchingHost: this.watchingHost,
      connectionCount: this.peerConnections.size,
      hasLocalStream: !!this.localStream
    };
  }
}

// Create global instance
window.screenSharingManager = new ScreenSharingManager(); 