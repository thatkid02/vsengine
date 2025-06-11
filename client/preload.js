const { contextBridge, ipcRenderer, clipboard } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Clipboard operations
  clipboard: {
    readText: () => clipboard.readText(),
    writeText: (text) => clipboard.writeText(text)
  },

  // App settings
  getSettings: () => ipcRenderer.invoke('app:getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('app:saveSettings', settings),

  // VLC controls
  vlc: {
    start: () => ipcRenderer.invoke('vlc:start'),
    openFile: (path) => ipcRenderer.invoke('vlc:openFile', path),
    play: () => ipcRenderer.invoke('vlc:play'),
    pause: () => ipcRenderer.invoke('vlc:pause'),
    seek: (position) => ipcRenderer.invoke('vlc:seek', position),
    setVolume: (volume) => ipcRenderer.invoke('vlc:setVolume', volume),
    getStatus: () => ipcRenderer.invoke('vlc:getStatus'),
    startVLC: () => ipcRenderer.invoke('vlc:start'),
    executeAtTime: (command, targetTime, position) => 
      ipcRenderer.invoke('vlc:executeAtTime', command, targetTime, position),
    syncToPosition: (position, playing) => 
      ipcRenderer.invoke('vlc:syncToPosition', position, playing),
    onStatus: (callback) => {
      ipcRenderer.on('vlc:status', (event, status) => callback(status));
    },
    onConnected: (callback) => {
      ipcRenderer.on('vlc:connected', (event, connected) => callback(connected));
    }
  },

  // Sync controls
  sync: {
    connect: (serverUrl) => ipcRenderer.invoke('sync:connect', serverUrl),
    disconnect: () => ipcRenderer.invoke('sync:disconnect'),
    joinChannel: (channelId, userId, userName) => 
      ipcRenderer.invoke('sync:joinChannel', channelId, userId, userName),
    joinChannelWithMode: (channelId, userName, mode) => 
      ipcRenderer.invoke('sync:joinChannelWithMode', channelId, userName, mode),
    leaveChannel: () => ipcRenderer.invoke('sync:leaveChannel'),
    sendPlay: (position, targetTime) => 
      ipcRenderer.invoke('sync:sendPlay', position, targetTime),
    sendPause: (position) => 
      ipcRenderer.invoke('sync:sendPause', position),
    sendSeek: (position, targetTime) => 
      ipcRenderer.invoke('sync:sendSeek', position, targetTime),
    sendSyncState: (position, playing) => 
      ipcRenderer.invoke('sync:sendSyncState', position, playing),
    
    // Enhanced mode management
    changeMode: (mode) => ipcRenderer.invoke('sync:changeMode', mode),
    
    // File sharing methods
    uploadFile: (file, onProgress) => ipcRenderer.invoke('sync:uploadFile', file, onProgress),
    downloadFile: (fileId) => ipcRenderer.invoke('sync:downloadFile', fileId),
    
    // Screen sharing methods
    startScreenShare: (quality, frameRate) => 
      ipcRenderer.invoke('sync:startScreenShare', quality, frameRate),
    stopScreenShare: () => ipcRenderer.invoke('sync:stopScreenShare'),
    connectToScreenShare: (hostId) => 
      ipcRenderer.invoke('sync:connectToScreenShare', hostId),
    disconnectFromScreenShare: () => 
      ipcRenderer.invoke('sync:disconnectFromScreenShare'),
    
    // Event handlers
    onConnected: (callback) => ipcRenderer.on('sync:connected', callback),
    onDisconnected: (callback) => ipcRenderer.on('sync:disconnected', callback),
    onChannelInfo: (callback) => ipcRenderer.on('sync:channelInfo', (_, info) => callback(info)),
    onUserJoined: (callback) => ipcRenderer.on('sync:userJoined', (_, data) => callback(data)),
    onUserLeft: (callback) => ipcRenderer.on('sync:userLeft', (_, data) => callback(data)),
    onError: (callback) => ipcRenderer.on('sync:error', (_, error) => callback(error)),
    onPlayCommand: (callback) => ipcRenderer.on('sync:playCommand', (_, data) => callback(data)),
    onPauseCommand: (callback) => ipcRenderer.on('sync:pauseCommand', (_, data) => callback(data)),
    onSeekCommand: (callback) => ipcRenderer.on('sync:seekCommand', (_, data) => callback(data)),
    onSyncState: (callback) => ipcRenderer.on('sync:syncState', (_, data) => callback(data)),
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    onControllerChanged: (callback) => {
      ipcRenderer.on('sync:controllerChanged', (event, data) => callback(data));
    },
    
    // Enhanced event handlers
    onWelcome: (callback) => ipcRenderer.on('sync:welcome', (_, data) => callback(data)),
    onModeChanged: (callback) => ipcRenderer.on('sync:modeChanged', (_, data) => callback(data)),
    onUserModeChanged: (callback) => ipcRenderer.on('sync:userModeChanged', (_, data) => callback(data)),
    
    // File sharing events
    onFileUploadStarted: (callback) => ipcRenderer.on('sync:fileUploadStarted', (_, data) => callback(data)),
    onFileUploadProgress: (callback) => ipcRenderer.on('sync:fileUploadProgress', (_, data) => callback(data)),
    onFileAvailable: (callback) => ipcRenderer.on('sync:fileAvailable', (_, data) => callback(data)),
    onFileDownloadReady: (callback) => ipcRenderer.on('sync:fileDownloadReady', (_, data) => callback(data)),
    
    // Screen sharing events
    onScreenShareAvailable: (callback) => ipcRenderer.on('sync:screenShareAvailable', (_, data) => callback(data)),
    onScreenShareEnded: (callback) => ipcRenderer.on('sync:screenShareEnded', (_, data) => callback(data)),
    onScreenShareReceived: (callback) => ipcRenderer.on('sync:screenShareReceived', (_, data) => callback(data)),
    onScreenShareStarted: (callback) => ipcRenderer.on('sync:screenShareStarted', (_, data) => callback(data)),
    onScreenShareStopped: (callback) => ipcRenderer.on('sync:screenShareStopped', (_, data) => callback(data)),
    
    // WebRTC signaling events
    onScreenShareOffer: (callback) => ipcRenderer.on('sync:screenShareOffer', (_, data) => callback(data)),
    onScreenShareAnswer: (callback) => ipcRenderer.on('sync:screenShareAnswer', (_, data) => callback(data)),
    onIceCandidate: (callback) => ipcRenderer.on('sync:iceCandidate', (_, data) => callback(data)),
    
    // Send WebRTC signaling messages
    sendMessage: (message) => ipcRenderer.invoke('sync:sendMessage', message)
  },

  // Video events
  onVideoOpened: (callback) => {
    ipcRenderer.on('video:opened', (event, filename) => callback(filename));
  },

  // Screen capture for Electron
  screen: {
    getSources: () => ipcRenderer.invoke('screen:getSources')
  },

  // Settings
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  }
});