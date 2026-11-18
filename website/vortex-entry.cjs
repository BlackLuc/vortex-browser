'use strict';

const { app, BrowserWindow, ipcMain, Menu, MenuItem } = require('electron');

const path = require('node:path');

const fs = require('node:fs');

const { pathToFileURL } = require('node:url');

const helpFile = path.join(__dirname, 'help', 'index.html');

const helpURL = pathToFileURL(helpFile).href;

// Online help site (replace with your deployed URL)
const HELP_ONLINE_URL = process.env.VORTEX_HELP_URL || 'https://vortex-browser.example.com/help';

const browserFile = path.join(__dirname, '..', 'renderer', 'index.html');

const browserURL = pathToFileURL(browserFile).href;

const appIcon = path.join(__dirname, 'icons', process.platform === 'win32' ? 'vortex.ico' : 'vortex.png');

const browserScripts = fs.readFileSync(path.join(__dirname, 'browser-branding.js'), 'utf8');

const browserStyles = fs.readFileSync(path.join(__dirname, 'browser-branding.css'), 'utf8');

let mainWindow = null;

function helpTabUrl(mode) {
  const u = new URL(HELP_ONLINE_URL);
  u.searchParams.set('page', mode === 'tutorial' ? 'tutorial' : 'overview');
  u.searchParams.set('mode', mode === 'tutorial' ? 'tutorial' : (mode === 'first-launch' ? 'first-launch' : 'help'));
  return u.href;
}

function statusFile() { return path.join(app.getPath('userData'), 'vortex-onboarding.json'); }

function isComplete() { try { return JSON.parse(fs.readFileSync(statusFile(), 'utf8')).completed === true; } catch { return false; } }

function complete() { const file = statusFile(); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify({ completed: true, completedAt: new Date().toISOString() })); fs.renameSync(file + '.tmp', file); return true; }

function trustedBrowser(event) { const w = BrowserWindow.fromWebContents(event.sender); return Boolean(w && !w.isDestroyed() && event.sender === w.webContents && event.senderFrame === w.webContents.mainFrame && event.senderFrame.url.split('?')[0] === browserURL); }

// Apply branding to the original browser without editing its supplied source files.

const originalLoadFile = BrowserWindow.prototype.loadFile;

BrowserWindow.prototype.loadFile = function(file, options) {

  return originalLoadFile.call(this, file, options);

};

app.on('browser-window-created', (_event, window) => {

  try { if (fs.existsSync(appIcon)) window.setIcon(appIcon); } catch (e) {}

  const contents = window.webContents;

  mainWindow = window;

  contents.on('did-finish-load', async () => {

    if (contents.isDestroyed() || contents.getURL().split('?')[0] !== browserURL) return;

    try {

      await contents.insertCSS(browserStyles);

      await contents.executeJavaScript(browserScripts);

      const hasHelp = await contents.executeJavaScript('typeof window.vortexHelp');

      console.log('[Vortex branding] vortexHelp =', hasHelp);

    } catch (error) { console.error('[Vortex branding]', error.message); }

  });

});

if (process.platform === 'win32') app.setAppUserModelId('app.vortex.browser');

// Existing browser behavior, storage path, permission handlers, and downloads stay in main.js.

require(path.join(__dirname, '..', 'main.js'));

app.whenReady().then(() => {

  if (process.platform === 'darwin') { try { if (fs.existsSync(appIcon)) app.dock?.setIcon(appIcon); } catch (e) {} }

  ipcMain.handle('vortex-help:open', (event, mode) => {

    console.log('[vortex-entry] vortex-help:open called, mode=', mode, 'trusted=', trustedBrowser(event));

    if (!trustedBrowser(event)) throw new Error('Untrusted sender');

    mainWindow?.webContents.send('open-help-tab', helpTabUrl(mode === 'tutorial' ? 'tutorial' : 'help'));

    return true;

  });

  ipcMain.handle('vortex-help:is-complete', event => { if (!trustedBrowser(event)) throw new Error('Untrusted sender'); return isComplete(); });

  ipcMain.handle('vortex-help:complete', event => { if (!trustedBrowser(event)) throw new Error('Untrusted sender'); return complete(); });

  ipcMain.handle('vortex-help:info', event => { if (!trustedBrowser(event)) throw new Error('Untrusted sender'); return { version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome }; });

  ipcMain.on('vortex-help:close', event => { if (trustedBrowser(event)) mainWindow?.webContents.send('close-help-tab'); });

  const menu = Menu.getApplicationMenu() || new Menu();

  menu.append(new MenuItem({ label: 'Help', submenu: [ { label: 'Help & Guide', click: () => mainWindow?.webContents.send('open-help-tab', helpTabUrl('help')) }, { label: 'Restart Browser Tutorial', click: () => mainWindow?.webContents.send('open-help-tab', helpTabUrl('tutorial')) } ] }));

  Menu.setApplicationMenu(menu);

  // Open help on first launch as a tab
  mainWindow?.webContents.on('did-finish-load', () => {
    if (!isComplete()) {
      setTimeout(() => mainWindow?.webContents.send('open-help-tab', helpTabUrl('first-launch')), 500);
    }
  });

});

module.exports = { isComplete, openHelp: (m) => mainWindow?.webContents.send('open-help-tab', helpTabUrl(m)) };
