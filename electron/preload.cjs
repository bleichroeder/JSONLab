const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Make HTTP requests without CORS restrictions
  httpRequest: (options) => ipcRenderer.invoke('http-request', options),
  
  // Get app version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Check if running in Electron
  isElectron: () => ipcRenderer.invoke('is-electron'),
});
