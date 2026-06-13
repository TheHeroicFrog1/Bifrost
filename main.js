const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let mainWindow;
let backendProcess;

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
    backendProcess = spawn(backendPath, [], { stdio: 'inherit' });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend:', err);
      dialog.showErrorBox('Backend Error', `Failed to start the backend server:\n${err.message}`);
      reject(err);
    });

    backendProcess.on('exit', (code) => {
      console.log(`Backend process exited with code ${code}`);
      if (code !== 0 && code !== null) {
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
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    // Dev: React server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Prod: Local file
    mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (backendProcess) {
    console.log('Killing backend process...');
    backendProcess.kill();
  }
});
