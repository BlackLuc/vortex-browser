# Complete Vortex source

Original browser files are unchanged. Copy website alongside them; set your existing package.json main to website/vortex-entry.cjs.

## website/browser-branding.css

```css
.vortex-brand-icon { width: 30px; height: 30px; object-fit: contain; vertical-align: middle; flex-shrink: 0; border-radius: 6px; }
.brand { display: inline-flex; align-items: center; gap: 8px; }
.newtab-page h1 .vortex-brand-icon { width: 46px; height: 46px; margin-right: 12px; }
.vortex-help-button { margin: 6px; }

```

## website/browser-branding.js

```javascript
(() => {
  'use strict';
  const scriptURL = new URL('../website/help/icon.png', location.href).href;
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

```

## website/browser-preload.cjs

```javascript
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// The original preload still runs through BrowserWindow.webPreferences.preload.
contextBridge.exposeInMainWorld('vortexHelp', Object.freeze({
  open: mode => ipcRenderer.invoke('vortex-help:open', mode === 'tutorial' ? 'tutorial' : 'help')
}));

```

## website/help/data.js

```javascript
const categories = [["tabs", "Tabs & Navigation", "\u25a3", "A little less tab chaos. A lot more flow.", [["New tabs", "Keep your next idea one tab away.", "Click + beside your tabs, or press Ctrl + T.", "Ctrl + T"], ["Close & reopen tabs", "Bring back a tab you closed by accident.", "Close with the \u00d7 on a tab. Reopen the most recently closed tab with Ctrl + Shift + T.", "Ctrl + Shift + T"], ["Pin & mute tabs", "Keep essentials nearby and quiet distracting audio.", "Right-click a tab and choose Pin or Mute. Pinned tabs stay at the front of the workspace.", ""], ["Switch tabs", "Move between your open pages.", "Click a tab, use Ctrl + Tab, or Ctrl + 1 through 9. Ctrl + 9 selects the last tab.", "Ctrl + Tab"], ["New windows", "Give your browsing a separate window.", "Choose New window in the browser menu. Requires desktop-host support.", "Ctrl + N"], ["Incognito windows", "Keep a browsing session separate.", "Choose New incognito window in the menu. The desktop host must enforce isolated private sessions.", "Ctrl + Shift + N"]]], ["search", "Search & Address Bar", "\u2315", "One place for wherever you want to go.", [["Search or navigate", "A website address and a search box, in one.", "Click the address bar. Enter a website or search terms, then press Enter.", "Ctrl + L"], ["Search suggestions", "Find matches from your tabs, bookmarks and history.", "Start typing in the address bar. Use arrow keys to select a suggestion and Enter to open it.", ""], ["Search engine", "Search with the engine you prefer.", "Open Settings \u2192 Search \u2192 Search engine. Choose Google, Bing, DuckDuckGo, Yahoo or a custom search URL.", ""], ["Back, forward & reload", "Pick up where you left off.", "Use the arrows beside the address bar. Reload with the circular arrow or Ctrl + R.", "Ctrl + R"]]], ["bookmarks", "Bookmarks", "\u2606", "Your favorite corners of the internet, saved.", [["Save a bookmark", "Keep a useful page close.", "Click the star in the address bar to bookmark the current page.", "Ctrl + D"], ["Manage bookmarks", "Find and remove saved pages.", "Open the star in the toolbar or press Ctrl + B. Browse your saved bookmarks in the side panel.", "Ctrl + B"], ["Bookmarks bar", "Your saved pages, just below the address bar.", "Open Settings \u2192 Appearance \u2192 Bookmarks bar, or toggle it with Ctrl + Shift + B.", "Ctrl + Shift + B"], ["Bookmark folders", "Group bookmarks into folders.", "Folder organization is not present in the supplied browser renderer.", "", "Coming Soon"]]], ["privacy", "Privacy & Security", "\u25c7", "A more intentional way to browse.", [["Privacy dashboard", "See privacy information in one place.", "Open the menu \u2192 Open privacy dashboard. Blocking statistics require desktop-host support.", ""], ["Ad & tracker blocking", "Reduce unwanted ads and tracking when supported.", "Open the privacy dashboard. A blocker control is available only when the desktop host provides it. Its state must be confirmed by the host.", ""], ["Website permissions", "Make informed decisions about site access.", "Click the permissions icon in the address bar. Camera, microphone and other permission enforcement depend on the desktop host.", ""], ["Clear browsing data", "Choose when to clear your local browsing records.", "Open Settings \u2192 Clear browsing data. This also clears bookmarks. Without desktop-host support, website cookies are not removed.", ""]]], ["productivity", "Productivity", "\u25eb", "Make room for your best work.", [["Split-screen browsing", "Two pages, one focused view.", "Open two tabs in a workspace, then click the split-view icon beside the workspace selector. Click again to leave split view.", ""], ["Workspaces", "Separate your projects and browsing contexts.", "Use the workspace selector beside your tabs. Click its + button to create a workspace.", ""], ["Reader mode", "A simpler reading layout.", "Open the command palette and select Toggle reader mode. Read aloud is available when speech synthesis is supported.", ""], ["Command palette", "Your browser actions in one place.", "Press Ctrl + K, then search commands, tabs, bookmarks or history.", "Ctrl + K"], ["Find in page", "Jump to the words you need.", "Press Ctrl + F. Enter text and use the arrows to move between results.", "Ctrl + F"], ["History & downloads", "Return to visited pages and manage files.", "Use the clock and download icons. Download events and file actions require desktop-host support.", "Ctrl + H"]]], ["customization", "Appearance & Customization", "\u25d0", "Make Vortex feel like your space.", [["Themes & accents", "Match the browser to your taste.", "Open Settings \u2192 Appearance. Select Dark or Light and choose an accent color.", ""], ["Homepage", "Start somewhere that matters to you.", "Open Settings \u2192 Startup \u2192 Homepage and enter a complete HTTP or HTTPS address.", ""], ["Zoom", "Give everything a little more breathing room.", "Use Ctrl + + or Ctrl + \u2212. Reset with Ctrl + 0. Set the default zoom in Settings \u2192 Appearance.", "Ctrl + 0"], ["Session restore", "Resume your previous browsing session.", "Open Settings \u2192 Startup \u2192 Restore session. Private browsing does not save sessions in the renderer.", ""]]], ["settings", "Browser Settings", "\u2699", "Your preferences. Your rules.", [["Open settings", "Manage the browser from its settings panel.", "Click the gear in the toolbar, or use Ctrl + comma.", "Ctrl + ,"], ["Appearance & search", "Set your theme, accents and search engine.", "Open Settings and find the Appearance or Search section.", ""], ["Downloads", "Choose where your downloads go.", "Open Settings \u2192 Downloads \u2192 Download folder. Changing the folder requires desktop-host support.", ""], ["Startup & permissions", "Manage startup behavior and website access.", "Startup options live in Settings. Website permissions are accessed from the address bar or privacy dashboard.", ""]]]];
const troubleshooting = [["Website not loading", ["Check your internet connection and try another website.", "Check the address, then reload with Ctrl + R.", "If blocking is enabled, try disabling it for diagnosis in the privacy dashboard."]], ["Browser running slowly", ["Close tabs you no longer need.", "Reduce the number of pages in split view.", "Restart Vortex. Save any work before restarting."]], ["Tabs not responding", ["Try reloading the affected tab.", "Close the tab and reopen it with Ctrl + Shift + T.", "Restart the browser if the problem continues."]], ["Downloads not working", ["Check your connection and available disk space.", "Open the Downloads panel and check the download state.", "Check your download folder in Settings. Download handling requires desktop-host support."]], ["Bookmarks disappearing", ["Confirm you are using your normal browsing window, not incognito.", "Open the Bookmarks panel with Ctrl + B.", "Clearing browsing data also clears bookmarks; there is no automatic bookmark recovery in the supplied renderer."]], ["Browser crashing", ["Restart Vortex and try opening fewer tabs.", "If one website triggers the issue, avoid restoring that page.", "Record the website and steps that caused the crash before reporting it."]], ["Search suggestions not appearing", ["Suggestions use your local tabs, bookmarks and history; they are not remote search-engine suggestions.", "Start typing a known page title or address.", "Check that you have saved bookmarks or browsing history."]], ["Websites requesting permissions", ["Check that you recognize the requesting website.", "Allow camera or microphone access only when needed.", "Review permissions using the icon beside the address bar. Enforcement requires desktop-host support."]], ["Ad blocker causing website issues", ["Open the privacy dashboard.", "If the host provides a blocker, turn it off temporarily and reload.", "Re-enable protection after checking the website."]]];
const faqs = [["How do I change my default search engine?", "Open Settings \u2192 Search \u2192 Search engine and select your preferred provider."], ["How do I clear browsing history?", "Open Settings \u2192 Clear browsing data. Warning: this also removes bookmarks. Clearing website cookies additionally requires desktop-host support."], ["How do I open an incognito window?", "Use the browser menu \u2192 New incognito window, or Ctrl + Shift + N. Availability and session isolation depend on the desktop host."], ["How do I manage bookmarks?", "Press Ctrl + B to open the Bookmarks panel. Use the address-bar star to save or remove a page."], ["How do I enable dark mode?", "Open Settings \u2192 Appearance \u2192 Theme \u2192 Dark."], ["How do I manage website permissions?", "Click the permissions icon in the address bar. The desktop host must provide permission handling."], ["How do I reopen closed tabs?", "Press Ctrl + Shift + T. Recently closed tabs are kept for the current browser session."], ["How do I reset Vortex Browser?", "A full reset action is not implemented in the supplied renderer. Clear browsing data is not a full reset and also deletes bookmarks."], ["How do I access the tutorial again?", "Open Interactive Tutorial in this help center, or select Restart Browser Tutorial here in Settings. The browser-menu entry needs desktop integration."]];
const shortcuts = [["New tab", "Ctrl + T", "Tabs"], ["Close tab", "Ctrl + W", "Tabs"], ["Reopen closed tab", "Ctrl + Shift + T", "Tabs"], ["Next / previous tab", "Ctrl + Tab / Ctrl + Shift + Tab", "Tabs"], ["Select tab", "Ctrl + 1\u20139", "Tabs"], ["Focus address bar", "Ctrl + L", "Navigation"], ["Reload page", "Ctrl + R / F5", "Navigation"], ["Back / forward", "Alt + \u2190 / Alt + \u2192", "Navigation"], ["Bookmark current page", "Ctrl + D", "Bookmarks"], ["Open bookmarks", "Ctrl + B", "Bookmarks"], ["Toggle bookmarks bar", "Ctrl + Shift + B", "Bookmarks"], ["Find in page", "Ctrl + F", "Tools"], ["History", "Ctrl + H", "Tools"], ["Downloads", "Ctrl + J", "Tools"], ["Command palette", "Ctrl + K", "Tools"], ["Settings", "Ctrl + ,", "Tools"], ["Zoom in / out", "Ctrl + + / Ctrl + \u2212", "Tools"], ["Reset zoom", "Ctrl + 0", "Tools"], ["Print page", "Ctrl + P", "Tools"], ["Fullscreen", "F11", "Tools"], ["Developer tools", "F12", "Tools"], ["New window", "Ctrl + N", "Desktop host"], ["Incognito window", "Ctrl + Shift + N", "Desktop host"]];
const COMPLETION_KEY = "vortex-help-onboarding-v1";
function readCompletion(storage) { try { return storage.getItem(COMPLETION_KEY) === "completed"; } catch { return false; } }
function saveCompletion(storage) { storage.setItem(COMPLETION_KEY, "completed"); }
function findArticles(query) { const term = query.toLowerCase().trim(); return categories.flatMap(c => c[4].map(f => ({ category: c[1], id: c[0], feature: f }))).filter(a => (a.category + " " + a.feature.join(" ")).toLowerCase().includes(term)); }

```

