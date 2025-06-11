let state = {
  connected: false,
  inChannel: false,
  vlcConnected: false,
  currentVideo: null,
  videoStatus: null,
  syncStatus: null,
  userMode: 'localplay',
  users: new Map(),
  sharedFiles: new Map(),
  screenSharers: new Set(),
  isScreenSharing: false,
  watchingScreenShare: null
};

// DOM Elements
const elements = {
  // Connection
  syncStatus: document.getElementById('syncStatus'),
  syncStatusText: document.getElementById('syncStatusText'),
  
  // Forms
  serverUrl: document.getElementById('serverUrl'),
  userName: document.getElementById('userName'),
  channelId: document.getElementById('channelId'),
  
  // Buttons
  connectBtn: document.getElementById('connectBtn'),
  joinChannelBtn: document.getElementById('joinChannelBtn'),
  leaveChannelBtn: document.getElementById('leaveChannelBtn'),
  playBtn: document.getElementById('playBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  openVideoBtn: document.getElementById('openVideoBtn'),
  startVLCBtn: document.getElementById('startVLCBtn'),
  
  // Channel Info
  channelInfo: document.getElementById('channelInfo'),
  currentChannel: document.getElementById('currentChannel'),
  userRole: document.getElementById('userRole'),
  userCount: document.getElementById('userCount'),
  usersList: document.getElementById('usersList'),
  
  // Video Info
  vlcStatus: document.getElementById('vlcStatus'),
  currentVideo: document.getElementById('currentVideo'),
  currentTime: document.getElementById('currentTime'),
  totalTime: document.getElementById('totalTime'),
  seekBar: document.getElementById('seekBar'),
  volumeSlider: document.getElementById('volumeSlider'),
  
  // Status
  ntpOffset: document.getElementById('ntpOffset'),
  syncAccuracy: document.getElementById('syncAccuracy'),
  syncIndicator: document.getElementById('syncIndicator'),
  
  // New enhanced elements
  userMode: document.getElementById('userMode'),
  changeModeBtn: document.getElementById('changeModeBtn'),
  currentMode: document.getElementById('currentMode'),
  modeStatus: document.getElementById('modeStatus'),
  
  // File sharing elements
  fileSharingSection: document.getElementById('fileSharingSection'),
  fileInput: document.getElementById('fileInput'),
  uploadFileBtn: document.getElementById('uploadFileBtn'),
  uploadProgress: document.getElementById('uploadProgress'),
  uploadProgressBar: document.getElementById('uploadProgressBar'),
  uploadStatus: document.getElementById('uploadStatus'),
  filesList: document.getElementById('filesList'),
  
  // Screen sharing elements
  screenSharingSection: document.getElementById('screenSharingSection'),
  screenQuality: document.getElementById('screenQuality'),
  startScreenShareBtn: document.getElementById('startScreenShareBtn'),
  stopScreenShareBtn: document.getElementById('stopScreenShareBtn'),
  screensList: document.getElementById('screensList'),
  screenShareViewer: document.getElementById('screenShareViewer'),
  screenShareVideo: document.getElementById('screenShareVideo')
};

// Global variables for screen sharing
window.currentUserId = null;

// Initialize
async function init() {
  // Load settings
  const settings = await window.api.getSettings();
  elements.serverUrl.value = settings.serverUrl;
  elements.userName.value = settings.userName;
  
  // Setup event listeners
  setupEventListeners();
  
  // Setup IPC listeners
  setupIPCListeners();

  // Initialize input fields
  const serverUrlInput = document.getElementById('serverUrl');
  const userNameInput = document.getElementById('userName');
  const channelIdInput = document.getElementById('channelId');

  // Enable paste operations
  [serverUrlInput, userNameInput, channelIdInput].forEach(input => {
    // Remove any existing event listeners
    input.removeEventListener('paste', handlePaste);
    input.removeEventListener('keydown', handleKeyDown);

    // Add paste event listener
    input.addEventListener('paste', handlePaste);
    
    // Add keyboard shortcut listener
    input.addEventListener('keydown', handleKeyDown);
  });

  // Paste event handler
  function handlePaste(e) {
    // Don't prevent default - allow the paste to happen
    console.log('Paste event triggered');
  }

  // Keyboard shortcut handler
  function handleKeyDown(e) {
    // Allow Cmd+V (Mac) or Ctrl+V (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
      console.log('Paste shortcut triggered');
      // Don't prevent default - allow the paste to happen
    }
  }

  // Load saved settings
  window.api.getSettings().then(settings => {
    serverUrlInput.value = settings.serverUrl || '';
    userNameInput.value = settings.userName || '';
  });
}

