import { useCallback, useEffect, useRef, useState } from 'react';

export interface Loadable<T> {
  data: T | null;
  error: string;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
}

/**
 * Run an async loader once on mount and on demand, discarding the result of a
 * load that was superseded or that finished after the screen went away — the
 * connection layer aborts in-flight requests when the connection changes, and
 * those rejections must not land as errors on a screen that has moved on.
 */
export function useLoader<T>(load: () => Promise<T>, key = ''): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const attempt = useRef(0);
  const alive = useRef(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const run = useCallback((isRefresh: boolean) => {
    const generation = ++attempt.current;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    loadRef.current().then(result => {
      if (!alive.current || generation !== attempt.current) return;
      setData(result);
    }).catch((e: unknown) => {
      if (!alive.current || generation !== attempt.current) return;
      setError(e instanceof Error ? e.message : 'Something went wrong. Pull down to try again.');
    }).finally(() => {
      if (!alive.current || generation !== attempt.current) return;
      setLoading(false); setRefreshing(false);
    });
  }, []);

  // `key` identifies what is being loaded (a doctor id and a date, say), so a
  // screen that changes its selection reloads instead of showing stale rows.
  useEffect(() => { run(false); }, [run, key]);

  return { data, error, loading, refreshing, reload: () => run(true) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parse(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 9 Nov 2026 */
export function formatDate(value?: string | null): string {
  const d = parse(value);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '—';
}

/** Mon, 9 Nov */
export function formatDayShort(value?: string | null): string {
  const d = parse(value);
  return d ? `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}` : '—';
}

/** 9 Nov 2026, 14:30 */
export function formatDateTime(value?: string | null): string {
  const d = parse(value);
  if (!d) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(value)}, ${hh}:${mm}`;
}

export function yearsSince(value?: string | null): number | null {
  const d = parse(value);
  if (!d) return null;
  const years = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return years > 0 && years < 150 ? Math.floor(years) : null;
}

/** YYYY-MM-DD, `offset` days from today, in the device's own timezone. */
export function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
