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
    leaveChannel: () => ipcRenderer.invoke('sync:leaveChannel'),
    sendPlay: (position, targetTime) => 
      ipcRenderer.invoke('sync:sendPlay', position, targetTime),
    sendPause: (position) => 
      ipcRenderer.invoke('sync:sendPause', position),
    sendSeek: (position, targetTime) => 
      ipcRenderer.invoke('sync:sendSeek', position, targetTime),
    sendSyncState: (position, playing) => 
      ipcRenderer.invoke('sync:sendSyncState', position, playing),
    
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
    }
  },

  // Video events
  onVideoOpened: (callback) => {
    ipcRenderer.on('video:opened', (event, filename) => callback(filename));
  },

  // Settings
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  }
});