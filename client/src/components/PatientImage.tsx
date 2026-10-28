import { useEffect, useState } from 'react';

export default function PatientImage({ src, name, className = '' }: { src?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initials = name.replace(/^Dr\.?\s*/i, '').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  const resolved = src?.startsWith('uploads/') ? `/${src}` : src;
  const usable = resolved && /^(https?:\/\/|\/(?!\/)|data:image\/)/i.test(resolved);
  if (!usable || failed) return <span role="img" aria-label={name} className={`inline-flex shrink-0 items-center justify-center bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100 ${className}`}>{initials}</span>;
  return <img src={resolved} alt={name} loading="lazy" onError={() => setFailed(true)} className={className} />;
}