// Event Listeners
function setupEventListeners() {
  // Connection
  elements.connectBtn.addEventListener('click', handleConnect);
  elements.joinChannelBtn.addEventListener('click', handleJoinChannel);
  elements.leaveChannelBtn.addEventListener('click', handleLeaveChannel);
  
  // Video Controls
  elements.playBtn.addEventListener('click', handlePlay);
  elements.pauseBtn.addEventListener('click', handlePause);
  elements.openVideoBtn.addEventListener('click', handleOpenVideo);
  elements.startVLCBtn.addEventListener('click', handleStartVLC);
  
  // Seek bar
  elements.seekBar.addEventListener('input', handleSeek);
  elements.seekBar.addEventListener('change', handleSeekEnd);
  
  // Volume
  elements.volumeSlider.addEventListener('input', handleVolumeChange);
  
  // Save settings on change
  elements.serverUrl.addEventListener('change', saveSettings);
  elements.userName.addEventListener('change', saveSettings);
  
  // New enhanced event listeners
  elements.changeModeBtn.addEventListener('click', handleChangeMode);
  elements.uploadFileBtn.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', handleFileUpload);
  elements.startScreenShareBtn.addEventListener('click', handleStartScreenShare);
  elements.stopScreenShareBtn.addEventListener('click', handleStopScreenShare);
}

// IPC Listeners
function setupIPCListeners() {
  // Sync events
  window.api.sync.onConnected(() => {
    state.connected = true;
    updateConnectionUI();
    showNotification('Connected to sync server', 'success');
    setTimeout(updateNTPStatus, 1000);
  });
  
  window.api.sync.onDisconnected(() => {
    state.connected = false;
    state.inChannel = false;
    updateConnectionUI();
    showNotification('Disconnected from sync server', 'error');
  });
  
  window.api.sync.onChannelInfo((info) => {
    state.inChannel = true;
    updateChannelUI(info);
    updateNTPStatus();
    updateModeButtons();
  });
  
  window.api.sync.onWelcome && window.api.sync.onWelcome((data) => {
    state.inChannel = true;
    state.userMode = data.userMode;
    
    // Store current user ID globally for screen sharing
    window.currentUserId = data.userId;
    
    // Update UI with enhanced data
    updateModeUI(data.userMode);
    updateUsersList(data.users);
    updateSharedFilesList(data.sharedFiles);
    updateScreenSharesList(data.screenSharers);
    
    elements.channelInfo.style.display = 'block';
    elements.joinChannelBtn.style.display = 'none';
    elements.leaveChannelBtn.style.display = 'inline-block';
    
    showNotification(`Joined channel as ${getModeDisplayName(data.userMode)}`, 'success');
  });
  
  window.api.sync.onUserJoined((data) => {
    if (data.user) {
      state.users.set(data.user.id, data.user);
      updateUsersList(Array.from(state.users.values()));
      showNotification(`${data.user.name} joined the channel`, 'info');
    } else {
      // Legacy format
      showNotification(`${data.userName} joined the channel`, 'info');
    }
    
    if (data.screenSharers) {
      state.screenSharers = new Set(data.screenSharers);
      updateScreenSharesList(Array.from(state.screenSharers));
    }
  });
  
  window.api.sync.onUserLeft((data) => {
    state.users.delete(data.userId);
    state.screenSharers.delete(data.userId);
    updateUsersList(Array.from(state.users.values()));
    updateScreenSharesList(Array.from(state.screenSharers));
    showNotification(`${data.userName} left the channel`, 'info');
  });
  
  window.api.sync.onControllerChanged((data) => {
    updateUsersList();
    showNotification('Controller changed', 'info');
  });
  
  window.api.sync.onError((error) => {
    showNotification(`Error: ${error}`, 'error');
  });
  
  // VLC events
  window.api.vlc.onConnected((connected) => {
    state.vlcConnected = connected;
    updateVLCStatus();
  });
  
  window.api.vlc.onStatus((status) => {
    state.videoStatus = status;
    updateVideoStatus(status);
  });
  
  window.api.onVideoOpened((filename) => {
    state.currentVideo = filename;
    elements.currentVideo.textContent = filename;
  });
  
  // New enhanced event handlers
  window.api.sync.onModeChanged && window.api.sync.onModeChanged((data) => {
    updateModeUI(data.newMode);
    showNotification(`Mode changed to ${getModeDisplayName(data.newMode)}`, 'success');
  });
  
  window.api.sync.onUserModeChanged && window.api.sync.onUserModeChanged((data) => {
    const user = state.users.get(data.userId);
    if (user) {
      user.mode = data.newMode;
      updateUsersList(Array.from(state.users.values()));
    }
    
    if (data.screenSharers) {
      state.screenSharers = new Set(data.screenSharers);
      updateScreenSharesList(Array.from(state.screenSharers));
    }
    
    showNotification(`${data.userName} switched to ${getModeDisplayName(data.newMode)}`, 'info');
  });
  
  // File sharing events
  window.api.sync.onFileAvailable && window.api.sync.onFileAvailable((data) => {
    state.sharedFiles.set(data.fileId, data);
    updateSharedFilesList(Array.from(state.sharedFiles.values()));
    showNotification(`File available: ${data.fileName}`, 'success');
  });
  
  window.api.sync.onFileUploadProgress && window.api.sync.onFileUploadProgress((data) => {
    if (data.progress === 100) {
      elements.uploadProgress.style.display = 'none';
    } else {
      elements.uploadProgressBar.style.width = `${data.progress}%`;
      elements.uploadStatus.textContent = `${data.fileName}: ${data.progress}%`;
    }
  });
  
  // Screen sharing events
  window.api.sync.onScreenShareAvailable && window.api.sync.onScreenShareAvailable((data) => {
    state.screenSharers.add(data.hostId);
    updateScreenSharesList(Array.from(state.screenSharers));
    showNotification(`${data.hostName} is sharing their screen`, 'info');
  });
  
  window.api.sync.onScreenShareEnded && window.api.sync.onScreenShareEnded((data) => {
    state.screenSharers.delete(data.hostId);
    updateScreenSharesList(Array.from(state.screenSharers));
    
    if (state.watchingScreenShare === data.hostId) {
      state.watchingScreenShare = null;
      elements.screenShareViewer.style.display = 'none';
    }
    
    showNotification(`${data.hostName} stopped sharing`, 'info');
  });
  
  // WebRTC signaling events for screen sharing
  window.api.sync.onScreenShareOffer && window.api.sync.onScreenShareOffer((data) => {
    if (window.screenSharingManager) {
      window.screenSharingManager.handleScreenShareOffer(data.viewerId, data.offer);
    }
  });
  
  window.api.sync.onScreenShareAnswer && window.api.sync.onScreenShareAnswer((data) => {
    if (window.screenSharingManager) {
      window.screenSharingManager.handleScreenShareAnswer(data.hostId, data.answer);
    }
  });
  
  window.api.sync.onIceCandidate && window.api.sync.onIceCandidate((data) => {
    if (window.screenSharingManager) {
      window.screenSharingManager.handleIceCandidate(data.fromUserId, data.candidate);
    }
  });
  
  window.api.sync.onScreenShareReceived && window.api.sync.onScreenShareReceived((data) => {
    elements.screenShareVideo.srcObject = data.stream;
    elements.screenShareViewer.style.display = 'block';
    showNotification('Screen share connected', 'success');
  });
}

