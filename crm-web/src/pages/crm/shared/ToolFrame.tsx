import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CRMLayout } from '../CRMModulePages';

/**
 * The tool pages under /crm-tools (Home, Inbox, Engage, Calls, WhatsApp templates) are plain HTML apps
 * served by nginx. Each is shown here inside the CRM's own menu and header, at /crm/<route>.
 *
 * In a frame the tool page loads /crm-tools/embed.js, which hides its own header and, instead of
 * navigating the frame, posts { type: 'mq-nav', to } here; this page turns that into app navigation.
 * { type: 'mq-url', hash } mirrors the page's own state (the open conversation) in the address bar without
 * reloading the frame, so a refresh or a shared link reopens it.
 */
export const TOOLS = {
  home: { src: '/crm-tools/home/', route: '/crm/dashboard' },
  inbox: { src: '/crm-tools/inbox/', route: '/crm/inbox' },
  engage: { src: '/crm-tools/engage/', route: '/crm/engage' },
  calls: { src: '/crm-tools/calls/', route: '/crm/calls' },
  whatsapp: { src: '/crm-tools/whatsapp/', route: '/crm/whatsapp' },
} as const;
export type ToolName = keyof typeof TOOLS;

/** The in-app address for a link a tool page wants to follow, or null when it is outside the CRM. */
export function shellPathFor(href: string): string | null {
  let url: URL;
  try { url = new URL(href, window.location.origin); } catch { return null; }
  if (url.origin !== window.location.origin) return null;
  url.searchParams.delete('embed');
  const search = url.searchParams.toString();
  const tool = /^\/crm-tools\/([a-z]+)\/?/.exec(url.pathname)?.[1] as ToolName | undefined;
  if (tool && TOOLS[tool]) return TOOLS[tool].route + (search ? `?${search}` : '') + url.hash;
  if (url.pathname === '/crm' || url.pathname.startsWith('/crm/')) return url.pathname + (search ? `?${search}` : '') + url.hash;
  return null;
}

export function ToolPage({ tool, title }: { tool: ToolName; title: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  // The frame reloads only when the query changes. The hash is the page's own state: it is passed in on
  // the first load (a refresh or shared link) and afterwards only mirrored from the page.
  const src = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.set('embed', '1');
    return `${TOOLS[tool].src}?${params.toString()}${location.hash}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, location.search]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'mq-url' && typeof event.data.hash === 'string') {
        const hash = /^#[\w=&.-]{0,200}$/.test(event.data.hash) ? event.data.hash : '';
        if (hash !== window.location.hash) navigate({ pathname: window.location.pathname, search: window.location.search, hash }, { replace: true });
        return;
      }
      if (event.data?.type !== 'mq-nav' || typeof event.data.to !== 'string') return;
      const path = shellPathFor(event.data.to);
      if (path) navigate(path);
      else window.location.assign(event.data.to);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate]);

  return (
    <CRMLayout title={title} bleed>
      <iframe
        key={src}
        ref={frame}
        src={src}
        title={title}
        className="block w-full border-0 bg-transparent h-[calc(100dvh-4rem-4rem)] lg:h-[calc(100dvh-4rem)]"
        style={{ colorScheme: 'dark' }}
      />
    </CRMLayout>
  );
}

export default ToolPage;
