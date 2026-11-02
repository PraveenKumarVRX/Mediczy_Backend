import { useEffect, useState } from 'react';

/**
 * Desktop sidebar collapse state, shared across the sidebar itself and every layout that
 * offsets content for it (MainLayout, OhcWorkspace). Backed by localStorage so the choice
 * persists across reloads, and broadcast via a custom window event so all mounted consumers
 * update together (localStorage's native 'storage' event only fires in *other* tabs).
 */
const STORAGE_KEY = 'sidebarCollapsed';
const EVENT = 'sidebar-collapsed-change';

const read = (): boolean => {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
};

export function setSidebarCollapsed(value: boolean) {
  try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
}

export function useSidebarCollapsed(): [boolean, (value: boolean) => void] {
  const [collapsed, setCollapsed] = useState<boolean>(read);

  useEffect(() => {
    const onChange = () => setCollapsed(read());
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange); // cross-tab
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return [collapsed, setSidebarCollapsed];
}
