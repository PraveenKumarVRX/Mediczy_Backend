import { useEffect, useRef, useState } from 'react';

export function useAutosave<T>({ key, value, save, delay = 1200 }: { key: string; value: T; save: (value: T) => Promise<unknown>; delay?: number }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const hydrated = useRef(false);
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    const timer = window.setTimeout(async () => {
      setStatus('saving');
      try {
        await saveRef.current(value);
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [key, value, delay]);

  const restore = (): T | null => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  };

  const clear = () => localStorage.removeItem(key);
  return { status, restore, clear };
}
