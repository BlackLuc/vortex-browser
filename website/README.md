# Vortex local Help & Guide

Copy this `website` folder alongside your original `main.js`, `preload.js`, and `renderer` directory. It contains its own help/index.html, help/styles.css, help/help.js, help/data.js, and local images. Your existing files are not replaced.

Start Electron using the new entry:

```
electron website/vortex-entry.cjs
```

For permanent integration, set your existing package.json main field to `website/vortex-entry.cjs`. Your package.json was not provided, so no replacement was generated. If your packager uses a files allowlist, include `website/**` and your existing main/preload/renderer files.

The entry loads your original main.js, then adds a Help menu with Help & Guide and Restart Browser Tutorial. It opens a separate help window on first launch only. Completing or skipping the tutorial saves an atomic JSON flag in the existing app user-data folder. Restart Tutorial does not delete that flag. Help is sandboxed with context isolation; its preload exposes only four narrow operations, validated against the help window and its main frame. Browser version and Electron/Chromium build information come from the installed host.

The ordinary web preview stores completion in localStorage. This is a preview fallback, not a replacement for desktop persistence.

## Matching icons and browser Help buttons
The same website spiral is included as help/icon.png and icons/vortex.png, vortex.ico, and vortex.icns. The launcher sets browser/help window icons and the macOS Dock icon. An additional narrow preload and local branding script add matching browser branding, a Help & Guide toolbar/menu button, and help/tutorial buttons in Settings. Your original preload and renderer files are not replaced.

For the executable and desktop shortcut icon, repackage the browser with the supplied script:

```
bun add -d @electron/packager
node website/package-desktop.cjs win32 x64
```

Use `darwin arm64`, `darwin x64`, or `linux x64` for other targets. The packaged executable carries the platform icon. Create a Windows shortcut to that new executable; an existing installed executable or cached desktop shortcut is not changed by a website. macOS app bundle icons use vortex.icns. Linux launchers must use the supplied vortex.png as their Icon entry. Installers and signing are not included.

## Existing integration mismatch
Your renderer expects `window.vortex`; your existing preload exposes `window.browserAPI`. Several functions and event payloads also differ. This help-center add-on does not silently change those existing APIs. Desktop-dependent features are documented as requiring host wiring. The current main installs a fixed blocker on the default session but does not expose a blocker toggle or statistics. New/incognito windows are not exposed by the current main/preload. Keyboard shortcuts are implemented in the renderer document; forwarding them from focused guest webviews is not implemented in the supplied main.

## Verification
The local help center has been checked in Chromium at desktop and mobile sizes, including tutorial completion, saved status, search navigation, and image loading. Unit tests cover seven steps and completion persistence. The Electron extension is source-checked and its IPC behavior is tested with a simulated host; actual window/desktop icons, first-launch opening, and native menus still need a test in your installed Electron project because its package.json and runtime are not provided.