## website/help/help.js

```javascript
"use strict";
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pages = [['overview','Overview','▦'],['getting-started','Getting Started','↗'],['tutorial','Interactive Tutorial','▷'],['features','Features','◫'],['shortcuts','Keyboard Shortcuts','⌘'],['privacy','Privacy & Security','◇'],['settings','Settings','⚙'],['troubleshooting','Troubleshooting','⊙'],['faq','FAQ','?'],['about','About Vortex','ⓘ']];
let page = params.get('page') || 'overview';
let step = 0;
let demoTabs = 1;
let demoBookmarked = false;
let completed = false;
let toastTimer;
let info = null;
const native = window.vortexHelp;
function el(tag, cls, text) { const n = document.createElement(tag); if(cls) n.className = cls; if(text !== undefined) n.textContent = text; return n; }
function append(parent, ...children) { children.forEach(c => parent.append(c)); return parent; }
function action(label, run, variant='') { const b=el('button',`button ${variant}`,label); b.type='button'; b.addEventListener('click',run); return b; }
function link(label, target, cls='text-link') { const a=el('a',cls,label); a.href=`?page=${target}`; a.addEventListener('click',e=>{e.preventDefault();navigate(target);}); return a; }
function logo() { const image = el('img', 'logo'); image.src = 'icon.png'; image.alt = ''; image.width = 65; image.height = 65; return image; }
function icon(text, tone='') { return el('span',`card-icon ${tone}`,text); }
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function navigate(target, push=true){if(!pages.some(p=>p[0]===target))target='overview';page=target;$('search').value='';$('sidebar').classList.remove('open');if(push){const q=new URLSearchParams(location.search);q.set('page',page);history.pushState({},'',`?${q}`);}render();window.scrollTo(0,0);}
function startTutorial(){step=0;demoTabs=1;navigate('tutorial');}
async function finish(skip=false){try{if(native){const ok=await native.complete();if(ok!==true)throw new Error('Not saved');}else saveCompletion(localStorage);completed=true;if(skip)navigate('features');else showCompletion();}catch{toast('Your progress could not be saved. Please try again.');}}
function heading(title,description){const box=el('div','page-heading');append(box,el('h1','',title),el('p','',description));return box;}
function guideCard(title,description,symbol,target,tone='',label='Explore guide'){const a=link('',target,'guide-card');append(a,icon(symbol,tone),el('h3','',title),el('p','',description),append(el('div','card-link'),el('span','',label),el('span','','↗')));return a;}
function sectionHeading(title,description,target,label='View all →'){const box=el('div','section-heading');const text=el('div');append(text,el('h2','',title));if(description)text.append(el('p','',description));box.append(text);if(target)box.append(link(label,target));return box;}
function detail(title,answer,how,shortcut,status){const d=el('details','guide-details');const s=el('summary');s.append(el('span','',title));if(status)s.append(el('span','pill warning',status));append(d,s,el('p','',answer));if(how)d.append(el('p','howto',how));if(shortcut)d.append(append(el('p'),el('kbd','',shortcut)));return d;}
function overview(root){const hero=el('section','hero');const image=el('img','hero-art');image.src='cover.jpg';image.alt='Vortex’s blue and violet glass spiral';image.width=1536;image.height=1024;hero.append(image);const copy=el('div','hero-copy');append(copy,append(el('div','eyebrow'),el('span','','✧'),el('span','',completed?'WELCOME BACK TO YOUR SPACE':'A NEW WAY TO BROWSE')),el('h1','','Welcome to\nVortex Browser'),el('p','tagline','Your internet. Your space. Your control.'),el('p','intro','Fast, focused, and made for you. Get to know your browser and make the internet feel a little more like home.'));
append(copy,append(el('div','actions'),action(completed?'Restart Tutorial  →':'Start Tutorial  →',startTutorial,'primary'),completed?link('Explore features →','features','button quiet'):action('Skip for Now',()=>finish(true),'quiet')),el('p','tiny-note','7 simple steps · About 5 minutes · Go at your own pace'));append(hero,copy);root.append(hero);
const benefits=el('div','benefits');[['ϟ','Fast by design'],['◇','Privacy-minded'],['◐','Uniquely yours'],['◫','Built for focus']].forEach(([i,t])=>benefits.append(append(el('span'),el('b','',i),el('span','',t))));root.append(benefits);
root.append(sectionHeading('Make yourself at home','Everything you need to get more out of Vortex.','features'));
append(root,append(el('div','card-grid'),guideCard('Getting Started','Your first tabs, your favorite sites, and a browser that feels like you.','↗','getting-started','','Start here'),guideCard('Explore Features','Discover the little things that make a big difference to your browsing.','◫','features','blue'),guideCard('Privacy & Security','Understand your privacy controls and browse with more confidence.','◇','privacy','green')));
const bottom=el('div','overview-bottom');const popular=el('section');popular.append(sectionHeading('Popular guides','', 'faq','All guides →'));[['Change your default search engine','settings','⌕'],['Manage your tabs & workspaces','features','▣'],['Customize your browser’s appearance','settings','◐']].forEach(([t,p,i])=>popular.append(append(link('',p,'article-row'),el('span','',i),el('span','',t),el('span','','↗'))));const quick=el('section');quick.append(sectionHeading('A few handy shortcuts','','shortcuts','View all →'));[['New tab','Ctrl + T'],['Search or enter an address','Ctrl + L'],['Find anything with commands','Ctrl + K']].forEach(([t,k])=>quick.append(append(el('div','shortcut-line'),el('span','',t),el('kbd','',k))));append(bottom,popular,quick);root.append(bottom);
const strip=el('section','tutorial-strip');append(strip,icon('▷'),append(el('div'),el('h3','','A small tour. A big head start.'),el('p','','Take the interactive tutorial and discover what Vortex can do.')),action('Take the tour  →',startTutorial));root.append(strip);}
function showCategory(root,c,showDemo=false){const s=el('section','feature-category');s.append(el('h2','',c[1]));if(showDemo)s.append(browserDemo(c[0]));c[4].forEach(f=>s.append(detail(f[0],f[1],f[2],f[3],f[4])));root.append(s);}
function browserDemo(id){const box=el('div','browser-demo');const tabs=el('div','demo-tabs');const dots=el('span','window-dots');for(let i=0;i<3;i++)dots.append(el('i'));tabs.append(dots);for(let i=0;i<demoTabs;i++){const tab=el('div','demo-tab');append(tab,logo(),el('span','',i===0?'Your space':'New tab'));if(demoTabs>1){const close=el('button','icon-button','×');close.setAttribute('aria-label',`Close practice tab ${i+1}`);close.addEventListener('click',()=>{demoTabs--;refreshDemo(id);practiceStatus('Tab closed. You’re in control.');});tab.append(close);}tabs.append(tab);}const plus=el('button','icon-button','+');plus.setAttribute('aria-label','Open practice tab');plus.addEventListener('click',()=>{if(demoTabs<3)demoTabs++;refreshDemo(id);practiceStatus('New tab opened. Nicely done!');});tabs.append(plus);box.append(tabs);
const toolbar=el('div','demo-toolbar');append(toolbar,el('span','','←'),el('span','','→'),el('span','','↻'));const address=el('div','demo-address');const input=el('input');input.value='vortex://new-tab';input.setAttribute('aria-label','Practice address bar');input.addEventListener('keydown',e=>{if(e.key==='Enter'){practiceStatus('Great! In the browser, Enter opens your address or search.');}});const star=el('button','icon-button',demoBookmarked?'★':'☆');star.setAttribute('aria-label','Bookmark practice page');star.addEventListener('click',()=>{demoBookmarked=!demoBookmarked;star.textContent=demoBookmarked?'★':'☆';practiceStatus(demoBookmarked?'Page bookmarked. Your favorites stay close.':'Bookmark removed.');});append(address,el('span','','◇'),input,star);append(toolbar,address,el('span','','⋮'));box.append(toolbar);const body=el('div','demo-page');append(body,logo(),el('h3','','Your next idea starts here.'),el('p','','Your internet. Your space. Your control.'));box.append(body);return box;}
function refreshDemo(id){const old=document.querySelector('.browser-demo');if(old)old.replaceWith(browserDemo(id));}
function practiceStatus(text){const s=$('practice-status');if(s)s.textContent=text;}
function tutorial(root){const c=categories[step];root.append(append(el('div','tutorial-progress'),...categories.map((_,i)=>el('span',`progress-segment ${i<=step?'done':''}`)),el('span','step-count',`${step+1} / 7 steps`)));const layout=el('div','tutorial-layout');const body=el('section');append(body,el('div','eyebrow',`STEP ${String(step+1).padStart(2,'0')}`),heading(c[1],c[3]),browserDemo(c[0]));const practice=el('div','practice-row');const practices=[['Open a tab','Use the + above to try opening a new tab.'],['Focus the address bar','Type a website in the practice address bar and press Enter.'],['Save a bookmark','Click the star above to save this practice page.'],['Review permissions','In Vortex, use the icon beside the address bar to review website permissions.'],['Try a workspace','In Vortex, click + beside the workspace selector to create a focused space.'],['Make it yours','In Vortex, open Settings → Appearance to choose your theme and accent.'],['Find your settings','In Vortex, click the gear in the toolbar or press Ctrl + comma.']];practice.append(action(practices[step][0],()=>{practiceStatus(practices[step][1]);if(step===1)document.querySelector('.demo-address input')?.focus();}));body.append(practice);const status=el('p','practice-status');status.id='practice-status';status.setAttribute('aria-live','polite');body.append(status);c[4].forEach(f=>body.append(detail(f[0],f[1],f[2],f[3],f[4])));const controls=el('div','tutorial-controls');const back=action('← Back',()=>{step--;render();window.scrollTo(0,0);});back.disabled=step===0;append(controls,back,action('Skip tutorial',()=>finish(true),'quiet'),action(step===6?'Finish Tutorial  ✓':'Next Step  →',()=>{if(step===6)finish();else{step++;render();window.scrollTo(0,0);}},'primary'));body.append(controls);layout.append(body);const index=el('aside','tutorial-index');index.append(el('div','sidebar-caption','YOUR BROWSER, UNLOCKED'));categories.forEach((cat,i)=>{const b=el('button',`step-link ${i===step?'active':''}`);append(b,el('span','number',i<step?'✓':i+1),el('span','',cat[1]));b.addEventListener('click',()=>{step=i;render();});index.append(b);});layout.append(index);root.append(layout);}
function showCompletion(){page='tutorial';render();const root=$('content');root.replaceChildren();const box=el('section','completion');append(box,logo(),el('div','eyebrow','ALL SET. ALL YOURS.'),el('h1','','Welcome to your new space.'),el('p','','You’ve met Vortex. Now make it your own. Your guide will be right here whenever you need it.'),append(el('div','actions'),action('Get Started  →',()=>{if(native)native.close();else navigate('overview');},'primary'),link('Explore all features','features','button')));root.append(box);}
function settings(root){root.append(heading('Settings','A browser that works your way. Find your preferences, or take another look around.'));root.append(el('p','notice','These are guides to your browser settings, not controls that change your browser.'));[['Browser preferences','Themes, search engines, startup, zoom, and downloads live in the browser’s Settings panel.','View settings guide',()=>{const s=document.getElementById('settings-guide');s?.scrollIntoView({behavior:'smooth'});}],['Restart Browser Tutorial','Revisit the seven-step tour whenever you like. Your completion status stays saved.','Restart Tutorial',startTutorial],['Onboarding status',completed?'Your first-launch introduction is complete. It will not automatically open again.':'Your introduction is not completed yet. Take the tutorial or skip it to save your preference.','Start Tutorial',startTutorial]].forEach(([t,d,l,run])=>root.append(append(el('div','settings-row'),append(el('div'),el('h3','',t),el('p','',d)),action(l,run))));const guide=el('div');guide.id='settings-guide';showCategory(guide,categories[6]);showCategory(guide,categories[5]);showCategory(guide,categories[1]);root.append(guide);}
function render(){const selected=pages.find(p=>p[0]===page)||pages[0];document.title=`${selected[1]} — Vortex Browser Help & Guide`;const nav=$('navigation');nav.replaceChildren();pages.forEach((p,i)=>{if(i===7)nav.append(el('div','nav-separator'));const a=link('',p[0],`nav-link ${page===p[0]?'active':''}`);if(page===p[0])a.setAttribute('aria-current','page');append(a,el('span','nav-icon',p[2]),el('span','',p[1]));nav.append(a);});const root=$('content');root.replaceChildren();root.className='fade-in';root.append(append(el('div','breadcrumb'),el('span','','Help & Guide'),el('span','','›'),el('span','',selected[1])));
if(page==='overview')overview(root);
else if(page==='tutorial')tutorial(root);
else if(page==='features'){root.append(heading('Meet your browser.','Explore the features in Vortex’s supplied browser code, with practical instructions for every part of your day.'));root.append(el('p','notice','Desktop-dependent features are identified below. The supplied preload exposes browserAPI, while the renderer expects window.vortex; those host connections need alignment before they work.'));categories.forEach(c=>showCategory(root,c,true));}
else if(page==='getting-started'){root.append(heading('A good place to start.','A few simple steps to make Vortex feel like home.'));root.append(action('Start the interactive tutorial  →',startTutorial,'primary'));[categories[0],categories[1],categories[2]].forEach(c=>showCategory(root,c,true));}
else if(page==='privacy'){root.append(heading('Privacy, with perspective.','Understand what your browser protects, and where the desktop host needs to do its part.'));root.append(el('p','notice','Incognito is not anonymity. Websites, your network provider, and your employer may still see activity. Host-only protections are not verified as connected to the supplied renderer.'));showCategory(root,categories[3],true);showCategory(root,{...categories[0],1:'Private browsing',4:categories[0][4].filter(f=>f[0]==='Incognito windows')});}
else if(page==='shortcuts'){root.append(heading('Less clicking. More doing.','Shortcuts verified against your supplied renderer. Ctrl also accepts Command in that code on macOS.'));root.append(el('p','notice','These shortcuts are registered in the browser interface. Forwarding them while a website has focus requires Electron host support. Desktop-host window shortcuts require a matching bridge.'));[...new Set(shortcuts.map(s=>s[2]))].forEach(group=>{const s=el('section','shortcut-section');s.append(el('h2','',group));shortcuts.filter(s=>s[2]===group).forEach(([t,k])=>s.append(append(el('div','shortcut-line'),el('span','',t),el('kbd','',k))));root.append(s);});}
else if(page==='troubleshooting'){root.append(heading('Let’s get you back on track.','Simple checks for the moments when browsing doesn’t go to plan.'));troubleshooting.forEach(([title,steps])=>{const d=el('details','guide-details');const list=el('ol','steps');steps.forEach(t=>list.append(el('li','',t)));append(d,el('summary','',title),list);root.append(d);});}
else if(page==='faq'){root.append(heading('A few things you might be wondering.','Straightforward answers to your most common Vortex questions.'));faqs.forEach(([q,a])=>root.append(detail(q,a)));}
else if(page==='settings')settings(root);
else if(page==='about'){root.append(heading('Vortex Browser','Your internet. Your space. Your control.'));const image=el('img','about-mark');image.src='cover.jpg';image.alt='Vortex blue and violet spiral';root.append(image);root.append(el('p','','An independent browser experience, built around your browsing space. This is its local welcome center and permanent help guide.'));const meta=el('dl','metadata');[['Browser version',info?.version||'Available when opened in Vortex desktop'],['Build information',info?`Electron ${info.electron} · Chromium ${info.chrome}`:'Not provided by the web preview'],['Credits','Vortex Browser · Powered by Electron and Chromium'],['Help center','Offline-ready, local browser guide']].forEach(([k,v])=>append(meta,el('dt','',k),el('dd','',v)));root.append(meta);root.append(append(el('div','actions'),link('Troubleshooting →','troubleshooting','button'),link('Frequently asked questions →','faq','button')));}
}
$('search').addEventListener('input',e=>{const query=e.target.value.trim();if(!query){render();return;}const root=$('content');root.replaceChildren(heading('Search the help center',`Results for “${query}”`));const results=findArticles(query);if(!results.length)root.append(el('p','empty','No matching guides. Try “tabs”, “bookmarks”, “search”, or “privacy”.'));results.forEach(({id,category,feature})=>{const target=id==='privacy'?'privacy':id==='settings'||id==='customization'?'settings':'features';const result=link('',target,'search-result');append(result,el('small','',category),el('h3','',feature[0]),el('p','',feature[2]));root.append(result);});});
$('mobile-menu').addEventListener('click',()=>{$('sidebar').classList.toggle('open');$('mobile-menu').setAttribute('aria-expanded',String($('sidebar').classList.contains('open')));});
window.addEventListener('popstate',()=>{page=new URLSearchParams(location.search).get('page')||'overview';render();});
async function initialize(){try{completed=native?await native.isComplete():readCompletion(localStorage);if(native)info=await native.getInfo();}catch{toast('Your saved tutorial status could not be read.');}if(params.get('mode')==='tutorial')page='tutorial';if(params.get('mode')==='first-launch'&&completed)page='features';render();}
initialize();

```

