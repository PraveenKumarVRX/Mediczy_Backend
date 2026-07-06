import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { hospitalCopilotChat } from '@/services/hospitalOs.service';

interface PatientCopilotPanelProps {
  patientId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/** Slide-over patient-scoped copilot (Pillar 1) */
export function PatientCopilotPanel({ patientId, open, onOpenChange, patientName }: PatientCopilotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && !messages.length) {
      setMessages([
        {
          role: 'assistant',
          content: `I'm your patient copilot${patientName ? ` for ${patientName}` : ''}. Ask about vitals, labs, pathway, or draft a family update.`,
        },
      ]);
    }
  }, [open, patientName, messages.length]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    const next: Message[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await hospitalCopilotChat({
        message: userMsg,
        context: { patientId, scope: 'patient_workspace' },
        conversationHistory: next.slice(-8),
      });
      const reply = res?.data?.reply || res?.reply || res?.message || 'No response';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Copilot unavailable — try again or use Hospital Copilot.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            Patient Copilot
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-3 py-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg p-3 text-sm ${
                m.role === 'user' ? 'bg-teal-50 ml-8' : 'bg-violet-50 mr-4'
              }`}
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking…
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-2 border-t">
          <Input
            placeholder="Ask about this patient…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <Button size="icon" onClick={send} disabled={loading}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
