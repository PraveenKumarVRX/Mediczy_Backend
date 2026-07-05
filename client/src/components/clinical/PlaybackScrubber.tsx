import { useEffect, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Play, Pause } from 'lucide-react';

export interface PlaybackChapter {
  at: string;
  title: string;
  detail?: string;
}

interface PlaybackScrubberProps {
  chapters: PlaybackChapter[];
  label?: string;
}

export function PlaybackScrubber({ chapters, label }: PlaybackScrubberProps) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const current = chapters[index];

  useEffect(() => {
    if (!playing || !chapters.length) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1 < chapters.length ? i + 1 : 0));
    }, 3000);
    return () => window.clearInterval(t);
  }, [playing, chapters.length]);

  if (!chapters.length) return null;

  return (
    <div className="space-y-4">
      {label && <p className="text-sm font-medium text-slate-700">{label}</p>}
      <div className="bg-slate-50 border rounded-lg p-4">
        <p className="text-xs text-muted-foreground">
          {current?.at ? new Date(current.at).toLocaleString() : ''}
        </p>
        <p className="font-semibold mt-1">{current?.title}</p>
        {current?.detail && <p className="text-sm text-slate-600 mt-1">{current.detail}</p>}
      </div>
      <Slider
        value={[index]}
        min={0}
        max={Math.max(chapters.length - 1, 0)}
        step={1}
        onValueChange={([v]) => setIndex(v)}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <span className="text-xs text-muted-foreground">
          Chapter {index + 1} of {chapters.length}
        </span>
      </div>
    </div>
  );
}
