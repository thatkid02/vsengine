const { app, BrowserWindow, ipcMain, dialog, Menu, desktopCapturer } = require('electron');
const path = require('path');
const Store = require('electron-store');
const VLCController = require('./vlc-controller');
const SyncClient = require('./sync/sync-client');

// Initialize store for settings
const store = new Store({
  defaults: {
    serverUrl: 'ws://localhost:3000',
    userName: 'User',
    lastVideoPath: null
  }
});

// Global references
let mainWindow = null;
let vlcController = null;
let syncClient = null;
let syncEnabled = false;
let statusInterval = null;

// Create the main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      enableRemoteModule: false,
      // Enable clipboard operations
      clipboard: true,
      // Enable context menu
      contextIsolation: true,
      // Enable keyboard shortcuts
      enableBlinkFeatures: 'KeyboardShortcuts',
      // Enable screen capture permissions
      webSecurity: false,
      experimentalFeatures: true
    },
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  // Load the renderer HTML
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Setup application menu
  setupMenu();

  // Enable context menu
  mainWindow.webContents.on('context-menu', (e, params) => {
    e.preventDefault();
    const menu = Menu.buildFromTemplate([
      { label: 'Cut', role: 'cut' },
      { label: 'Copy', role: 'copy' },
      { label: 'Paste', role: 'paste' },
      { type: 'separator' },
      { label: 'Select All', role: 'selectAll' }
    ]);
    menu.popup({ window: mainWindow, x: params.x, y: params.y });
  });

  // Handle window close
  mainWindow.on('close', async (event) => {
    try {
      if (vlcController) {
        console.log('Shutting down VLC...');
        await vlcController.killVLC();
      }
    } catch (error) {
      console.error('Error shutting down VLC:', error);
    }
  });

  // Handle desktop capturer access
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });
}

// Setup application menu
function setupMenu() {
  const template = [
    {
      label: 'Video Sync Engine',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Video...',
          accelerator: 'CmdOrCtrl+O',
          click: () => handleOpenVideo()
        },
        { type: 'separator' },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (mainWindow) mainWindow.close();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Initialize controllers
async function initializeControllers() {
  vlcController = new VLCController();
  syncClient = new SyncClient(store.get('serverUrl'));

  // Setup sync client event handlers
  syncClient.on('connected', () => {
    mainWindow.webContents.send('sync:connected');
  });

  syncClient.on('disconnected', () => {
    mainWindow.webContents.send('sync:disconnected');
  });

  syncClient.on('channelInfo', (info) => {
    mainWindow.webContents.send('sync:channelInfo', info);
  });

  syncClient.on('userJoined', (data) => {
    mainWindow.webContents.send('sync:userJoined', data);
  });

  syncClient.on('userLeft', (data) => {
    mainWindow.webContents.send('sync:userLeft', data);
  });

  syncClient.on('controllerChanged', (data) => {
    mainWindow.webContents.send('sync:controllerChanged', data);
  });

  // Enhanced sync event handlers
  syncClient.on('welcome', (data) => {
    mainWindow.webContents.send('sync:welcome', data);
  });

  syncClient.on('modeChanged', (data) => {
    mainWindow.webContents.send('sync:modeChanged', data);
  });

  syncClient.on('userModeChanged', (data) => {
    mainWindow.webContents.send('sync:userModeChanged', data);
  });

  // File sharing events
  syncClient.on('fileUploadStarted', (data) => {
    mainWindow.webContents.send('sync:fileUploadStarted', data);
  });

  syncClient.on('fileUploadProgress', (data) => {
    mainWindow.webContents.send('sync:fileUploadProgress', data);
  });

  syncClient.on('fileAvailable', (data) => {
    mainWindow.webContents.send('sync:fileAvailable', data);
  });

  syncClient.on('fileDownloadReady', (data) => {
    mainWindow.webContents.send('sync:fileDownloadReady', data);
  });

  // Screen sharing events
  syncClient.on('screenShareAvailable', (data) => {
    mainWindow.webContents.send('sync:screenShareAvailable', data);
  });

  syncClient.on('screenShareEnded', (data) => {
    mainWindow.webContents.send('sync:screenShareEnded', data);
  });

  syncClient.on('screenShareReceived', (data) => {
    mainWindow.webContents.send('sync:screenShareReceived', data);
  });

  syncClient.on('screenShareStarted', (data) => {
    mainWindow.webContents.send('sync:screenShareStarted', data);
  });

  syncClient.on('screenShareStopped', (data) => {
    mainWindow.webContents.send('sync:screenShareStopped', data);
  });

  // WebRTC signaling events
  syncClient.on('screenShareOffer', (data) => {
    mainWindow.webContents.send('sync:screenShareOffer', data);
  });

  syncClient.on('screenShareAnswer', (data) => {
    mainWindow.webContents.send('sync:screenShareAnswer', data);
  });

  syncClient.on('iceCandidate', (data) => {
    mainWindow.webContents.send('sync:iceCandidate', data);
  });

  // Sync command handlers
  syncClient.on('playCommand', async (data) => {
    await vlcController.executeAtTime('play', data.targetTime, data.position);
  });

  syncClient.on('pauseCommand', async (data) => {
    await vlcController.pause();
    await vlcController.seek(data.position);
  });

  syncClient.on('seekCommand', async (data) => {
    await vlcController.executeAtTime('seek', data.targetTime, data.position);
  });

  syncClient.on('syncState', async (data) => {
    if (syncEnabled) {
      await vlcController.syncToPosition(data.position, data.playing);
    }
  });

  syncClient.on('error', (error) => {
    mainWindow.webContents.send('sync:error', error.message);
  });
}

// Start VLC status monitoring
function startStatusMonitoring() {
  if (statusInterval) {
    clearInterval(statusInterval);
  }

  statusInterval = setInterval(async () => {
    try {
      if (vlcController && vlcController.isConnected) {
        const status = await vlcController.getStatus();
        mainWindow.webContents.send('vlc:status', status);

        // Send sync state if controller
        if (syncClient && syncClient.isController && syncEnabled) {
          syncClient.sendSyncState(status.position, status.playing);
        }
      }
    } catch (error) {
      console.error('Status monitoring error:', error);
    }
  }, 1000); // Check every second
}

// Stop status monitoring
function stopStatusMonitoring() {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
}

// Handle open video
async function handleOpenVideo() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'flv', 'wmv', 'm4v'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const videoPath = result.filePaths[0];
    store.set('lastVideoPath', videoPath);
    
    try {
      await vlcController.startVLC(videoPath);
      startStatusMonitoring();
      mainWindow.webContents.send('vlc:connected', true);
      mainWindow.webContents.send('video:opened', path.basename(videoPath));
    } catch (error) {
      dialog.showErrorBox('VLC Error', `Failed to start VLC: ${error.message}`);
    }
  }
}