// Handlers
async function handleConnect() {
  try {
    if (!state.connected) {
      // Show loading state
      elements.connectBtn.disabled = true;
      elements.connectBtn.innerHTML = `
        <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
          <path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"/>
        </svg>
        Connecting...
      `;
      
      await window.api.sync.connect();
      elements.connectBtn.textContent = 'Disconnect';
      elements.connectBtn.classList.add('connected');
    } else {
      // Show loading state for disconnect
      elements.connectBtn.disabled = true;
      elements.connectBtn.innerHTML = `
        <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
          <path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"/>
        </svg>
        Disconnecting...
      `;
      
      await window.api.sync.disconnect();
      elements.connectBtn.textContent = 'Connect';
      elements.connectBtn.classList.remove('connected');
    }
  } catch (error) {
    showNotification(`Connection failed: ${error.message}`, 'error');
    // Reset button state on error
    if (state.connected) {
      elements.connectBtn.textContent = 'Disconnect';
      elements.connectBtn.classList.add('connected');
    } else {
      elements.connectBtn.textContent = 'Connect';
      elements.connectBtn.classList.remove('connected');
    }
  } finally {
    elements.connectBtn.disabled = false;
  }
}

async function handleJoinChannel() {
  const channelId = elements.channelId.value.trim();
  const userName = elements.userName.value.trim();
  const mode = elements.userMode.value;
  
  if (!channelId || !userName) {
    showNotification('Please enter channel ID and username', 'error');
    return;
  }
  
  if (!state.connected) {
    showNotification('Please connect to server first', 'error');
    return;
  }
  
  try {
    elements.joinChannelBtn.disabled = true;
    elements.joinChannelBtn.innerHTML = `
      <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
        <path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"/>
      </svg>
      Joining...
    `;
    
    elements.channelId.disabled = true;
    elements.userName.disabled = true;
    
    // Use enhanced join method if available
    if (window.api.sync.joinChannelWithMode) {
      await window.api.sync.joinChannelWithMode(channelId, userName, mode);
    } else {
      await window.api.sync.joinChannel(channelId, userName);
    }
    
    state.inChannel = true;
    updateModeUI(mode);
    updateModeButtons();
    
  } catch (error) {
    showNotification(`Failed to join channel: ${error.message}`, 'error');
    
    elements.joinChannelBtn.disabled = false;
    elements.joinChannelBtn.textContent = 'Join Channel';
    elements.channelId.disabled = false;
    elements.userName.disabled = false;
  }
}

