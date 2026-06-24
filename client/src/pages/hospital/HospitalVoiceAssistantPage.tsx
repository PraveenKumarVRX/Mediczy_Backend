/**
 * Voice Assistant — hands-free hospital commands (hospital portal demo).
 */
import { useState } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, Sparkles, Send, User, FileText, Pill, Calendar } from 'lucide-react';

const COMMANDS = [
  { icon: User, label: 'Show patient Priya Singh chart', response: 'Opening IP workspace — Bed GEN-11, post-op appendectomy Day 2.' },
  { icon: Pill, label: 'Order paracetamol 650mg Q6H', response: 'Medication order drafted for nurse verification.' },
  { icon: FileText, label: 'Dictate progress note', response: 'AI scribe ready — say "start recording" when ready.' },
  { icon: Calendar, label: 'Schedule OT for tomorrow 9 AM', response: 'OT slot available — sending request to OT coordinator.' },
];

export default function HospitalVoiceAssistantPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    { role: 'assistant', text: 'Good morning, Doctor. How can I assist with your rounds today?' },
  ]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const match = COMMANDS.find(c => text.toLowerCase().includes(c.label.split(' ').slice(0, 2).join(' ').toLowerCase()));
    const reply = match?.response || 'Command understood. Routing to the appropriate module.';
    setMessages(prev => [...prev, { role: 'user', text }, { role: 'assistant', text: reply }]);
    setInput('');
  };

  return (
    <HospitalLayout title="Voice Assistant" subtitle="Hands-free clinical commands">
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="text-center">
          <div className="inline-flex p-4 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 text-white mb-3">
            <Sparkles className="h-8 w-8" />
          </div>
          <Badge className="bg-cyan-600">Voice AI · Demo</Badge>
        </div>

        <Card className="min-h-[320px] flex flex-col">
          <CardContent className="p-4 flex-1 space-y-3 overflow-y-auto max-h-80">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                  m.role === 'user' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-800'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
          </CardContent>
          <div className="p-4 border-t flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              placeholder="Try: Show patient Priya Singh chart"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send(input)}
            />
            <Button size="icon" className="bg-teal-600 hover:bg-teal-700 shrink-0" onClick={() => send(input)}>
              <Send className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" className="shrink-0" onClick={() => send('Show patient chart')}>
              <Mic className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          {COMMANDS.map(cmd => {
            const Icon = cmd.icon;
            return (
              <Button key={cmd.label} variant="outline" className="h-auto py-3 text-left justify-start gap-2 text-xs" onClick={() => send(cmd.label)}>
                <Icon className="h-4 w-4 shrink-0 text-teal-600" />
                <span className="line-clamp-2">{cmd.label}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </HospitalLayout>
  );
}
