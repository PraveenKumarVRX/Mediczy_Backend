import { Button } from '@/components/ui/button';
import { ExternalLink, MessageSquare, Info } from 'lucide-react';

/**
 * Hospital team chat.
 *
 * What was here before was not a working chat. It rendered hardcoded channels and invented staff
 * messages ("Nurse Priya: Morning rounds completed for Ward A"), kept everything in local state,
 * and POSTed to /api/rocketchat/message -- an endpoint backed by a RocketChat instance that had
 * stopped running, so every send failed and the UI told the user the message was "queued for
 * retry" when nothing was queued. Fabricated clinical conversation is worse than no page, so the
 * mock was removed with RocketChat on 2026-10-04.
 *
 * Chatwoot is an agent-to-customer inbox and deliberately does not replace internal staff
 * messaging; it handles patient and customer conversations. This page points staff at it and is
 * honest that internal team chat is not currently provided.
 */
const CHATWOOT_URL = (import.meta.env.VITE_CHATWOOT_URL as string) || 'https://chat.mediqzy.com';

export default function HospitalTeamChat() {
  const open = () => window.open(`${CHATWOOT_URL}/app/login`, '_blank', 'noopener,noreferrer');

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-xl w-full bg-white border rounded-xl shadow-sm p-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <MessageSquare className="h-6 w-6 text-purple-600" />
          <h1 className="text-xl font-semibold text-slate-800">Team Chat</h1>
        </div>

        <p className="text-slate-600 mb-6">
          Patient and customer conversations are handled in Chatwoot, the support agent workspace.
          Open it to pick up WhatsApp and SMS conversations for your hospital.
        </p>

        <Button onClick={open} className="gap-2" size="lg">
          <ExternalLink className="h-4 w-4" />
          Open Chatwoot
        </Button>

        <div className="mt-6 flex items-start gap-2 text-left text-xs text-slate-600 bg-slate-50 border rounded-md px-3 py-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Internal staff-to-staff messaging is not currently provided in Mediqzy. Chatwoot is for
            conversations with patients and customers, and it has its own agent login.
          </span>
        </div>
      </div>
    </div>
  );
}