async function handleLeaveChannel() {
  try {
    // Show loading state
    elements.leaveChannelBtn.disabled = true;
    elements.leaveChannelBtn.innerHTML = `
      <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
        <path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"/>
      </svg>
      Leaving...
    `;
    
    await window.api.sync.leaveChannel();
    state.inChannel = false;
    
    // Reset UI to initial state
    elements.channelInfo.style.display = 'none';
    elements.joinChannelBtn.style.display = 'inline-block';
    elements.joinChannelBtn.disabled = false;
    elements.joinChannelBtn.textContent = 'Join Channel';
    elements.leaveChannelBtn.style.display = 'none';
    elements.channelId.disabled = false;
    elements.userName.disabled = false;
    
    updateChannelUI(null);
    showNotification('Left channel successfully', 'success');
    
  } catch (error) {
    showNotification(`Failed to leave channel: ${error.message}`, 'error');
    
    // Reset button on error
    elements.leaveChannelBtn.disabled = false;
    elements.leaveChannelBtn.textContent = 'Leave Channel';
  }
}

async function handlePlay() {
  if (!state.vlcConnected) return;
  
  try {
    const status = await window.api.vlc.getStatus();
    await window.api.vlc.play();
    
    // Only send sync command if in a channel
    if (state.inChannel) {
      await window.api.sync.sendPlay(status.position);
    }
    
    showNotification('Video playing', 'success');
  } catch (error) {
    showNotification(`Play failed: ${error.message}`, 'error');
  }
}

async function handlePause() {
  if (!state.vlcConnected) return;
  
  try {
    const status = await window.api.vlc.getStatus();
    await window.api.vlc.pause();
    
    // Only send sync command if in a channel
    if (state.inChannel) {
      await window.api.sync.sendPause(status.position);
    }
    
    showNotification('Video paused', 'success');
  } catch (error) {
    showNotification(`Pause failed: ${error.message}`, 'error');
  }
}

async function handleOpenVideo() {
  try {
    const result = await window.api.vlc.openFile();
    if (result) {
      showNotification('Video opened successfully', 'success');
    } else {
      showNotification('Failed to open video', 'error');
    }
  } catch (error) {
    showNotification(`Error opening video: ${error.message}`, 'error');
  }
}

async function handleStartVLC() {
  try {
    elements.startVLCBtn.disabled = true;
    elements.startVLCBtn.textContent = 'Starting VLC...';
    
    const result = await window.api.vlc.start();
    if (result) {
      showNotification('VLC started successfully', 'success');
      state.vlcConnected = true;
      updateVLCStatus();
    } else {
      showNotification('Failed to start VLC', 'error');
    }
  } catch (error) {
    showNotification(`Failed to start VLC: ${error.message}`, 'error');
  } finally {
    elements.startVLCBtn.disabled = false;
    elements.startVLCBtn.textContent = 'Start VLC';
  }
}

let isSeeking = false;
async function handleSeek(event) {
  if (!state.vlcConnected || !state.videoStatus) return;
  
  const seekPercent = event.target.value;
  const seekTime = (seekPercent / 100) * state.videoStatus.length;
  
  // Update time display immediately for better UX
  elements.currentTime.textContent = formatTime(seekTime);
}

async function handleSeekEnd(event) {
  if (!state.vlcConnected || !state.videoStatus) return;
  
  try {
    const seekPercent = event.target.value;
    const seekTime = (seekPercent / 100) * state.videoStatus.length;
    
    await window.api.vlc.seek(seekTime);
    if (state.inChannel) {
      await window.api.sync.sendSeek(seekTime);
    }
  } catch (error) {
    showNotification(`Failed to seek: ${error.message}`, 'error');
  }
}

