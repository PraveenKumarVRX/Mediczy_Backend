import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { BookOpen, Loader2, Search } from 'lucide-react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { getSimilarCases } from '@/services/workspace.service';

/** Hospital-wide anonymized case library (Pillar 19) */
export default function CaseLibrary() {
  const [query, setQuery] = useState('');
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    try {
      const r = await getSimilarCases(0, query || undefined);
      setCases(r?.data?.cases || r?.data || []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    search();
  }, []);

  return (
    <HospitalLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-violet-600" />
          <h1 className="text-2xl font-bold">Case Library</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Governed knowledge graph — anonymized cases for learning and MDT prep.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search presentation, diagnosis…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
          </div>
          <button
            type="button"
            onClick={search}
            className="px-4 py-2 rounded-md bg-teal-600 text-white text-sm font-medium hover:bg-teal-700"
          >
            Search
          </button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching…
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {cases.map((c: any, i: number) => (
              <Card key={c.id || i}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{c.presentation || c.diagnosis || `Case ${i + 1}`}</CardTitle>
                  {c.similarity != null && <Badge variant="secondary">{Math.round(c.similarity * 100)}% relevance</Badge>}
                </CardHeader>
                <CardContent className="text-sm text-slate-600">{c.outcome || c.summary || '—'}</CardContent>
              </Card>
            ))}
            {!cases.length && (
              <p className="text-sm text-muted-foreground col-span-2 text-center py-8">No cases match your search.</p>
            )}
          </div>
        )}
      </div>
    </HospitalLayout>
  );
}
