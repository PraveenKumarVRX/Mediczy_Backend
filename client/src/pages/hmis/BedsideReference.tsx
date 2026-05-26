import React, { useState, useEffect } from 'react';
import { BookOpen, Pill, Search, ClipboardList, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import api from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Drug {
  id: string;
  brand?: string;
  generic?: string;
  composition?: string;
  category?: string;
  strength?: string;
  renalAdjustment?: Record<string, string> | null;
  pregnancyCategory?: { category: string; note: string; ref: string } | null;
}

interface KnowledgeResult {
  title: string;
  content: string;
  similarity: number;
  source: string | null;
}

interface ProcedureStep { phase: string; items: string[] }
interface Procedure { name: string; guideline: string; steps: ProcedureStep[] }

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'drugs' | 'knowledge' | 'procedures';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'drugs',      label: 'Drug Formulary', icon: <Pill className="w-4 h-4" /> },
  { id: 'knowledge',  label: 'Clinical Search', icon: <Search className="w-4 h-4" /> },
  { id: 'procedures', label: 'Procedures',      icon: <ClipboardList className="w-4 h-4" /> },
];

// ── Renal dose colour ────────────────────────────────────────────────────────

function renalColour(text: string) {
  const t = text.toLowerCase();
  if (t.includes('contraindicated') || t.includes('avoid')) return 'text-red-700 font-semibold';
  if (t.includes('caution') || t.includes('reduce')) return 'text-amber-700';
  if (t.includes('normal') || t.includes('safe')) return 'text-green-700';
  return 'text-gray-700';
}

// ── Drug card ─────────────────────────────────────────────────────────────────

