import { Link } from 'react-router-dom';
import { Mail, MessageSquare, Phone, Send, Smartphone, Video } from 'lucide-react';
export const communicationChannels = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'sms', label: 'SMS', icon: Send },
  { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'voice', label: 'Voice', icon: Phone },
] as const;
export type CommunicationChannel = typeof communicationChannels[number]['id'];

/** Links are supplied by the authorized portal; no fallback to admin routes. */
export default function ChannelNavigation({ links, active }: {
  links: Partial<Record<CommunicationChannel, string>>;
  active?: CommunicationChannel;
}) {
  const availableChannels = communicationChannels.filter(({ id }) => Boolean(links[id]));
  return <nav aria-label="Communication channels" className="flex flex-wrap gap-2 py-3">
    {availableChannels.map(({ id, label, icon: Icon }) => {
      const content = <><Icon className="h-4 w-4" />{label}</>;
      const style = 'inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm';
      return <Link key={id} to={links[id]!} aria-current={active === id ? 'page' : undefined}
        className={`${style} ${active === id ? 'border-teal-500 bg-teal-500/10 text-teal-600 dark:text-teal-300' : 'border-current/20 hover:bg-slate-500/10'}`}>{content}</Link>;
    })}
  </nav>;
}