async function handleVolumeChange(event) {
  if (!state.vlcConnected) return;
  
  try {
    const volume = parseInt(event.target.value);
    await window.api.vlc.setVolume(volume);
  } catch (error) {
    showNotification(`Failed to change volume: ${error.message}`, 'error');
  }
}

// UI Updates
function updateConnectionUI() {
  if (state.connected) {
    elements.syncStatus.classList.add('connected');
    elements.syncStatusText.textContent = 'Connected';
    elements.connectBtn.textContent = 'Disconnect';
    elements.connectBtn.classList.add('connected');
    elements.joinChannelBtn.disabled = false;
    
    // Show success state briefly
    elements.connectBtn.classList.add('success');
    setTimeout(() => {
      elements.connectBtn.classList.remove('success');
    }, 2000);
    
  } else {
    elements.syncStatus.classList.remove('connected');
    elements.syncStatusText.textContent = 'Disconnected';
    elements.connectBtn.textContent = 'Connect';
    elements.connectBtn.classList.remove('connected');
    elements.joinChannelBtn.disabled = true;
    
    // Reset channel UI
    elements.channelInfo.style.display = 'none';
    elements.joinChannelBtn.style.display = 'inline-block';
    elements.joinChannelBtn.textContent = 'Join Channel';
    elements.leaveChannelBtn.style.display = 'none';
    elements.channelId.disabled = false;
    elements.userName.disabled = false;
    state.inChannel = false;
  }
}

function updateChannelUI(info) {
  if (!info) {
    elements.channelInfo.style.display = 'none';
    return;
  }
  
  elements.channelInfo.style.display = 'block';
  elements.currentChannel.textContent = info.id;
  elements.userCount.textContent = info.userCount;
  
  // Update role badge
  const isController = info.users.find(u => u.userId === info.controller)?.userId === 
                      info.users.find(u => u.isController)?.userId;
  elements.userRole.textContent = isController ? 'Controller' : 'Viewer';
  elements.userRole.className = `role-badge ${isController ? 'controller' : ''}`;
  
  // Update users list
  elements.usersList.innerHTML = '';
  info.users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user.name;
    elements.usersList.appendChild(li);
  });
  
  // Update controls based on role
  updateControlsForRole();
}

function updateControlsForRole() {
  if (state.inChannel) {
    // In channel mode, enable controls if VLC is connected and has video
    const hasVideo = state.videoStatus && state.videoStatus.currentFile;
    elements.playBtn.disabled = !state.vlcConnected || !hasVideo;
    elements.pauseBtn.disabled = !state.vlcConnected || !hasVideo;
    elements.seekBar.disabled = !state.vlcConnected || !hasVideo;
    elements.syncIndicator.style.display = 'block';
  } else {
    elements.syncIndicator.style.display = 'none';
    // When not in channel, use regular VLC status
    updateVLCStatus();
  }
}

function updateVLCStatus() {
  const status = state.vlcConnected ? 'Connected' : 'Not Connected';
  elements.vlcStatus.textContent = status;
  elements.vlcStatus.className = `status-text ${state.vlcConnected ? 'connected' : 'disconnected'}`;
  
  // Update control buttons based on VLC connection and video status
  const hasVideo = state.videoStatus && state.videoStatus.currentFile;
  elements.playBtn.disabled = !state.vlcConnected || !hasVideo;
  elements.pauseBtn.disabled = !state.vlcConnected || !hasVideo;
  elements.openVideoBtn.disabled = !state.vlcConnected;
  elements.seekBar.disabled = !state.vlcConnected || !hasVideo;
}

function updateVideoStatus(status) {
  if (!status) return;
  
  // Store the status in state
  state.videoStatus = status;
  
  // Update video info
  elements.currentVideo.textContent = status.currentFile || 'No video loaded';
  
  // Update time display
  elements.currentTime.textContent = formatTime(status.position);
  elements.totalTime.textContent = formatTime(status.length);
  
  // Update seek bar
  const progress = status.length > 0 ? (status.position / status.length) * 100 : 0;
  elements.seekBar.value = progress;
  
  // Update play/pause buttons visibility
  elements.playBtn.style.display = status.playing ? 'none' : 'block';
  elements.pauseBtn.style.display = status.playing ? 'block' : 'none';
  
  // Update volume slider
  const volumePercent = Math.round((status.volume / 256) * 100);
  elements.volumeSlider.value = volumePercent;
  
  // Show error if any
  if (status.error) {
    showNotification(`VLC Error: ${status.error}`, 'error');
  }
  
  // Update sync indicator
  if (state.inChannel && status.playing) {
    elements.syncIndicator.style.display = 'block';
  } else {
    elements.syncIndicator.style.display = 'none';
  }
  
  // Update button states based on video availability
  updateVLCStatus();
}

