'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The original preload still runs through BrowserWindow.webPreferences.preload.

console.log('[browser-preload] loaded');
contextBridge.exposeInMainWorld('vortexHelp', Object.freeze({

  open: mode => ipcRenderer.invoke('vortex-help:open', mode === 'tutorial' ? 'tutorial' : 'help')

}));
