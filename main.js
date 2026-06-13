const { app, BrowserWindow, dialog, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const net = require('net');

let mainWindow;
let backendProcess;
let tray = null;
let isQuitting = false;

const getSettingsPath = () => path.join(app.getPath('userData'), 'settings.json');

const getSettings = () => {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8'));
  } catch (e) {
    return { closeBehavior: 'ask' };
  }
};

const saveSettings = (settings) => {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
};

ipcMain.handle('get-settings', () => getSettings());
ipcMain.on('save-settings', (event, settings) => saveSettings(settings));
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

function createTray() {
  if (tray) return;
  try {
    const iconPath = path.join(__dirname, 'build/icon.png');
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show Bifrost', click: () => { if (mainWindow) mainWindow.show(); } },
      { label: 'Quit', click: () => {
        isQuitting = true;
        app.quit();
      }}
    ]);
    tray.setToolTip('Bifrost');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });
  } catch (err) {
    console.error('Failed to create tray icon:', err);
  }
}

function getBackendPath() {
  const isDev = !app.isPackaged;
  const platform = process.platform;
  let backendExecutable = 'bifrost-backend';
  
  if (platform === 'win32') {
    backendExecutable += '.exe';
  }

  if (isDev) {
    // In dev mode, we assume user is running `uvicorn main:app` separately, or we could spawn it.
    // For simplicity, in dev, we just launch the python script or rely on existing instance.
    return { path: null, isDev: true };
  } else {
    // In production, PyInstaller creates a dist folder, bundled inside Electron's 'resources' folder.
    return { 
      path: path.join(process.resourcesPath, 'backend-dist', backendExecutable),
      isDev: false
    };
  }
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const { path: backendPath, isDev } = getBackendPath();

    if (isDev) {
      console.log('Running in development mode. Make sure backend is running on port 8000.');
      resolve();
      return;
    }

    console.log('Starting backend:', backendPath);
    
    let env = { ...process.env };
    let settings = getSettings();
    if (settings.dataPath) {
      env.BIFROST_DATA_PATH = settings.dataPath;
    }

    backendProcess = spawn(backendPath, [], { windowsHide: true, stdio: 'ignore', env });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend:', err);
      dialog.showErrorBox('Backend Error', `Failed to start the backend server:\n${err.message}`);
      reject(err);
    });

    backendProcess.on('exit', (code) => {
      console.log(`Backend process exited with code ${code}`);
      if (!isQuitting && code !== 0 && code !== null) {
        dialog.showErrorBox('Backend Crash', `The backend server crashed (code: ${code}). The app may not function correctly.`);
      }
    });

    // Wait for the backend to start accepting connections
    const checkPort = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('timeout', () => {
        socket.destroy();
        setTimeout(checkPort, 500);
      });
      socket.on('error', () => {
        setTimeout(checkPort, 500);
      });
      socket.connect(8000, '127.0.0.1');
    };

    checkPort();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'build/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true
  });
  
  mainWindow.maximize();

  const isDev = !app.isPackaged;
  if (isDev) {
    // Dev: React server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Prod: Local file
    mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
  }

  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    
    let settings = getSettings();
    let behavior = settings.closeBehavior;
    
    if (behavior === 'ask') {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['Run in background', 'Close completely'],
        defaultId: 0,
        cancelId: 1,
        title: 'Close Application',
        message: 'Do you want to keep Bifrost running in the background or close it completely?',
        checkboxLabel: 'Remember my choice',
        checkboxChecked: true
      });
      
      behavior = choice === 0 ? 'background' : 'quit';
      settings.closeBehavior = behavior;
      saveSettings(settings);
    }
    
    if (behavior === 'background') {
      e.preventDefault();
      mainWindow.hide();
    } else {
      isQuitting = true;
      app.quit();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    createTray();
    await startBackend();
    createWindow();
  } catch (error) {
    console.error('Initialization failed:', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (backendProcess) {
    console.log('Killing backend process...');
    if (process.platform === 'win32') {
      try {
        spawnSync('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
      } catch (e) {
        console.error('Failed to taskkill backend:', e);
      }
    } else {
      backendProcess.kill();
    }
  }
});