// IPC Handlers
ipcMain.handle('app:getSettings', () => {
  return {
    serverUrl: store.get('serverUrl'),
    userName: store.get('userName')
  };
});

ipcMain.handle('app:saveSettings', (event, settings) => {
  store.set('serverUrl', settings.serverUrl);
  store.set('userName', settings.userName);
  return true;
});

ipcMain.handle('vlc:start', async () => {
  try {
    if (!vlcController) {
      vlcController = new VLCController();
    }
    const result = await vlcController.startVLC();
    if (result) {
      console.log('VLC started successfully');
      startStatusMonitoring();
      mainWindow.webContents.send('vlc:connected', true);
      return true;
    }
    throw new Error('Failed to start VLC');
  } catch (error) {
    console.error('Error starting VLC:', error);
    throw error;
  }
});

ipcMain.handle('vlc:openFile', async () => {
  try {
    if (!vlcController) {
      vlcController = new VLCController();
      await vlcController.startVLC();
      startStatusMonitoring();
      mainWindow.webContents.send('vlc:connected', true);
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'flv', 'wmv', 'm4v'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled) {
      return false;
    }

    const filePath = result.filePaths[0];
    console.log('Opening file:', filePath);
    
    const status = await vlcController.openFile(filePath);
    if (status) {
      console.log('File opened successfully');
      store.set('lastVideoPath', filePath);
      mainWindow.webContents.send('video:opened', path.basename(filePath));
      return true;
    }
    throw new Error('Failed to open file');
  } catch (error) {
    console.error('Error opening file:', error);
    throw error;
  }
});

ipcMain.handle('vlc:play', async () => {
  if (vlcController) {
    return await vlcController.play();
  }
  throw new Error('VLC controller not initialized');
});

ipcMain.handle('vlc:pause', async () => {
  if (vlcController) {
    return await vlcController.pause();
  }
  throw new Error('VLC controller not initialized');
});

ipcMain.handle('vlc:seek', async (event, position) => {
  if (vlcController) {
    return await vlcController.seek(position);
  }
  throw new Error('VLC controller not initialized');
});

ipcMain.handle('vlc:setVolume', async (event, volume) => {
  if (vlcController) {
    return await vlcController.setVolume(volume);
  }
  throw new Error('VLC controller not initialized');
});

ipcMain.handle('sync:connect', async () => {
  try {
    await syncClient.connect();
    return true;
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('sync:disconnect', () => {
  syncClient.disconnect();
  syncEnabled = false;
});

ipcMain.handle('sync:joinChannel', (event, channelId, userName) => {
  const userId = store.get('userId') || require('uuid').v4();
  store.set('userId', userId);
  syncClient.joinChannel(channelId, userId, userName);
  syncEnabled = true;
});

ipcMain.handle('sync:joinChannelWithMode', (event, channelId, userName, mode) => {
  const userId = store.get('userId') || require('uuid').v4();
  store.set('userId', userId);
  syncClient.joinChannel(channelId, userId, userName, mode);
  syncEnabled = true;
});

ipcMain.handle('sync:leaveChannel', () => {
  syncClient.leaveChannel();
  syncEnabled = false;
});

// Enhanced mode management
ipcMain.handle('sync:changeMode', (event, mode) => {
  return syncClient.changeMode(mode);
});

// Desktop capturer handler for screen sharing
ipcMain.handle('screen:getSources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 150, height: 150 }
    });
    
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  } catch (error) {
    console.error('Error getting desktop sources:', error);
    throw new Error(`Failed to get desktop sources: ${error.message}`);
  }
});