## website/help/index.html

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'">
<title>Vortex Browser — Help & Guide</title>
<meta name="description" content="Your official Vortex Browser welcome center, interactive tutorial, and feature guide.">
<link rel="icon" href="favicon.png"><link rel="stylesheet" href="styles.css">
<script src="data.js" defer></script><script src="help.js" defer></script>
</head>
<body>
<div class="shell">
<aside class="sidebar" id="sidebar">
<a class="brand" href="?page=overview"><img class="logo" src="icon.png" alt="" width="37" height="37"><span>Vortex<span class="brand-sub">BROWSER</span></span></a>
<div class="sidebar-caption">HELP & GUIDE</div>
<nav aria-label="Help navigation" id="navigation"></nav>
<div class="sidebar-bottom"><span class="status-dot"></span><span>Your space. Your control.</span><div class="offline-label">Built for Vortex Browser <span>↗</span></div></div>
</aside>
<div class="workspace">
<header class="topbar"><button class="icon-button mobile-menu" id="mobile-menu" aria-label="Toggle navigation">☰</button><div class="search-wrap"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Search the help center..." aria-label="Search the help center"><span class="search-hint">Search</span></div><span class="topbar-label"><span class="status-dot"></span> Official help center</span></header>
<main id="content" tabindex="-1"></main>
<footer><span>Vortex Browser <span class="footer-dot">·</span> Made for a better browsing experience.</span><a href="?page=about">About Vortex <span>↗</span></a></footer>
</div>
</div>
<div id="toast" role="status" class="toast" hidden></div>
</body>
</html>

