'use strict';

const { app, BrowserWindow, ipcMain, Menu, MenuItem, dialog, shell } = require('electron');

const { autoUpdater } = require('electron-updater');

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

let mainWindow = null;

function helpTabUrl(mode) {
  const u = new URL('https://polite-bonbon-66a779.netlify.app/help');
  u.searchParams.set('page', mode === 'tutorial' ? 'tutorial' : 'overview');
  u.searchParams.set('mode', mode === 'tutorial' ? 'tutorial' : (mode === 'first-launch' ? 'first-launch' : 'help'));
  return u.href;
}

function statusFile() { return path.join(app.getPath('userData'), 'vortex-onboarding.json'); }

function isComplete() { try { return JSON.parse(fs.readFileSync(statusFile(), 'utf8')).completed === true; } catch { return false; } }

function complete() { const file = statusFile(); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify({ completed: true, completedAt: new Date().toISOString() })); fs.renameSync(file + '.tmp', file); return true; }

function trustedBrowser(event) { const w = BrowserWindow.fromWebContents(event.sender); return Boolean(w && !w.isDestroyed() && event.sender === w.webContents && event.senderFrame === w.webContents.mainFrame && event.senderFrame.url.split('?')[0] === browserURL); }

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

require(path.join(__dirname, '..', 'main.js'));

app.whenReady().then(() => {
  if (process.platform === 'darwin') { try { if (fs.existsSync(appIcon)) app.dock?.setIcon(appIcon); } catch (e) {} }

  // Auto-updater (GitHub releases via electron-updater)
  setTimeout(() => {
    try {
      autoUpdater.forceDevUpdateConfig = true;
      autoUpdater.autoDownload = true;
      autoUpdater.on('update-available', (info) => { console.log('[Vortex] Update available:', info.version); });
      autoUpdater.on('update-downloaded', (info) => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          title: 'Update ready',
          message: 'A new version of Vortex (' + info.version + ') has been downloaded. Restart now to apply?'
        }).then(result => {
          if (result.response === 0) autoUpdater.quitAndInstall();
        });
      });
      autoUpdater.on('error', (err) => { console.error('[Vortex] Auto-update error:', err == null ? err : err.message); });
      autoUpdater.checkForUpdatesAndNotify();
    } catch (e) { console.error('[Vortex] Auto-updater init failed:', e && e.message); }
  }, 1500);

  ipcMain.handle('vortex-admin:release-current', async () => {
    const projectDir = path.join(__dirname, '..');
    const pkgPath = path.join(projectDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const parts = String(pkg.version || '0.0.0').split('.').map(Number);
    while (parts.length < 3) parts.push(0);
    parts[2] = (parts[2] || 0) + 1;
    const newVersion = parts.join('.');
    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

    const { spawn } = require('child_process');
    const build = await new Promise(resolve => {
      const child = spawn('npx', ['electron-builder', '--win', '--x64', '--publish', 'always'], {
        cwd: projectDir,
        shell: true,
        stdio: 'inherit',
        env: Object.assign({}, process.env, { GITHUB_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '' })
      });
      child.on('close', code => resolve({ code }));
    });

    if (build.code !== 0) throw new Error('Release build failed with exit code ' + build.code + '.');
    return { ok: true, version: newVersion, at: new Date().toISOString() };
  });

  ipcMain.handle('vortex-admin:is-dev', () => ({ dev: !app.isPackaged }));

  ipcMain.handle('vortex-help:open', (event, mode) => {
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

  mainWindow?.webContents.on('did-finish-load', () => {
    if (!isComplete()) {
      setTimeout(() => mainWindow?.webContents.send('open-help-tab', helpTabUrl('first-launch')), 500);
    }
  });

});

module.exports = { isComplete, openHelp: (m) => mainWindow?.webContents.send('open-help-tab', helpTabUrl(m)) };
