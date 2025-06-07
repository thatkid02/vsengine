// State management
let state = {
  connected: false,
  inChannel: false,
  isController: false,
  vlcConnected: false,
  currentVideo: null,
  videoStatus: null,
  syncStatus: null
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
  syncIndicator: document.getElementById('syncIndicator')
};

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
}

// IPC Listeners
function setupIPCListeners() {
  // Sync events
  window.api.sync.onConnected(() => {
    state.connected = true;
    updateConnectionUI();
    showNotification('Connected to sync server', 'success');
  });
  
  window.api.sync.onDisconnected(() => {
    state.connected = false;
    state.inChannel = false;
    updateConnectionUI();
    showNotification('Disconnected from sync server', 'error');
  });
  
  window.api.sync.onChannelInfo((info) => {
    state.inChannel = true;
    state.isController = info.controller === info.users.find(u => u.isController)?.userId;
    updateChannelUI(info);
  });
  
  window.api.sync.onUserJoined((data) => {
    showNotification(`${data.userName} joined the channel`, 'info');
    updateUsersList();
  });
  
  window.api.sync.onUserLeft((data) => {
    showNotification(`${data.userName} left the channel`, 'info');
    updateUsersList();
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
}

// Handlers
async function handleConnect() {
  try {
    if (!state.connected) {
      await window.api.sync.connect();
      elements.connectBtn.textContent = 'Disconnect';
    } else {
      await window.api.sync.disconnect();
      elements.connectBtn.textContent = 'Connect';
    }
  } catch (error) {
    showNotification(`Connection failed: ${error.message}`, 'error');
  }
}

async function handleJoinChannel() {
  const channelId = elements.channelId.value.trim();
  const userName = elements.userName.value.trim();
  
  if (!channelId || !userName) {
    showNotification('Please enter channel ID and username', 'error');
    return;
  }
  
  try {
    await window.api.sync.joinChannel(channelId, userName);
  } catch (error) {
    showNotification(`Failed to join channel: ${error.message}`, 'error');
  }
}

async function handleLeaveChannel() {
  await window.api.sync.leaveChannel();
  state.inChannel = false;
  state.isController = false;
  updateChannelUI(null);
}

async function handlePlay() {
  try {
    await window.api.vlc.play();
  } catch (error) {
    showNotification(`Play failed: ${error.message}`, 'error');
  }
}

async function handlePause() {
  try {
    await window.api.vlc.pause();
  } catch (error) {
    showNotification(`Pause failed: ${error.message}`, 'error');
  }
}

async function handleOpenVideo() {
  // File dialog is handled in main process
  // Just trigger the menu action or send a message to main
  // The actual implementation in main.js will handle the dialog
  showNotification('Use File → Open Video menu or drag a video file', 'info');
}

async function handleStartVLC() {
  try {
    await window.api.vlc.start();
    showNotification('VLC started', 'success');
  } catch (error) {
    showNotification(`Failed to start VLC: ${error.message}`, 'error');
  }
}

let isSeeking = false;
function handleSeek(event) {
  if (!state.isController && state.inChannel) return;
  isSeeking = true;
  const position = (event.target.value / 100) * state.videoStatus.length;
  elements.currentTime.textContent = formatTime(position);
}

async function handleSeekEnd(event) {
  if (!state.isController && state.inChannel) return;
  isSeeking = false;
  const position = (event.target.value / 100) * state.videoStatus.length;
  try {
    await window.api.vlc.seek(position);
  } catch (error) {
    showNotification(`Seek failed: ${error.message}`, 'error');
  }
}

async function handleVolumeChange(event) {
  try {
    await window.api.vlc.setVolume(event.target.value);
  } catch (error) {
    console.error('Volume change failed:', error);
  }
}

// UI Updates
function updateConnectionUI() {
  if (state.connected) {
    elements.syncStatus.classList.add('connected');
    elements.syncStatusText.textContent = 'Connected';
    elements.connectBtn.textContent = 'Disconnect';
    elements.joinChannelBtn.disabled = false;
  } else {
    elements.syncStatus.classList.remove('connected');
    elements.syncStatusText.textContent = 'Disconnected';
    elements.connectBtn.textContent = 'Connect';
    elements.joinChannelBtn.disabled = true;
    elements.channelInfo.style.display = 'none';
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
    li.innerHTML = `
      ${user.isController ? '<span class="controller-icon">👑</span>' : ''}
      <span>${user.name}</span>
    `;
    elements.usersList.appendChild(li);
  });
  
  // Update controls based on role
  updateControlsForRole(isController);
}

function updateControlsForRole(isController) {
  state.isController = isController;
  if (state.inChannel && !isController) {
    elements.playBtn.disabled = true;
    elements.pauseBtn.disabled = true;
    elements.seekBar.disabled = true;
    elements.syncIndicator.style.display = 'block';
  } else {
    elements.syncIndicator.style.display = 'none';
    updateVideoControls();
  }
}

function updateVLCStatus() {
  if (state.vlcConnected) {
    elements.vlcStatus.textContent = 'Connected';
    elements.vlcStatus.classList.add('connected');
    updateVideoControls();
  } else {
    elements.vlcStatus.textContent = 'Not Connected';
    elements.vlcStatus.classList.remove('connected');
    elements.playBtn.disabled = true;
    elements.pauseBtn.disabled = true;
    elements.seekBar.disabled = true;
  }
}

function updateVideoStatus(status) {
  if (!status) return;
  
  // Update time
  elements.currentTime.textContent = formatTime(status.position);
  elements.totalTime.textContent = formatTime(status.length);
  
  // Update seek bar
  if (!isSeeking && status.length > 0) {
    const progress = (status.position / status.length) * 100;
    elements.seekBar.value = progress;
  }
  
  // Update controls
  updateVideoControls();
}

function updateVideoControls() {
  if (state.vlcConnected && (!state.inChannel || state.isController)) {
    elements.playBtn.disabled = false;
    elements.pauseBtn.disabled = false;
    elements.seekBar.disabled = false;
  }
}

async function updateUsersList() {
  const status = await window.api.sync.getStatus();
  if (status && status.channelInfo) {
    updateChannelUI(status.channelInfo);
  }
}

// Utilities
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
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

// Initialize app
init();