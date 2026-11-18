(() => {

  'use strict';

  const scriptURL = new URL('../website/help/vortex.png', location.href).href;

  let favicon = document.querySelector('link[rel="icon"]');

  if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.append(favicon); }

  favicon.type = 'image/png'; favicon.href = scriptURL;

  function mark() { const image = document.createElement('img'); image.className = 'vortex-brand-icon'; image.src = scriptURL; image.alt = ''; image.width = 30; image.height = 30; return image; }

  function helpButton(label, mode) { const b = document.createElement('button'); b.type = 'button'; b.className = 'text-btn vortex-help-button'; b.textContent = label; b.addEventListener('click', () => window.vortexHelp?.open(mode)); return b; }

  function update() {

    const brand = document.querySelector('.brand');

    if (brand && !brand.querySelector('.vortex-brand-icon')) { brand.replaceChildren(mark(), document.createTextNode('Vortex')); }

    document.querySelectorAll('.newtab-page h1').forEach(h => { if (!h.querySelector('.vortex-brand-icon')) h.prepend(mark()); });

    const toolbar = document.getElementById('toolbar');

    if (toolbar && !document.getElementById('btn-help-guide')) { const b = helpButton('?', 'help'); b.id = 'btn-help-guide'; b.className = 'icon-btn'; b.title = 'Help & Guide'; b.setAttribute('aria-label', 'Help & Guide'); toolbar.append(b); }

    const menu = document.getElementById('menu-items');

    if (menu && !menu.querySelector('.vortex-help-button')) menu.append(helpButton('Help & Guide', 'help'));

    const panel = document.getElementById('panel-content');

    if (panel && document.getElementById('sidebar-title')?.textContent === 'Settings' && !panel.querySelector('.vortex-help-button')) {

      panel.append(helpButton('Help & Guide', 'help'), helpButton('Restart Browser Tutorial', 'tutorial'));

    }

  }

  update();

  new MutationObserver(update).observe(document.body, { childList: true, subtree: true });

})();
