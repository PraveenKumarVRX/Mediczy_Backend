import { useState } from 'react';
import { Button } from '@/components/ui/button';
import MainLayout from '@/components/layout/MainLayout';
import { ExternalLink, RefreshCw, MessageSquare, Info } from 'lucide-react';

const RC_URL = 'https://smart-chat.live';

export default function RocketChatOmnichannel() {
  const [key, setKey] = useState(0); // bump to reload iframe

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-white gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-slate-800">Omnichannel — WhatsApp Inbox</span>
            <span className="text-xs text-slate-400 hidden sm:inline">Powered by RocketChat</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Login hint */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Log in with your RocketChat agent account inside the frame
            </div>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setKey(k => k + 1)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reload
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open(RC_URL, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in new tab
            </Button>
          </div>
        </div>

        {/* RocketChat iframe — full remaining height */}
        <iframe
          key={key}
          src={RC_URL}
          title="RocketChat Omnichannel"
          className="flex-1 w-full border-0"
          allow="camera; microphone; fullscreen; clipboard-read; clipboard-write"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
        />
      </div>
    </MainLayout>
  );
}