function updateVideoControls() {
  if (state.vlcConnected) {
    elements.playBtn.disabled = false;
    elements.pauseBtn.disabled = false;
    elements.seekBar.disabled = false;
  }
}

async function updateUsersList(users = []) {
  elements.usersList.innerHTML = '';
  
  // Convert users array to Map for easier access
  state.users.clear();
  users.forEach(user => {
    state.users.set(user.id || user.userId, user);
  });
  
  users.forEach(user => {
    const userItem = document.createElement('div');
    userItem.className = 'user-item';
    
    const modeClass = user.mode || 'localplay';
    const statusClass = modeClass === 'screenshare_host' ? 'screenshare' :
                       modeClass === 'screenshare_viewer' ? 'viewer' :
                       modeClass === 'file_download' ? 'downloading' :
                       modeClass === 'observer' ? 'observer' : '';
    
    userItem.innerHTML = `
      <div class="user-info">
        <div class="user-name">${user.name || user.userName}</div>
        <div class="user-mode">${getModeDisplayName(user.mode || 'localplay')}</div>
      </div>
      <div class="user-status">
        <div class="status-indicator ${statusClass}"></div>
      </div>
    `;
    elements.usersList.appendChild(userItem);
  });
}

// Utilities
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  const container = document.getElementById('notificationContainer');
  container.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

async function saveSettings() {
  await window.api.saveSettings({
    serverUrl: elements.serverUrl.value,
    userName: elements.userName.value
  });
}

// Connect to server
async function connectToServer() {
  const serverUrl = document.getElementById('serverUrl').value.trim();
  const userName = document.getElementById('userName').value.trim();
  
  if (!serverUrl) {
    showNotification('Please enter a server URL', 'error');
    return;
  }
  
  if (!userName) {
    showNotification('Please enter your name', 'error');
    return;
  }

  try {
    updateSyncStatus('Connecting...', 'connecting');
    await syncClient.connect();
    updateSyncStatus('Connected', 'connected');
    document.getElementById('joinChannelBtn').disabled = false;
    showNotification('Connected to server', 'success');
  } catch (error) {
    console.error('Connection error:', error);
    updateSyncStatus('Connection failed', 'error');
    showNotification(`Connection failed: ${error.message}`, 'error');
  }
}

// Initialize app
init();

// Update NTP status periodically
setInterval(() => {
  if (state.connected) {
    updateNTPStatus();
  }
}, 5000); // Update every 5 seconds

// Update channel info
function updateChannelInfo(info) {
  document.getElementById('currentChannel').textContent = info.id;
  document.getElementById('userCount').textContent = info.userCount;
  
  // Update users list
  const usersList = document.getElementById('usersList');
  usersList.innerHTML = '';
  info.users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user.name;
    usersList.appendChild(li);
  });

  // Enable video controls for all users
  elements.playBtn.disabled = false;
  elements.pauseBtn.disabled = false;
  elements.seekBar.disabled = false;
}

// Handle sync commands
function handlePlayCommand(data) {
  if (state.vlcConnected) {
    window.api.vlc.executeAtTime('play', data.targetTime, data.position);
  }
}

function handlePauseCommand(data) {
  if (state.vlcConnected) {
    window.api.vlc.pause();
    window.api.vlc.seek(data.position);
  }
}

function handleSeekCommand(data) {
  if (state.vlcConnected) {
    window.api.vlc.executeAtTime('seek', data.targetTime, data.position);
  }
}

function handleSyncState(data) {
  if (state.vlcConnected) {
    window.api.vlc.syncToPosition(data.position, data.playing);
  }
}

/**
 * Update NTP offset and sync accuracy display
 */
async function updateNTPStatus() {
  try {
    const status = await window.api.sync.getStatus();
    
    if (status && typeof status.ntpOffset === 'number') {
      const offsetMs = Math.abs(status.ntpOffset);
      elements.ntpOffset.textContent = `NTP Offset: ${offsetMs.toFixed(0)}ms`;
      
      // Calculate sync accuracy (lower offset = better accuracy)
      let accuracy = 'Unknown';
      if (offsetMs < 50) {
        accuracy = 'Excellent';
      } else if (offsetMs < 100) {
        accuracy = 'Good'; 
      } else if (offsetMs < 300) {
        accuracy = 'Fair';
      } else {
        accuracy = 'Poor';
      }
      
      elements.syncAccuracy.textContent = `Sync Accuracy: ${accuracy} (${offsetMs.toFixed(0)}ms)`;
    } else {
      elements.ntpOffset.textContent = 'NTP Offset: -- ms';
      elements.syncAccuracy.textContent = 'Sync Accuracy: -- ms';
    }
  } catch (error) {
    console.error('Failed to update NTP status:', error);
    elements.ntpOffset.textContent = 'NTP Offset: -- ms';
    elements.syncAccuracy.textContent = 'Sync Accuracy: -- ms';
  }
}