// File sharing handlers
ipcMain.handle('sync:uploadFile', async (event, file, onProgress) => {
  try {
    return await syncClient.uploadFile(file, onProgress);
  } catch (error) {
    throw new Error(`File upload failed: ${error.message}`);
  }
});

ipcMain.handle('sync:downloadFile', async (event, fileId) => {
  try {
    return await syncClient.downloadFile(fileId);
  } catch (error) {
    throw new Error(`File download failed: ${error.message}`);
  }
});

// Screen sharing handlers (fixed implementation)
ipcMain.handle('sync:startScreenShare', async (event, quality, frameRate) => {
  try {
    // Forward to sync client for server notification
    syncClient.send({
      type: 'screenshare_start',
      quality: quality || 'medium',
      frameRate: frameRate || 30
    });
    
    // Return success - actual screen capture happens in renderer
    return { success: true, quality, frameRate };
  } catch (error) {
    console.error('Screen share start error:', error);
    throw new Error(`Screen share failed: ${error.message}`);
  }
});

ipcMain.handle('sync:stopScreenShare', async (event) => {
  try {
    // Forward to sync client for server notification
    syncClient.send({
      type: 'screenshare_stop',
      newMode: 'observer'
    });
    
    return { success: true };
  } catch (error) {
    console.error('Screen share stop error:', error);
    throw new Error(`Stop screen share failed: ${error.message}`);
  }
});

ipcMain.handle('sync:connectToScreenShare', async (event, hostId) => {
  try {
    // This will be handled in renderer process with WebRTC
    console.log('Connecting to screen share from host:', hostId);
    return { success: true, hostId };
  } catch (error) {
    console.error('Connect to screen share error:', error);
    throw new Error(`Connect to screen share failed: ${error.message}`);
  }
});

ipcMain.handle('sync:disconnectFromScreenShare', async (event) => {
  try {
    console.log('Disconnecting from screen share');
    return { success: true };
  } catch (error) {
    console.error('Disconnect from screen share error:', error);
    throw new Error(`Disconnect from screen share failed: ${error.message}`);
  }
});

// Send messages through sync client
ipcMain.handle('sync:sendMessage', (event, message) => {
  try {
    syncClient.send(message);
    return { success: true };
  } catch (error) {
    console.error('Send message error:', error);
    throw new Error(`Failed to send message: ${error.message}`);
  }
});

ipcMain.handle('sync:getStatus', () => {
  return syncClient ? syncClient.getStatus() : null;
});

// Sync command handlers
ipcMain.handle('sync:sendPlay', async (event, position, targetTime) => {
  if (syncClient) {
    await syncClient.sendPlay(position, targetTime);
  }
});

ipcMain.handle('sync:sendPause', async (event, position) => {
  if (syncClient) {
    await syncClient.sendPause(position);
  }
});

ipcMain.handle('sync:sendSeek', async (event, position, targetTime) => {
  if (syncClient) {
    await syncClient.sendSeek(position, targetTime);
  }
});

ipcMain.handle('sync:sendSyncState', async (event, position, playing) => {
  if (syncClient) {
    await syncClient.sendSyncState(position, playing);
  }
});

// VLC command handlers
ipcMain.handle('vlc:getStatus', async () => {
  try {
    if (!vlcController) {
      throw new Error('VLC controller not initialized');
    }
    return await vlcController.getStatus();
  } catch (error) {
    console.error('Error getting VLC status:', error);
    throw error;
  }
});

ipcMain.handle('vlc:executeAtTime', async (event, command, targetTime, position) => {
  if (vlcController) {
    await vlcController.executeAtTime(command, targetTime, position);
  }
});

ipcMain.handle('vlc:syncToPosition', async (event, position, playing) => {
  if (vlcController) {
    await vlcController.syncToPosition(position, playing);
  }
});

// App event handlers
app.whenReady().then(async () => {
  createWindow();
  await initializeControllers();
});

app.on('window-all-closed', () => {
  stopStatusMonitoring();
  if (vlcController) {
    vlcController.killVLC();
  }
  if (syncClient) {
    syncClient.disconnect();
  }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle app quit
app.on('before-quit', async () => {
  try {
    if (vlcController) {
      console.log('Shutting down VLC...');
      await vlcController.killVLC();
    }
  } catch (error) {
    console.error('Error shutting down VLC:', error);
  }
});

// Handle process termination
process.on('SIGINT', async () => {
  try {
    if (vlcController) {
      console.log('Shutting down VLC...');
      await vlcController.killVLC();
    }
    app.quit();
  } catch (error) {
    console.error('Error shutting down VLC:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  try {
    if (vlcController) {
      console.log('Shutting down VLC...');
      await vlcController.killVLC();
    }
    app.quit();
  } catch (error) {
    console.error('Error shutting down VLC:', error);
    process.exit(1);
  }
});