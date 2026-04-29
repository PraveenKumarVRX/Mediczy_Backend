/**
 * DoctorCalculators — Medical Calculators Page
 * ─────────────────────────────────────────────
 * All calculations are purely client-side.
 * Includes: BMI · BSA · eGFR (CKD-EPI 2021) · Drug Dose · APGAR · QTc · IV Fluids
 */

import { useState, useCallback } from 'react';
import MainLayout from '@/components/layout/MainLayoutdoctor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Scale,
  Activity,
  Droplets,
  Pill,
  Baby,
  Heart,
  Thermometer,
  Copy,
} from 'lucide-react';

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'bmi',    label: 'BMI',        icon: Scale },
  { id: 'bsa',    label: 'BSA',        icon: Activity },
  { id: 'gfr',    label: 'eGFR',       icon: Droplets },
  { id: 'dose',   label: 'Drug Dose',  icon: Pill },
  { id: 'apgar',  label: 'APGAR',      icon: Baby },
  { id: 'qtc',    label: 'QTc',        icon: Heart },
  { id: 'fluids', label: 'IV Fluids',  icon: Thermometer },
] as const;

type TabId = typeof TABS[number]['id'];

const pf = (s: string) => parseFloat(s) || 0;

// ─── Shared field ─────────────────────────────────────────────────────────────
const Field = ({
  label, value, onChange, placeholder, type = 'number',
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <Input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 text-sm"
    />
  </div>
);

// ─── Result display ───────────────────────────────────────────────────────────
const ResultCard = ({
  items, copyText,
}: {
  items: { label: string; value: string; highlight?: boolean }[];
  copyText: string;
}) => {
  const { toast } = useToast();
  return (
    <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 space-y-3">
      {items.map((item, i) => (
        <div key={i} className={`flex justify-between items-center ${i < items.length - 1 ? 'border-b border-blue-100 dark:border-blue-800 pb-3' : ''}`}>
          <span className="text-sm text-muted-foreground">{item.label}</span>
          <span className={item.highlight ? 'text-lg font-bold text-blue-600 dark:text-blue-400' : 'text-sm font-semibold text-foreground'}>
            {item.value}
          </span>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-8 text-xs gap-1.5 text-blue-600"
        onClick={() => {
          navigator.clipboard.writeText(copyText);
          toast({ title: 'Copied', description: 'Result copied to clipboard.' });
        }}
      >
        <Copy className="h-3 w-3" /> Copy Result
      </Button>
    </div>
  );
};

// ─── BMI ─────────────────────────────────────────────────────────────────────
const BMICalc = () => {
  const [w, setW] = useState(''); const [h, setH] = useState('');
  const [r, setR] = useState<{ bmi: string; cat: string; idealRange: string } | null>(null);

  const calc = () => {
    const wkg = pf(w); const hcm = pf(h);
    if (wkg <= 0 || hcm <= 0) return;
    const hm = hcm / 100;
    const bmi = wkg / (hm * hm);
    const cat = bmi < 18.5 ? 'Underweight'
      : bmi < 25 ? 'Normal weight'
      : bmi < 30 ? 'Overweight'
      : bmi < 35 ? 'Obese — Class I'
      : bmi < 40 ? 'Obese — Class II'
      : 'Obese — Class III';
    const iMin = (18.5 * hm * hm).toFixed(1);
    const iMax = (24.9 * hm * hm).toFixed(1);
    setR({ bmi: bmi.toFixed(1), cat, idealRange: `${iMin}–${iMax} kg` });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground italic">BMI = weight (kg) ÷ height² (m)</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight (kg)" value={w} onChange={setW} placeholder="e.g. 70" />
        <Field label="Height (cm)" value={h} onChange={setH} placeholder="e.g. 170" />
      </div>
      <Button onClick={calc} className="w-full h-9" disabled={!w || !h}>Calculate BMI</Button>
      {r && <ResultCard copyText={`BMI: ${r.bmi} kg/m² — ${r.cat}`} items={[
        { label: 'BMI', value: `${r.bmi} kg/m²`, highlight: true },
        { label: 'Category', value: r.cat },
        { label: 'Ideal weight', value: r.idealRange },
      ]} />}
    </div>
  );
};

// ─── BSA ─────────────────────────────────────────────────────────────────────
const BSACalc = () => {
  const [w, setW] = useState(''); const [h, setH] = useState('');
  const [r, setR] = useState<{ db: string; mo: string } | null>(null);

  const calc = () => {
    const wkg = pf(w); const hcm = pf(h);
    if (wkg <= 0 || hcm <= 0) return;
    const db = 0.007184 * Math.pow(hcm, 0.725) * Math.pow(wkg, 0.425);
    const mo = Math.sqrt((hcm * wkg) / 3600);
    setR({ db: db.toFixed(3), mo: mo.toFixed(3) });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground italic">Du Bois: 0.007184 × H⁰·⁷²⁵ × W⁰·⁴²⁵</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight (kg)" value={w} onChange={setW} placeholder="e.g. 70" />
        <Field label="Height (cm)" value={h} onChange={setH} placeholder="e.g. 170" />
      </div>
      <Button onClick={calc} className="w-full h-9" disabled={!w || !h}>Calculate BSA</Button>
      {r && <ResultCard copyText={`BSA (Du Bois): ${r.db} m²`} items={[
        { label: 'BSA — Du Bois', value: `${r.db} m²`, highlight: true },
        { label: 'BSA — Mosteller', value: `${r.mo} m²` },
      ]} />}
    </div>
  );
};

// ─── eGFR ─────────────────────────────────────────────────────────────────────
const GFRCalc = () => {
  const [scr, setScr] = useState(''); const [age, setAge] = useState('');
  const [sex, setSex] = useState('Male');
  const [r, setR] = useState<{ egfr: string; stage: string } | null>(null);

  const calc = () => {
    const s = pf(scr); const a = pf(age);
    if (s <= 0 || a <= 0) return;
    const female = sex === 'Female';
    const kappa = female ? 0.7 : 0.9;
    const alpha = female ? -0.241 : -0.302;
    const ratio = s / kappa;
    const egfr = 142
      * Math.pow(Math.min(ratio, 1), alpha)
      * Math.pow(Math.max(ratio, 1), -1.200)
      * Math.pow(0.9938, a)
      * (female ? 1.012 : 1.0);
    const stage = egfr >= 90 ? 'G1 — Normal'
      : egfr >= 60 ? 'G2 — Mildly decreased'
      : egfr >= 45 ? 'G3a — Mild-moderate'
      : egfr >= 30 ? 'G3b — Moderate-severe'
      : egfr >= 15 ? 'G4 — Severely decreased'
      : 'G5 — Kidney failure';
    setR({ egfr: egfr.toFixed(1), stage });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground italic">CKD-EPI 2021 (race-free), mL/min/1.73m²</p>
      <Field label="Serum Creatinine (mg/dL)" value={scr} onChange={setScr} placeholder="e.g. 1.2" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Age (years)" value={age} onChange={setAge} placeholder="e.g. 55" />
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Sex</Label>
          <div className="flex gap-2">
            {['Male', 'Female'].map(g => (
              <Button key={g} variant={sex === g ? 'default' : 'outline'} size="sm" className="flex-1 h-9 text-xs"
                onClick={() => setSex(g)}>{g}</Button>
            ))}
          </div>
        </div>
      </div>
      <Button onClick={calc} className="w-full h-9" disabled={!scr || !age}>Calculate eGFR</Button>
      {r && <ResultCard copyText={`eGFR: ${r.egfr} mL/min/1.73m² — ${r.stage}`} items={[
        { label: 'eGFR', value: `${r.egfr} mL/min/1.73m²`, highlight: true },
        { label: 'CKD Stage', value: r.stage },
      ]} />}
    </div>
  );
};

// ─── Drug Dose ────────────────────────────────────────────────────────────────
const DrugDoseCalc = () => {
  const [w, setW] = useState(''); const [d, setD] = useState(''); const [freq, setFreq] = useState('1');
  const [r, setR] = useState<{ single: string; daily: string } | null>(null);

  const calc = () => {
    const wkg = pf(w); const dosePerKg = pf(d); const f = pf(freq) || 1;
    if (wkg <= 0 || dosePerKg <= 0) return;
    const single = wkg * dosePerKg;
    setR({ single: single.toFixed(2), daily: (single * f).toFixed(2) });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground italic">Dose (mg) = weight (kg) × dose/kg</p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Weight (kg)" value={w} onChange={setW} placeholder="60" />
        <Field label="Dose (mg/kg)" value={d} onChange={setD} placeholder="10" />
        <Field label="Frequency/day" value={freq} onChange={setFreq} placeholder="3" />
      </div>
      <Button onClick={calc} className="w-full h-9" disabled={!w || !d}>Calculate Dose</Button>
      {r && <ResultCard copyText={`Single: ${r.single} mg | Daily: ${r.daily} mg`} items={[
        { label: 'Single dose', value: `${r.single} mg`, highlight: true },
        { label: 'Total daily dose', value: `${r.daily} mg` },
      ]} />}
    </div>
  );
};

// ─── APGAR ────────────────────────────────────────────────────────────────────
const APGAR_ITEMS = [
  { key: 'ap', label: 'Appearance (Skin color)', opts: ['Blue/pale all over', 'Blue extremities, pink body', 'Pink all over'] },
  { key: 'pu', label: 'Pulse (Heart rate)',      opts: ['Absent', '<100 bpm', '≥100 bpm'] },
  { key: 'gr', label: 'Grimace (Reflex)',         opts: ['No response', 'Grimace only', 'Cry / cough / sneeze'] },
  { key: 'ac', label: 'Activity (Muscle tone)',  opts: ['Limp', 'Some flexion', 'Active motion'] },
  { key: 're', label: 'Respiration',             opts: ['Absent', 'Weak / irregular', 'Strong cry'] },
];

const APGARCalc = () => {
  const [scores, setScores] = useState<Record<string, number | null>>({
    ap: null, pu: null, gr: null, ac: null, re: null,
  });
  const [r, setR] = useState<{ total: number; interp: string } | null>(null);

  const set = (key: string, val: number) => setScores(p => ({ ...p, [key]: val }));

  const calc = () => {
    const vals = Object.values(scores);
    if (vals.some(v => v === null)) return;
    const total = (vals as number[]).reduce((a, b) => a + b, 0);
    const interp = total >= 7 ? 'Normal (7–10)'
      : total >= 4 ? 'Moderately abnormal (4–6) — resuscitation may be needed'
      : 'Critically low (0–3) — immediate resuscitation required';
    setR({ total, interp });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground italic">Assessed at 1 min and 5 min after birth</p>
      {APGAR_ITEMS.map(item => (
        <div key={item.key}>
          <Label className="text-xs text-muted-foreground mb-1.5 block">{item.label}</Label>
          <div className="grid grid-cols-3 gap-2">
            {item.opts.map((opt, idx) => (
              <Button
                key={idx}
                variant={scores[item.key] === idx ? 'default' : 'outline'}
                size="sm"
                className="h-auto py-1.5 px-2 text-xs whitespace-normal text-center leading-tight"
                onClick={() => set(item.key, idx)}
              >
                <span className="font-bold mr-1">{idx}</span> {opt}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <Button onClick={calc} className="w-full h-9"
        disabled={Object.values(scores).some(v => v === null)}>
        Calculate APGAR
      </Button>
      {r && <ResultCard copyText={`APGAR: ${r.total}/10 — ${r.interp}`} items={[
        { label: 'Total score', value: `${r.total} / 10`, highlight: true },
        { label: 'Interpretation', value: r.interp },
      ]} />}
    </div>
  );
};

// ─── QTc ─────────────────────────────────────────────────────────────────────
const QTcCalc = () => {
  const [qt, setQt] = useState(''); const [hr, setHr] = useState('');
  const [r, setR] = useState<{ qtc: string; risk: string } | null>(null);

  const calc = () => {
    const qtMs = pf(qt); const hrBpm = pf(hr);
    if (qtMs <= 0 || hrBpm <= 0) return;
    const rr = 60 / hrBpm;
    const qtc = (qtMs / 1000 / Math.sqrt(rr)) * 1000;
    const risk = qtc < 440 ? 'Normal'
      : qtc < 470 ? 'Borderline — monitor'
      : qtc < 500 ? 'Prolonged — review medications'
      : '⚠️ Severely prolonged — risk of Torsades de Pointes';
    setR({ qtc: qtc.toFixed(0), risk });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground italic">Bazett formula: QTc = QT / √RR</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="QT interval (ms)" value={qt} onChange={setQt} placeholder="e.g. 420" />
        <Field label="Heart rate (bpm)" value={hr} onChange={setHr} placeholder="e.g. 72" />
      </div>
      <Button onClick={calc} className="w-full h-9" disabled={!qt || !hr}>Calculate QTc</Button>
      {r && <ResultCard copyText={`QTc: ${r.qtc} ms — ${r.risk}`} items={[
        { label: 'QTc (Bazett)', value: `${r.qtc} ms`, highlight: true },
        { label: 'Risk', value: r.risk },
      ]} />}
    </div>
  );
};

// ─── IV Fluids ────────────────────────────────────────────────────────────────
const IVFluidsCalc = () => {
  const [w, setW] = useState('');
  const [r, setR] = useState<{ daily: string; rate: string } | null>(null);

  const calc = () => {
    const wkg = pf(w);
    if (wkg <= 0) return;
    let daily = 0;
    if (wkg <= 10)      daily = wkg * 100;
    else if (wkg <= 20) daily = 1000 + (wkg - 10) * 50;
    else                daily = 1500 + (wkg - 20) * 20;
    setR({ daily: daily.toFixed(0), rate: (daily / 24).toFixed(1) });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground italic">Holliday-Segar: 100/50/20 rule</p>
      <div className="p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground space-y-1">
        <p>≤10 kg: 100 mL/kg/day</p>
        <p>10–20 kg: 1000 + 50 mL/kg/day</p>
        <p>&gt;20 kg: 1500 + 20 mL/kg/day</p>
      </div>
      <Field label="Patient weight (kg)" value={w} onChange={setW} placeholder="e.g. 15" />
      <Button onClick={calc} className="w-full h-9" disabled={!w}>Calculate IV Fluids</Button>
      {r && <ResultCard copyText={`IV fluids: ${r.daily} mL/day (${r.rate} mL/hr)`} items={[
        { label: 'Daily fluid requirement', value: `${r.daily} mL/day`, highlight: true },
        { label: 'Infusion rate', value: `${r.rate} mL/hr` },
      ]} />}
    </div>
  );
};

const CALC_COMPONENTS: Record<TabId, JSX.Element> = {
  bmi:    <BMICalc />,
  bsa:    <BSACalc />,
  gfr:    <GFRCalc />,
  dose:   <DrugDoseCalc />,
  apgar:  <APGARCalc />,
  qtc:    <QTcCalc />,
  fluids: <IVFluidsCalc />,
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const DoctorCalculators = () => {
  const [activeTab, setActiveTab] = useState<TabId>('bmi');
  const ActiveCalc = CALC_COMPONENTS[activeTab];

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-teal-600 rounded-xl">
            <Scale className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Medical Calculators</h1>
            <p className="text-sm text-muted-foreground">Clinical decision support — all calculations run locally</p>
          </div>
          <Badge variant="secondary" className="ml-auto">7 Calculators</Badge>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${activeTab === tab.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Calculator card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {(() => { const Icon = TABS.find(t => t.id === activeTab)!.icon; return <Icon className="h-4 w-4 text-teal-600" />; })()}
              {TABS.find(t => t.id === activeTab)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ActiveCalc}
          </CardContent>
        </Card>

      </div>
    </MainLayout>
  );
};

export default DoctorCalculators;