```

## website/help/styles.css

```css
:root{color-scheme:dark;--background:oklch(.15 .017 270);--foreground:oklch(1 0 0);--card:oklch(.2 .023 274);--secondary:oklch(.24 .025 275);--muted:oklch(.72 .014 280);--subtle:oklch(.52 .021 277);--primary:oklch(.606 .25 293);--blue:oklch(.623 .214 259);--primary-foreground:oklch(1 0 0);--border:oklch(.3 .024 276);--success:oklch(.76 .13 170);--warning:oklch(.82 .15 85);--gradient:linear-gradient(115deg,var(--primary),var(--blue));--soft-primary:color-mix(in oklab,var(--primary) 13%,transparent);--shadow:0 10px 35px color-mix(in oklab,var(--background) 65%,transparent);--font-ui:"Segoe UI",Arial,sans-serif;--font-display:"Segoe UI",Arial,sans-serif;--radius:8px}
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font:14px/1.6 var(--font-ui);letter-spacing:0}button,input,select{font:inherit}a{color:inherit;text-decoration:none}button,a,input{ -webkit-tap-highlight-color:transparent}button{cursor:pointer}button:disabled{cursor:default;opacity:.45}button:focus-visible,a:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--primary);outline-offset:4px}button{color:inherit}h1,h2,h3,p{margin:0}h1,h2,h3{font-family:var(--font-display);letter-spacing:0}h1{font-size:40px;line-height:1.2;font-weight:650}h2{font-size:22px;line-height:1.4;font-weight:600}h3{font-size:16px;font-weight:600}p{color:var(--muted)}.shell{display:grid;grid-template-columns:238px minmax(0,1fr);min-height:100dvh}.sidebar{position:sticky;top:0;height:100dvh;border-right:1px solid var(--border);padding:32px 18px;display:flex;flex-direction:column;background:var(--background)}.brand{display:flex;gap:11px;align-items:center;padding:0 12px;font-size:25px;line-height:1.1;font-weight:650}.logo{display:grid;place-items:center;width:37px;height:37px;font-size:41px;line-height:1;color:var(--primary);filter:drop-shadow(0 0 10px var(--soft-primary))}.brand-sub{display:block;font-size:9px;letter-spacing:3px;color:var(--muted);margin-top:6px;font-weight:500}.sidebar-caption{font-size:10px;letter-spacing:1.7px;color:var(--subtle);margin:42px 13px 15px}.nav-link{display:flex;gap:12px;align-items:center;margin-bottom:4px;min-height:42px;padding:9px 13px;border:1px solid transparent;border-radius:6px;color:var(--muted);font-size:13px;transition:background .2s,color .2s}.nav-link:hover{color:var(--foreground);background:var(--card)}.nav-link.active{background:var(--soft-primary);border-color:color-mix(in oklab,var(--primary) 25%,transparent);color:var(--foreground)}.nav-link.active .nav-icon{color:var(--primary)}.nav-icon{font-size:19px;line-height:1;width:20px;text-align:center;color:var(--subtle)}.nav-separator{height:1px;background:var(--border);margin:17px 12px}.sidebar-bottom{margin-top:auto;padding:30px 10px 0;font-size:10px;color:var(--muted)}.status-dot{display:inline-block;width:5px;height:5px;background:var(--success);border-radius:50%;margin-right:7px;vertical-align:middle}.offline-label{margin-top:13px;color:var(--subtle);display:flex;justify-content:space-between}.workspace{min-width:0}.topbar{height:80px;border-bottom:1px solid var(--border);display:flex;gap:24px;align-items:center;justify-content:space-between;padding:0 42px}.search-wrap{display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:6px;background:var(--card);width:440px;max-width:100%;padding:0 13px;height:38px;color:var(--subtle)}.search-wrap>span:first-child{font-size:25px}.search-wrap input{background:none;border:none;outline:none;width:100%;min-width:0;color:var(--foreground);font-size:12px}.search-wrap input::placeholder{color:var(--muted)}.search-hint{font-size:9px;border:1px solid var(--border);border-radius:3px;padding:1px 4px}.topbar-label{font-size:11px;color:var(--muted);white-space:nowrap}main{max-width:1240px;margin:0 auto;padding:30px 42px 44px;min-height:calc(100dvh - 145px)}.breadcrumb{font-size:11px;color:var(--subtle);display:flex;gap:9px;align-items:center;margin-bottom:28px}.breadcrumb span:last-child{color:var(--muted)}.hero{position:relative;isolation:isolate;min-height:350px;display:flex;align-items:center;padding:10px 0 25px;overflow:hidden}.hero-art{position:absolute;z-index:-2;right:-40px;top:-55px;width:620px;height:420px;object-fit:cover;opacity:.88;mix-blend-mode:screen;animation:reveal 1.2s ease}.hero:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,var(--background) 15%,color-mix(in oklab,var(--background) 85%,transparent) 38%,transparent 70%)}.hero-copy{max-width:540px}.eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:10px;color:var(--muted);border:1px solid var(--border);border-radius:20px;padding:4px 10px;margin-bottom:20px;background:color-mix(in oklab,var(--card) 60%,transparent)}.eyebrow span{color:var(--primary)}.hero h1{font-size:43px;max-width:520px}.hero .tagline{font-size:19px;color:var(--foreground);margin-top:15px}.hero .intro{font-size:13px;max-width:400px;line-height:1.8;margin-top:14px}.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:25px}.button{display:inline-flex;align-items:center;justify-content:center;gap:20px;min-height:40px;border-radius:6px;padding:9px 17px;border:1px solid var(--border);background:var(--card);font-size:12px;font-weight:550;transition:transform .2s,background .2s}.button:hover{background:var(--secondary);transform:translateY(-1px)}.button.primary{background:var(--gradient);color:var(--primary-foreground);border-color:transparent;box-shadow:0 3px 20px var(--soft-primary)}.button.primary:hover{filter:brightness(1.13)}.button.quiet{background:transparent;border-color:transparent;color:var(--muted);padding-left:6px}.tiny-note{font-size:10px;color:var(--subtle);margin-top:14px}.benefits{display:flex;gap:23px;margin:15px 0 33px;padding-bottom:25px;border-bottom:1px solid var(--border);font-size:10px;color:var(--muted)}.benefits span{display:flex;align-items:center;gap:7px}.benefits b{color:var(--primary);font-weight:400;font-size:15px}.section-heading{display:flex;justify-content:space-between;align-items:center;margin:30px 0 17px;gap:15px}.section-heading h2{font-size:19px}.section-heading p{font-size:11px;margin-top:4px}.text-link{font-size:11px;color:var(--muted);white-space:nowrap}.text-link:hover{color:var(--primary)}.card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.guide-card{border:1px solid var(--border);border-radius:var(--radius);background:var(--card);padding:21px;transition:border-color .2s,transform .2s;position:relative}.guide-card:hover{border-color:var(--primary);transform:translateY(-3px)}.card-icon{display:grid;place-items:center;height:37px;width:37px;background:var(--soft-primary);border:1px solid color-mix(in oklab,var(--primary) 22%,transparent);border-radius:8px;color:var(--primary);font-size:23px;margin-bottom:17px}.card-icon.blue{color:var(--blue);background:color-mix(in oklab,var(--blue) 10%,transparent);border-color:color-mix(in oklab,var(--blue) 22%,transparent)}.card-icon.green{color:var(--success);background:color-mix(in oklab,var(--success) 8%,transparent);border-color:color-mix(in oklab,var(--success) 18%,transparent)}.guide-card h3{font-size:14px}.guide-card p{font-size:11px;line-height:1.8;margin-top:7px;max-width:225px}.card-link{display:flex;align-items:center;justify-content:space-between;margin-top:19px;color:var(--muted);font-size:10px}.card-link span:last-child{font-size:16px}.overview-bottom{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:32px}.article-list{display:grid;gap:0}.article-row{padding:12px 0;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border);font-size:12px}.article-row:hover{color:var(--primary)}.article-row>span:first-child{color:var(--subtle);font-size:17px}.article-row>span:last-child{margin-left:auto;color:var(--subtle)}.tutorial-strip{display:flex;gap:17px;align-items:center;padding:20px 0;border-top:1px solid var(--border);margin-top:34px}.tutorial-strip .card-icon{margin:0;flex-shrink:0}.tutorial-strip h3{font-size:13px}.tutorial-strip p{font-size:11px;margin-top:3px}.tutorial-strip .button{margin-left:auto;flex-shrink:0}.page-heading{margin:0 0 28px}.page-heading p{margin-top:12px;max-width:650px;font-size:13px}.pill{display:inline-block;font-size:9px;color:var(--muted);border:1px solid var(--border);border-radius:4px;padding:3px 7px}.pill.warning{color:var(--warning)}.guide-details{border-bottom:1px solid var(--border);padding:18px 0}.guide-details summary{cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:14px;list-style:none;gap:15px}.guide-details summary:after{content:"+";font-size:21px;color:var(--muted)}.guide-details[open] summary:after{content:"−"}.guide-details p{font-size:13px;max-width:760px;margin-top:12px;line-height:1.8}.guide-details .howto{color:var(--foreground)}kbd{font-family:ui-monospace,monospace;border:1px solid var(--border);border-bottom-width:2px;border-radius:4px;background:var(--secondary);color:var(--muted);padding:3px 7px;font-size:10px;display:inline-block}.shortcut-line{display:flex;justify-content:space-between;gap:25px;padding:14px 0;border-bottom:1px solid var(--border);font-size:13px;align-items:center}.shortcut-section{margin-top:24px}.shortcut-section h2{font-size:16px;color:var(--muted);margin-bottom:5px}.notice{border-left:2px solid var(--primary);background:var(--soft-primary);padding:13px 17px;margin:20px 0;color:var(--muted);font-size:12px}.steps{padding-left:22px;color:var(--muted);font-size:13px;line-height:2}.tutorial-progress{display:flex;align-items:center;gap:6px;margin-bottom:27px}.progress-segment{height:3px;background:var(--border);flex:1}.progress-segment.done{background:var(--gradient)}.step-count{margin-left:10px;font-size:10px;color:var(--muted);white-space:nowrap}.tutorial-layout{display:grid;grid-template-columns:1fr 230px;gap:30px}.tutorial-index{border-left:1px solid var(--border);padding-left:22px}.step-link{display:flex;gap:10px;padding:12px 0;color:var(--subtle);font-size:11px;border:0;background:none;width:100%;text-align:left}.step-link.active{color:var(--foreground)}.step-link .number{border:1px solid var(--border);border-radius:50%;width:20px;height:20px;display:grid;place-items:center;font-size:9px;flex-shrink:0}.step-link.active .number{background:var(--primary);border-color:var(--primary)}.browser-demo{margin:23px 0;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;box-shadow:var(--shadow);min-height:240px}.demo-tabs{display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--secondary);font-size:9px}.window-dots{display:flex;gap:4px;margin-right:10px}.window-dots i{height:6px;width:6px;border-radius:50%;background:var(--subtle)}.demo-tab{padding:6px 11px;background:var(--card);border-radius:4px;display:flex;align-items:center;gap:12px}.demo-tab .icon-button{height:18px;width:18px;font-size:12px}.icon-button{border:0;background:transparent;width:28px;height:28px;color:var(--muted);border-radius:4px;display:inline-grid;place-items:center;font-size:18px;flex-shrink:0}.icon-button:hover{background:var(--secondary);color:var(--foreground)}.demo-toolbar{padding:9px 12px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center;color:var(--muted);font-size:12px}.demo-address{display:flex;justify-content:space-between;align-items:center;flex:1;background:var(--background);border:1px solid var(--border);border-radius:4px;padding:2px 10px;font-size:9px;min-width:0}.demo-address input{border:0;outline:none;background:none;color:var(--muted);width:100%;font-size:10px}.demo-page{display:flex;align-items:center;justify-content:center;flex-direction:column;min-height:155px;padding:20px;text-align:center}.demo-page .logo{font-size:42px;width:45px;height:45px;margin-bottom:10px}.demo-page h3{font-size:15px}.demo-page p{font-size:10px;margin-top:5px}.practice-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:13px}.practice-row .button{font-size:10px;min-height:30px;padding:5px 10px}.practice-status{font-size:11px;color:var(--success);min-height:20px;margin-top:8px}.tutorial-controls{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding-top:23px;margin-top:27px}.feature-category{padding:17px 0 30px}.feature-category h2{font-size:21px;margin-bottom:15px}.feature-category .browser-demo{max-width:680px}.settings-row{display:flex;justify-content:space-between;gap:25px;padding:25px 0;border-bottom:1px solid var(--border);align-items:center}.settings-row h3{font-size:14px}.settings-row p{font-size:12px;margin-top:6px}.about-mark{margin:35px 0;max-width:540px;width:100%;height:220px;object-fit:cover;object-position:right;border-radius:8px}.metadata{display:grid;grid-template-columns:150px 1fr;gap:16px;padding:20px 0;border-top:1px solid var(--border);font-size:12px}.metadata dt{color:var(--muted)}.metadata dd{margin:0}.completion{max-width:670px;padding:60px 0 50px;text-align:center;margin:auto}.completion .logo{margin:0 auto 20px;width:65px;height:65px;font-size:65px}.completion p{margin-top:20px}.completion .actions{justify-content:center}.search-result{display:block;padding:20px 0;border-bottom:1px solid var(--border)}.search-result small{color:var(--primary);font-size:10px}.search-result h3{margin:6px 0}.search-result p{font-size:12px}.empty{padding:50px 0;color:var(--muted)}footer{padding:19px 42px;border-top:1px solid var(--border);display:flex;justify-content:space-between;color:var(--subtle);font-size:9px;gap:20px}.footer-dot{margin:0 7px}footer a:hover{color:var(--primary)}.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:40;padding:12px 22px;border:1px solid var(--border);border-radius:8px;background:var(--secondary);box-shadow:var(--shadow);font-size:12px;max-width:90vw}.mobile-menu{display:none}.fade-in{animation:reveal .35s ease both}@keyframes reveal{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media(min-width:1600px){.hero{min-height:400px}.hero-art{width:710px;height:475px;top:-40px}}
@media(max-width:1100px){.shell{grid-template-columns:210px minmax(0,1fr)}.topbar,main,footer{padding-left:28px;padding-right:28px}.hero h1{font-size:37px}.hero-art{right:-160px}.hero-copy{max-width:430px}.card-grid{gap:10px}.guide-card{padding:17px}.tutorial-layout{grid-template-columns:1fr}.tutorial-index{display:none}.topbar-label{display:none}.search-wrap{width:100%}.overview-bottom{gap:25px}}
@media(max-width:760px){.shell{display:block}.sidebar{position:fixed;left:0;top:64px;height:calc(100dvh - 64px);width:238px;z-index:30;transform:translateX(-100%);transition:transform .2s;box-shadow:var(--shadow)}.sidebar.open{transform:translateX(0)}.topbar{height:64px;padding:0 18px;gap:12px;position:sticky;top:0;z-index:35;background:var(--background)}.mobile-menu{display:inline-grid}main{padding:22px 22px 35px}.breadcrumb{margin-bottom:16px}.hero{min-height:460px;align-items:flex-end;padding-bottom:18px}.hero-art{width:450px;height:300px;right:-95px;top:-40px;opacity:.7}.hero:after{background:linear-gradient(0deg,var(--background) 5%,color-mix(in oklab,var(--background) 90%,transparent) 45%,transparent 85%)}.hero h1{font-size:34px;max-width:360px}.hero .tagline{font-size:15px}.hero .intro{font-size:12px;max-width:340px}.eyebrow{margin-bottom:15px}.benefits{gap:15px;flex-wrap:wrap;margin-top:20px;font-size:9px}.card-grid{grid-template-columns:1fr}.guide-card{padding:20px;display:grid;grid-template-columns:42px 1fr;column-gap:15px}.guide-card .card-icon{grid-row:1/4;margin:0}.guide-card p{max-width:none}.card-link{margin-top:12px}.overview-bottom{grid-template-columns:1fr;gap:10px}.tutorial-strip{align-items:flex-start;flex-wrap:wrap}.tutorial-strip .button{margin-left:54px}.page-heading h1{font-size:30px}.shortcut-line{font-size:12px;gap:14px}.shortcut-line kbd{font-size:9px;text-align:right;max-width:55%}.settings-row{align-items:flex-start;flex-direction:column;gap:15px}.tutorial-controls{gap:10px}.tutorial-controls .button{gap:8px;padding:9px 12px}.demo-tab{padding:5px 7px;gap:6px}.demo-tabs{gap:5px;overflow:auto}.demo-toolbar{gap:8px}.metadata{grid-template-columns:100px 1fr}footer{padding:20px 22px;font-size:9px;flex-direction:column;gap:7px}.section-heading{align-items:flex-start}.completion{padding:35px 0}.completion h1{font-size:31px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}

.logo { object-fit: contain; border-radius: 6px; }
.demo-tab .logo { width: 14px; height: 14px; filter: none; }
@media(max-width:760px) { .hero { min-height: 360px; } .hero-art { height: 255px; top: -50px; } .hero h1 { font-size: 30px; } .hero .intro { line-height: 1.6; } .hero .tagline { margin-top: 11px; } .hero .actions { margin-top: 18px; } }

```

## website/help-preload.cjs

```javascript
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('vortexHelp', Object.freeze({
  isComplete: () => ipcRenderer.invoke('vortex-help:is-complete'),
  complete: () => ipcRenderer.invoke('vortex-help:complete'),
  getInfo: () => ipcRenderer.invoke('vortex-help:info'),
  close: () => ipcRenderer.send('vortex-help:close')
}));

```

## website/package-desktop.cjs

```javascript
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

```

## website/vortex-entry.cjs

```javascript
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

```
