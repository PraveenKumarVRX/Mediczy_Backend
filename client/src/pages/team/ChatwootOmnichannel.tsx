import { Button } from '@/components/ui/button';
import MainLayout from '@/components/layout/MainLayout';
import { ExternalLink, MessageSquare, Info } from 'lucide-react';

/**
 * Agent workspace launcher for Chatwoot.
 *
 * This replaces RocketChatOmnichannel, which embedded https://smart-chat.live in an iframe.
 * Chatwoot cannot be embedded the same way: chat.mediqzy.com returns `x-frame-options: SAMEORIGIN`,
 * so an iframe from mediqzy.com renders blank. It opens in a new tab instead.
 *
 * Chatwoot has its own agent login and Mediczy deliberately does not pass service tokens to the
 * browser or provide SSO into it, so agents sign in there directly.
 */
const CHATWOOT_URL = (import.meta.env.VITE_CHATWOOT_URL as string) || 'https://chat.mediqzy.com';

export default function ChatwootOmnichannel() {
  const open = () => window.open(`${CHATWOOT_URL}/app/login`, '_blank', 'noopener,noreferrer');

  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] px-4">
        <div className="max-w-xl w-full bg-white border rounded-xl shadow-sm p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <MessageSquare className="h-6 w-6 text-green-600" />
            <h1 className="text-xl font-semibold text-slate-800">Omnichannel Inbox</h1>
          </div>

          <p className="text-slate-600 mb-6">
            Customer conversations are handled in Chatwoot, the support agent workspace.
            WhatsApp and SMS messages arrive there, and agent replies are delivered back to the
            customer automatically.
          </p>

          <Button onClick={open} className="gap-2" size="lg">
            <ExternalLink className="h-4 w-4" />
            Open Chatwoot
          </Button>

          <div className="mt-6 flex items-start gap-2 text-left text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Chatwoot opens in a new tab and has its own agent login — it cannot be embedded here.
              If you do not have an account yet, ask an administrator to invite you to the Mediqzy
              Chatwoot workspace.
            </span>
          </div>

          <p className="mt-4 text-xs text-slate-400 break-all">{CHATWOOT_URL}</p>
        </div>
      </div>
    </MainLayout>
  );
}
