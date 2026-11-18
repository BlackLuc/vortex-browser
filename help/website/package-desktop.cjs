'use strict';
// Run from the existing browser root after installing @electron/packager.
const path = require('node:path');
const fs = require('node:fs');
async function main() {
  const platform = process.argv[2] || process.platform;
  const arch = process.argv[3] || process.arch;
  if (!['win32', 'darwin', 'linux'].includes(platform)) throw new Error('Use win32, darwin, or linux.');
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Use x64 or arm64.');
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.main !== 'website/vortex-entry.cjs') throw new Error('Set package.json main to website/vortex-entry.cjs first.');
  const { packager } = await import('@electron/packager');
  const icon = path.join(__dirname, 'icons', platform === 'win32' ? 'vortex.ico' : platform === 'darwin' ? 'vortex.icns' : 'vortex.png');
  const paths = await packager({ dir: root, name: 'Vortex Browser', platform, arch, icon, out: path.join(root, 'electron-release'), overwrite: true, ignore: [/^\/electron-release(?:\/|$)/, /(?:^|\/)\.git(?:\/|$)/, /(?:^|\/)\.jj(?:\/|$)/], appBundleId: 'app.vortex.browser', executableName: 'VortexBrowser' });
  for (const output of paths) console.log('Packaged Vortex:', output);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
