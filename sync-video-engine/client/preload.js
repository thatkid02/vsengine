const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
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
    onStatus: (callback) => {
      ipcRenderer.on('vlc:status', (event, status) => callback(status));
    },
    onConnected: (callback) => {
      ipcRenderer.on('vlc:connected', (event, connected) => callback(connected));
    }
  },

  // Sync controls
  sync: {
    connect: () => ipcRenderer.invoke('sync:connect'),
    disconnect: () => ipcRenderer.invoke('sync:disconnect'),
    joinChannel: (channelId, userName) => ipcRenderer.invoke('sync:joinChannel', channelId, userName),
    leaveChannel: () => ipcRenderer.invoke('sync:leaveChannel'),
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    onConnected: (callback) => {
      ipcRenderer.on('sync:connected', () => callback());
    },
    onDisconnected: (callback) => {
      ipcRenderer.on('sync:disconnected', () => callback());
    },
    onChannelInfo: (callback) => {
      ipcRenderer.on('sync:channelInfo', (event, info) => callback(info));
    },
    onUserJoined: (callback) => {
      ipcRenderer.on('sync:userJoined', (event, data) => callback(data));
    },
    onUserLeft: (callback) => {
      ipcRenderer.on('sync:userLeft', (event, data) => callback(data));
    },
    onControllerChanged: (callback) => {
      ipcRenderer.on('sync:controllerChanged', (event, data) => callback(data));
    },
    onError: (callback) => {
      ipcRenderer.on('sync:error', (event, error) => callback(error));
    }
  },

  // Video events
  onVideoOpened: (callback) => {
    ipcRenderer.on('video:opened', (event, filename) => callback(filename));
  }
});