/**
 * SCMAIAssistant — floating iSHA supply chain advisor for SCM portal.
 * Administrative guidance only (not clinical decision support).
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, X, Send, Loader2, Sparkles, Bot, Package,
  TrendingDown, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ReorderItem {
  itemCode: string;
  name: string;
  onHand: number;
  reorderLevel: number;
  suggestedQty: number;
  priority: string;
}

const getScmToken = () =>
  typeof window !== "undefined" ? localStorage.getItem("scmToken") || "" : "";

const scmApi = async (path: string, body?: object) => {
  const res = await fetch(`/api/scm${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getScmToken()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Request failed");
  return data;
};

const uid = () => Math.random().toString(36).slice(2);

const quickPrompts = [
  "Walk me through PO approve → GRN → inventory post",
  "Which items are below reorder level?",
  "Cold chain excursion — what do I do?",
  "Explain 3-way match for AP invoices",
  "NABH requirements for controlled substances",
  "How do preference cards link to case carts?",
];

export const SCMAIAssistant = ({ defaultOpen = false }: { defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi — I'm iSHA Supply Chain Advisor. Ask about PO workflow, inventory, vendors, cold chain, or clinical supply.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [reorder, setReorder] = useState<ReorderItem[]>([]);
  const [reorderLoading, setReorderLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { id: uid(), role: "user", content: text.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const history = [...messages, userMsg].filter((m) => m.id !== "welcome").map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const data = await scmApi("/ai/chat", { message: text, history });
      setMessages((m) => [...m, { id: uid(), role: "assistant", content: data.reply }]);
    } catch (e: any) {
      setMessages((m) => [...m, { id: uid(), role: "assistant", content: e.message || "Advisor unavailable." }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  const loadReorder = async () => {
    setReorderLoading(true);
    try {
      const data = await scmApi("/ai/reorder-advisor");
      setReorder(data.data || []);
    } catch {
      setReorder([]);
    } finally {
      setReorderLoading(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={cn(
              "fixed z-50 shadow-2xl border rounded-2xl bg-white dark:bg-slate-900 flex flex-col",
              minimized ? "bottom-24 right-6 w-72 h-14" : "bottom-24 right-6 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-8rem)]"
            )}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-teal-600 to-emerald-700 text-white rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <span className="font-semibold text-sm">iSHA Supply Chain</span>
                <Badge variant="secondary" className="text-[10px] bg-white/20 text-white border-0">AI</Badge>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7 text-white hover:bg-white/20" onClick={() => setMinimized(!minimized)}>
                  {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-white hover:bg-white/20" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {!minimized && (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {messages.map((m) => (
                    <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                        m.role === "user"
                          ? "bg-teal-600 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                      )}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>

                <div className="px-3 pb-2 flex flex-wrap gap-1">
                  {quickPrompts.slice(0, 3).map((p) => (
                    <button key={p} onClick={() => send(p)} className="text-[10px] px-2 py-1 rounded-full border hover:bg-teal-50 dark:hover:bg-teal-950 text-muted-foreground">
                      {p.slice(0, 40)}…
                    </button>
                  ))}
                </div>

                <div className="px-3 pb-2">
                  <Button size="sm" variant="outline" className="w-full text-xs" onClick={loadReorder} disabled={reorderLoading}>
                    <TrendingDown className="h-3 w-3 mr-1" />
                    {reorderLoading ? "Analyzing stock…" : "AI Reorder Advisor"}
                  </Button>
                  {reorder.length > 0 && (
                    <div className="mt-2 max-h-24 overflow-y-auto text-xs space-y-1">
                      {reorder.slice(0, 5).map((r) => (
                        <div key={r.itemCode} className="flex justify-between border rounded px-2 py-1">
                          <span>{r.name}</span>
                          <Badge variant={r.priority === "critical" ? "destructive" : "secondary"}>
                            +{r.suggestedQty}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 border-t flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send(input)}
                    placeholder="Ask about supply chain…"
                    className="text-sm"
                  />
                  <Button size="icon" onClick={() => send(input)} disabled={loading}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!open && (
        <Button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-gradient-to-br from-teal-600 to-emerald-700 hover:from-teal-700 hover:to-emerald-800"
          size="icon"
        >
          <Bot className="h-6 w-6" />
        </Button>
      )}
    </>
  );
};

export default SCMAIAssistant;
