'use strict';
// Use this as the Electron entry instead of main.js. The original main stays untouched.
const { app, BrowserWindow, ipcMain, Menu, MenuItem } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const helpFile = path.join(__dirname, 'help', 'index.html');
const helpURL = pathToFileURL(helpFile).href;
const browserFile = path.join(__dirname, '..', 'renderer', 'index.html');
const browserURL = pathToFileURL(browserFile).href;
const appIcon = path.join(__dirname, 'icons', process.platform === 'win32' ? 'vortex.ico' : 'vortex.png');
const browserScripts = fs.readFileSync(path.join(__dirname, 'browser-branding.js'), 'utf8');
const browserStyles = fs.readFileSync(path.join(__dirname, 'browser-branding.css'), 'utf8');
let helpWindow = null;
function statusFile() { return path.join(app.getPath('userData'), 'vortex-onboarding.json'); }
function isComplete() { try { return JSON.parse(fs.readFileSync(statusFile(), 'utf8')).completed === true; } catch { return false; } }
function complete() { const file = statusFile(); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify({ completed: true, completedAt: new Date().toISOString() })); fs.renameSync(file + '.tmp', file); return true; }
function trusted(event) { return Boolean(helpWindow && !helpWindow.isDestroyed() && event.sender === helpWindow.webContents && event.senderFrame === helpWindow.webContents.mainFrame && event.senderFrame.url.split('?')[0] === helpURL); }
function openHelp(mode = 'help') {
  if (helpWindow && !helpWindow.isDestroyed()) { helpWindow.loadFile(helpFile, { query: { mode } }); helpWindow.show(); helpWindow.focus(); return; }
  helpWindow = new BrowserWindow({ width: 1280, height: 900, minWidth: 380, minHeight: 550, title: 'Vortex — Help & Guide', icon: appIcon, webPreferences: { preload: path.join(__dirname, 'help-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false } });
  helpWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  helpWindow.webContents.on('will-navigate', (event, url) => { if (url.split('?')[0] !== helpURL) event.preventDefault(); });
  helpWindow.on('closed', () => { helpWindow = null; });
  helpWindow.loadFile(helpFile, { query: { mode } });
}
// Apply branding to the original browser without editing its supplied source files.
const originalLoadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function(file, options) {
  if (path.resolve(file) === browserFile) {
    this.webContents.setPreloads([...this.webContents.getPreloads(), path.join(__dirname, 'browser-preload.cjs')]);
  }
  return originalLoadFile.call(this, file, options);
};
app.on('browser-window-created', (_event, window) => {
  window.setIcon(appIcon);
  const contents = window.webContents;
  contents.on('did-finish-load', async () => {
    if (contents.isDestroyed() || contents.getURL().split('?')[0] !== browserURL) return;
    try {
      await contents.insertCSS(browserStyles);
      await contents.executeJavaScript(browserScripts);
    } catch (error) { console.error('[Vortex branding]', error.message); }
  });
});
if (process.platform === 'win32') app.setAppUserModelId('app.vortex.browser');
// Existing browser behavior, storage path, permission handlers, and downloads stay in main.js.
require(path.join(__dirname, '..', 'main.js'));
app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.setIcon(appIcon);
  ipcMain.handle('vortex-help:open', (event, mode) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (!sender || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url.split('?')[0] !== browserURL) throw new Error('Untrusted sender');
    openHelp(mode === 'tutorial' ? 'tutorial' : 'help');
    return true;
  });
  ipcMain.handle('vortex-help:is-complete', event => { if (!trusted(event)) throw new Error('Untrusted sender'); return isComplete(); });
  ipcMain.handle('vortex-help:complete', event => { if (!trusted(event)) throw new Error('Untrusted sender'); return complete(); });
  ipcMain.handle('vortex-help:info', event => { if (!trusted(event)) throw new Error('Untrusted sender'); return { version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome }; });
  ipcMain.on('vortex-help:close', event => { if (trusted(event)) helpWindow?.close(); });
  const menu = Menu.getApplicationMenu() || new Menu();
  menu.append(new MenuItem({ label: 'Help', submenu: [ { label: 'Help & Guide', click: () => openHelp('help') }, { label: 'Restart Browser Tutorial', click: () => openHelp('tutorial') } ] }));
  Menu.setApplicationMenu(menu);
  if (!isComplete()) openHelp('first-launch');
});
module.exports = { isComplete, openHelp };