function DrugCard({ drug }: { drug: Drug }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <button
        className="w-full flex items-start justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div>
          <span className="font-semibold text-gray-800">{drug.brand || drug.generic || 'Unknown'}</span>
          {drug.generic && drug.brand && <span className="ml-2 text-xs text-gray-500">({drug.generic})</span>}
          <div className="flex flex-wrap gap-1 mt-1">
            {drug.category && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{drug.category}</span>}
            {drug.strength && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{drug.strength}</span>}
            {drug.pregnancyCategory && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${drug.pregnancyCategory.category.includes('X') || drug.pregnancyCategory.category.includes('D') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                Preg {drug.pregnancyCategory.category.split(' ')[0]}
              </span>
            )}
            {drug.renalAdjustment && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Renal dosing</span>}
          </div>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-4">
          {drug.composition && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Composition</p>
              <p className="text-sm text-gray-700 mt-1">{drug.composition}</p>
            </div>
          )}

          {drug.pregnancyCategory && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pregnancy Category</p>
              <div className={`text-sm px-3 py-2 rounded ${drug.pregnancyCategory.category.includes('X') ? 'bg-red-50 border border-red-200' : drug.pregnancyCategory.category.includes('D') ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
                <p className="font-semibold">{drug.pregnancyCategory.category}</p>
                <p className="text-gray-600 mt-0.5">{drug.pregnancyCategory.note}</p>
                <p className="text-gray-400 text-xs mt-1">Ref: {drug.pregnancyCategory.ref}</p>
              </div>
            </div>
          )}

          {drug.renalAdjustment && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Renal Dose Adjustment</p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      {['G1 (≥90)', 'G2 (60-89)', 'G3a (45-59)', 'G3b (30-44)', 'G4 (15-29)', 'G5 (<15)'].map(h => (
                        <th key={h} className="border border-gray-200 px-2 py-1 text-left font-medium text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {(['g1', 'g2', 'g3a', 'g3b', 'g4', 'g5'] as const).map(k => (
                        <td key={k} className={`border border-gray-200 px-2 py-1 ${renalColour((drug.renalAdjustment as Record<string, string>)[k] || '')}`}>
                          {(drug.renalAdjustment as Record<string, string>)[k] || '—'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              {drug.renalAdjustment.ref && <p className="text-xs text-gray-400 mt-1">Ref: {drug.renalAdjustment.ref}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Drug formulary tab ────────────────────────────────────────────────────────

function DrugFormularyTab() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (q.trim().length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const resp = await api.get('/reference/drugs', { params: { q, limit: 15 } });
      setResults(resp.data.data || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search drug by brand or generic name…"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={search}
          disabled={loading || q.trim().length < 2}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </button>
      </div>

      {searched && !loading && results.length === 0 && (
        <p className="text-center text-gray-500 py-8">No drugs found for "{q}"</p>
      )}

      <div className="space-y-2">
        {results.map(d => <DrugCard key={d.id} drug={d} />)}
      </div>
    </div>
  );
}

// ── Clinical knowledge search tab ─────────────────────────────────────────────

function KnowledgeTab() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<KnowledgeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const EXAMPLE_QUERIES = [
    'Management of acute MI with ST elevation',
    'Differential diagnosis of acute chest pain',
    'Hypertensive emergency management',
    'Acute liver failure treatment',
    'Pulmonary embolism diagnosis algorithm',
  ];

  const search = async (query = q) => {
    if (query.trim().length < 3) return;
    setLoading(true);
    setSearched(true);
    try {
      const resp = await api.post('/reference/search', { query, limit: 5 });
      setResults(resp.data.data || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Ask a clinical question or search a condition…"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={() => search()}
          disabled={loading || q.trim().length < 3}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </button>
      </div>

      {!searched && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Example queries:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map(eq => (
              <button
                key={eq}
                onClick={() => { setQ(eq); search(eq); }}
                className="text-xs px-2 py-1 border border-blue-200 text-blue-600 rounded hover:bg-blue-50"
              >
                {eq}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-500">Searching knowledge base…</span>
        </div>
      )}

      <div className="space-y-3">
        {results.map((r, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <p className="font-semibold text-gray-800 text-sm">{r.title}</p>
              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{Math.round((r.similarity || 0) * 100)}% match</span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-5">{r.content}</p>
            {r.source && <p className="text-xs text-gray-400 mt-2">Source: {r.source}</p>}
          </div>
        ))}
        {searched && !loading && results.length === 0 && (
          <p className="text-center text-gray-500 py-8">No results found — try rephrasing the query</p>
        )}
      </div>
    </div>
  );
}

// ── Procedures tab ────────────────────────────────────────────────────────────

function ProceduresTab() {
  const [procedures, setProcedures] = useState<{ id: string; name: string; guideline: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Procedure | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/reference/procedures').then(r => setProcedures(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const selectProcedure = async (id: string) => {
    setSelected(id);
    setDetailLoading(true);
    try {
      const r = await api.get(`/reference/procedures/${id}`);
      setDetail(r.data.data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {loading && <p className="text-center text-gray-500 py-8">Loading procedures…</p>}

      {!selected ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {procedures.map(p => (
            <button
              key={p.id}
              onClick={() => selectProcedure(p.id)}
              className="text-left border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
              <p className="text-xs text-gray-400 mt-1">{p.guideline}</p>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <button onClick={() => { setSelected(null); setDetail(null); }} className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1">
            ← Back to procedures
          </button>

          {detailLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>}

          {detail && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{detail.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Guideline: {detail.guideline}</p>
              </div>
              {detail.steps.map((phase, i) => (
                <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className={`px-4 py-2 font-semibold text-sm ${i === 0 ? 'bg-blue-50 text-blue-800' : i === 1 ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>
                    {i + 1}. {phase.phase}
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {phase.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50">
                        <CheckCircle2 className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BedsideReference() {
  const [tab, setTab] = useState<Tab>('drugs');

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bedside Clinical Reference</h1>
            <p className="text-sm text-gray-500">Drug formulary (CIMS), clinical knowledge base, procedure checklists — BNF / NICE / ESC / ACC standards</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'drugs'      && <DrugFormularyTab />}
        {tab === 'knowledge'  && <KnowledgeTab />}
        {tab === 'procedures' && <ProceduresTab />}

        <div className="mt-6 text-center">
          <div className="flex items-center justify-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-4 py-2">
            <AlertTriangle className="w-4 h-4" />
            For clinical decision support only. Always verify with current BNF, local formulary, and specialist guidance before prescribing.
          </div>
        </div>
      </div>
    </div>
  );
}