// Setup sync event handlers
window.api.sync.onPlayCommand(handlePlayCommand);
window.api.sync.onPauseCommand(handlePauseCommand);
window.api.sync.onSeekCommand(handleSeekCommand);
window.api.sync.onSyncState(handleSyncState);

// Mode management
async function handleChangeMode() {
  const newMode = elements.userMode.value;
  if (newMode === state.userMode) return;
  
  try {
    elements.changeModeBtn.disabled = true;
    elements.changeModeBtn.textContent = 'Changing...';
    
    // TODO: Call sync client change mode method
    await window.api.sync.changeMode(newMode);
    
    showNotification(`Mode changed to ${getModeDisplayName(newMode)}`, 'success');
    
  } catch (error) {
    showNotification(`Failed to change mode: ${error.message}`, 'error');
  } finally {
    elements.changeModeBtn.disabled = false;
    elements.changeModeBtn.textContent = 'Change Mode';
  }
}

function updateModeUI(mode) {
  state.userMode = mode;
  elements.userMode.value = mode;
  elements.currentMode.textContent = getModeDisplayName(mode);
  
  // Show/hide relevant sections based on mode
  const showFileSharing = ['localplay', 'file_download'].includes(mode);
  const showScreenSharing = ['screenshare_host', 'screenshare_viewer'].includes(mode);
  
  elements.fileSharingSection.style.display = showFileSharing ? 'block' : 'none';
  elements.screenSharingSection.style.display = showScreenSharing ? 'block' : 'none';
  
  // Update button states
  updateModeButtons();
}

function updateModeButtons() {
  const inChannel = state.inChannel;
  const canChange = inChannel && state.connected;
  
  elements.userMode.disabled = !inChannel;
  elements.changeModeBtn.disabled = !canChange;
  elements.uploadFileBtn.disabled = !canChange || !['localplay'].includes(state.userMode);
  elements.startScreenShareBtn.disabled = !canChange || state.userMode !== 'screenshare_host';
  elements.stopScreenShareBtn.disabled = !state.isScreenSharing;
  
  // Update help text visibility
  const helpText = document.querySelector('.mode-section .help-text');
  if (helpText) {
    helpText.style.display = inChannel ? 'none' : 'block';
  }
}

function getModeDisplayName(mode) {
  const modeNames = {
    'localplay': 'Local Video',
    'screenshare_host': 'Sharing Screen',
    'screenshare_viewer': 'Watching Screen',
    'file_download': 'Downloading File',
    'observer': 'Observer'
  };
  return modeNames[mode] || mode;
}

// File sharing functionality
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('video/')) {
    showNotification('Please select a video file', 'error');
    return;
  }
  
  if (file.size > 500 * 1024 * 1024) { // 500MB limit
    showNotification('File too large. Maximum size is 500MB', 'error');
    return;
  }
  
  try {
    elements.uploadProgress.style.display = 'block';
    elements.uploadProgressBar.style.width = '0%';
    elements.uploadStatus.textContent = 'Preparing upload...';
    
    // TODO: Call sync client upload method
    const fileId = await window.api.sync.uploadFile(file, (progress) => {
      elements.uploadProgressBar.style.width = `${progress}%`;
      elements.uploadStatus.textContent = `Uploading... ${Math.round(progress)}%`;
    });
    
    showNotification(`Upload started: ${file.name}`, 'success');
    
  } catch (error) {
    showNotification(`Upload failed: ${error.message}`, 'error');
    elements.uploadProgress.style.display = 'none';
  }
  
  // Reset file input
  elements.fileInput.value = '';
}

function updateSharedFilesList(files) {
  elements.filesList.innerHTML = '';
  
  files.forEach(file => {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.innerHTML = `
      <div class="file-info">
        <div class="file-name">${file.name}</div>
        <div class="file-details">
          ${formatFileSize(file.size)} • ${file.type} • 
          Shared by ${file.uploadedBy}
        </div>
      </div>
      <div class="file-actions">
        <button class="btn-small btn-download" onclick="downloadFile('${file.id}')">
          📥 Download
        </button>
      </div>
    `;
    elements.filesList.appendChild(fileItem);
  });
}

