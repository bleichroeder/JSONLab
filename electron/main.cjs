const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    icon: path.join(__dirname, '../src/assets/JSONLab_Icon.png'),
    backgroundColor: '#1e1e1e',
    show: false,
    autoHideMenuBar: true,  // Hide menu bar (press Alt to show)
    // Or use: frame: false,  // For completely frameless window
    // titleBarStyle: 'hidden',  // For custom title bar (macOS)
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Remove the default menu completely (Windows/Linux)
  mainWindow.setMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handler for CORS-free HTTP requests
ipcMain.handle('http-request', async (event, options) => {
  return new Promise((resolve, reject) => {
    const { url, method = 'GET', headers = {}, body, timeout = 30000 } = options;
    
    try {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: method.toUpperCase(),
        headers: {
          'User-Agent': 'JSONLab Desktop/1.0.0',
          ...headers,
        },
        timeout,
      };

      const req = protocol.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            data: data,
          });
        });
      });

      req.on('error', (error) => {
        reject({
          message: error.message,
          code: error.code,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject({
          message: 'Request timeout',
          code: 'ETIMEDOUT',
        });
      });

      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        req.write(body);
      }

      req.end();
    } catch (error) {
      reject({
        message: error.message,
        code: 'INVALID_URL',
      });
    }
  });
});

// Get app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Check if running in Electron
ipcMain.handle('is-electron', () => {
  return true;
});
