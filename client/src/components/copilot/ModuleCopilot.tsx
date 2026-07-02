/**
 * ModuleCopilot — shared AI copilot panel for every hospital module
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, Loader2, Sparkles, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getModuleCopilotConfig, type ModuleCopilotId } from '@/config/moduleCopilot.registry';
import { sendModuleCopilotMessage, type CopilotMessage } from '@/services/moduleCopilot.service';

interface ChatMessage extends CopilotMessage {
  id: string;
}

export interface ModuleCopilotProps {
  moduleId: ModuleCopilotId;
  context?: Record<string, unknown>;
  className?: string;
}

export default function ModuleCopilot({ moduleId, context = {}, className }: ModuleCopilotProps) {
  const cfg = getModuleCopilotConfig(moduleId);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      const res = await sendModuleCopilotMessage({
        moduleId,
        message: text.trim(),
        context,
        conversationHistory: history.slice(-10),
      });
      setMessages((m) => [...m, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.response || 'No response',
      }]);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setMessages((m) => [...m, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${err.message || 'Copilot unavailable'}`,
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, moduleId, context]);

  return (
    <div className={cn('fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2', className)}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            className="w-[380px] max-h-[520px] flex flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
              <div className="flex items-center gap-2">
                <span className="text-lg">{cfg.icon}</span>
                <div>
                  <p className="font-semibold text-sm">{cfg.label}</p>
                  <p className="text-[10px] opacity-80">Mediqzy AI · {moduleId}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {cfg.samd && (
                  <Badge variant="secondary" className="text-[10px] gap-0.5 bg-white/20 text-white border-0">
                    <Shield className="h-3 w-3" /> SaMD
                  </Badge>
                )}
                <button type="button" onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded-lg">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[340px]">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground text-xs py-6">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 text-indigo-400" />
                  <p>Ask anything about {moduleId} operations</p>
                  <div className="flex flex-wrap gap-1 justify-center mt-3">
                    {cfg.quickPrompts.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => send(p)}
                        className="text-[10px] px-2 py-1 rounded-full border hover:bg-muted"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={cn('text-sm rounded-xl px-3 py-2 max-w-[90%]',
                  m.role === 'user' ? 'ml-auto bg-indigo-600 text-white' : 'bg-muted')}>
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="p-3 border-t flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send(input)}
                placeholder="Ask copilot…"
                className="text-sm h-9"
                disabled={loading}
              />
              <Button size="sm" onClick={() => send(input)} disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        size="lg"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full h-14 w-14 shadow-lg bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
        aria-label={`Open ${cfg.label}`}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </Button>
    </div>
  );
}