async function downloadFile(fileId) {
  try {
    showNotification('Starting download...', 'info');
    await window.api.sync.downloadFile(fileId);
  } catch (error) {
    showNotification(`Download failed: ${error.message}`, 'error');
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Screen sharing functionality (updated to use ScreenSharingManager)
async function handleStartScreenShare() {
  try {
    elements.startScreenShareBtn.disabled = true;
    elements.startScreenShareBtn.textContent = 'Starting...';
    
    const quality = elements.screenQuality.value;
    const frameRate = 30;
    
    // Use the screen sharing manager for actual screen capture
    const result = await window.screenSharingManager.startScreenShare(quality, frameRate);
    
    if (result.success) {
      // Notify server via IPC
      await window.api.sync.startScreenShare(quality, frameRate);
      
      state.isScreenSharing = true;
      elements.startScreenShareBtn.style.display = 'none';
      elements.stopScreenShareBtn.style.display = 'inline-block';
      elements.stopScreenShareBtn.disabled = false;
      
      showNotification('Screen sharing started', 'success');
    }
    
  } catch (error) {
    console.error('Screen share error:', error);
    showNotification(`Failed to start screen share: ${error.message}`, 'error');
    elements.startScreenShareBtn.disabled = false;
    elements.startScreenShareBtn.textContent = '🚀 Start Sharing';
  }
}

async function handleStopScreenShare() {
  try {
    elements.stopScreenShareBtn.disabled = true;
    elements.stopScreenShareBtn.textContent = 'Stopping...';
    
    // Stop screen sharing locally
    const result = window.screenSharingManager.stopScreenShare();
    
    if (result.success) {
      // Notify server via IPC
      await window.api.sync.stopScreenShare();
      
      state.isScreenSharing = false;
      elements.startScreenShareBtn.style.display = 'inline-block';
      elements.stopScreenShareBtn.style.display = 'none';
      elements.startScreenShareBtn.disabled = false;
      
      showNotification('Screen sharing stopped', 'success');
    }
    
  } catch (error) {
    console.error('Stop screen share error:', error);
    showNotification(`Failed to stop screen share: ${error.message}`, 'error');
  } finally {
    elements.stopScreenShareBtn.disabled = false;
    elements.stopScreenShareBtn.textContent = '⏹️ Stop Sharing';
  }
}

async function watchScreenShare(hostId) {
  try {
    showNotification('Connecting to screen share...', 'info');
    
    // Use screen sharing manager for WebRTC connection
    const result = await window.screenSharingManager.connectToScreenShare(hostId);
    
    if (result.success) {
      state.watchingScreenShare = hostId;
      updateScreenSharesList(Array.from(state.screenSharers));
      
      // Change mode to viewer
      if (state.userMode !== 'screenshare_viewer') {
        await window.api.sync.changeMode('screenshare_viewer');
      }
      
      showNotification('Connected to screen share', 'success');
    }
    
  } catch (error) {
    console.error('Connect to screen share error:', error);
    showNotification(`Failed to connect to screen share: ${error.message}`, 'error');
  }
}

async function stopWatchingScreenShare() {
  try {
    // Disconnect locally
    const result = window.screenSharingManager.disconnectFromScreenShare();
    
    if (result.success) {
      state.watchingScreenShare = null;
      updateScreenSharesList(Array.from(state.screenSharers));
      showNotification('Disconnected from screen share', 'info');
    }
    
  } catch (error) {
    console.error('Disconnect error:', error);
    showNotification(`Failed to disconnect: ${error.message}`, 'error');
  }
}

function updateScreenSharesList(screenSharers) {
  elements.screensList.innerHTML = '';
  
  screenSharers.forEach(hostId => {
    const user = state.users.get(hostId);
    if (!user) return;
    
    const screenItem = document.createElement('div');
    screenItem.className = 'screen-item';
    screenItem.innerHTML = `
      <div class="screen-info">
        <div class="screen-host">${user.name}</div>
        <div class="screen-details">
          Quality: ${user.screenShareInfo?.quality || 'Medium'} • 
          ${user.screenShareInfo?.frameRate || 30} FPS
        </div>
      </div>
      <div class="screen-actions">
        <button class="btn-small btn-watch" onclick="watchScreenShare('${hostId}')">
          👀 Watch
        </button>
        ${state.watchingScreenShare === hostId ? 
          `<button class="btn-small btn-disconnect" onclick="stopWatchingScreenShare()">
            🔌 Disconnect
           </button>` : ''}
      </div>
    `;
    elements.screensList.appendChild(screenItem);
  });
}