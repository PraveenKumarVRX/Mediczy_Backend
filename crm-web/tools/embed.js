/* Medstar CRM tool pages inside the app.
 * The CRM shows each tool page (Home, Inbox, Engage, Calls, WhatsApp templates) in a frame under its own
 * menu and header, at /crm/<route>. In that frame this script hides the page's own header and sends link
 * clicks to the app ({ type: 'mq-nav', to }) instead of navigating the frame. Opened on its own (an old
 * link or bookmark), the page is reopened inside the app. Load it first, before the page's own script. */
(() => {
  'use strict';
  const ROUTES = { home: '/crm/dashboard', inbox: '/crm/inbox', engage: '/crm/engage', calls: '/crm/calls', whatsapp: '/crm/whatsapp' };
  let embedded = false;
  try { embedded = window.top !== window && window.parent.location.origin === location.origin; } catch { embedded = false; }

  if (!embedded) {
    const tool = /^\/crm-tools\/([a-z]+)\//.exec(location.pathname)?.[1];
    if (tool && ROUTES[tool]) {
      const query = new URLSearchParams(location.search); query.delete('embed');
      const q = query.toString();
      location.replace(ROUTES[tool] + (q ? `?${q}` : '') + location.hash);
    }
    window.go = (url) => { location.href = url; };
    window.mqSyncUrl = () => {};
    return;
  }

  document.documentElement.classList.add('embed');
  window.go = (url) => { window.parent.postMessage({ type: 'mq-nav', to: String(url) }, location.origin); };
  // The page's own state (for example the open conversation, '#lead=21') mirrored in the app's address bar,
  // so a refresh or a shared link reopens it.
  window.mqSyncUrl = (hash) => { window.parent.postMessage({ type: 'mq-url', hash: String(hash || '') }, location.origin); };
  document.addEventListener('click', (event) => {
    const a = event.target.closest && event.target.closest('a[href]');
    if (!a || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    const raw = a.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || /^(mailto|tel|sms|blob|data):/i.test(raw)) return;
    const url = new URL(raw, location.href);
    if (url.origin !== location.origin) return; // other websites open as usual
    event.preventDefault();
    window.go(url.pathname + url.search + url.hash);
  });
})();
