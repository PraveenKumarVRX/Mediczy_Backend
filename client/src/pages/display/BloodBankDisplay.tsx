import React, { useEffect, useState, useCallback } from 'react';
import DisplayShell from './DisplayShell';

interface BloodUnit {
  blood_group: string;
  component: string;
  units_available: number;
  level: 'ok' | 'low' | 'critical';
  expiry_alert?: boolean;
}

interface Requisition {
  req_id: string;
  blood_group: string;
  component: string;
  units: number;
  urgency: string;
  ward: string;
  status: string;
}

const BLOOD_GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const COMPONENTS = ['Whole Blood', 'RBC', 'Platelets', 'FFP', 'Cryoprecipitate'];

const LEVEL_STYLES = {
  ok: 'bg-green-900/60 border-green-700 text-green-300',
  low: 'bg-amber-900/60 border-amber-700 text-amber-300',
  critical: 'bg-red-900/60 border-red-700 text-red-300 animate-pulse',
};

const URGENCY_BADGE: Record<string, string> = {
  Emergency: 'bg-red-700 text-white',
  Urgent: 'bg-orange-700 text-white',
  Routine: 'bg-gray-700 text-gray-300',
};

export default function BloodBankDisplay() {
  const [inventory, setInventory] = useState<BloodUnit[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/display/blood-bank');
      const json = await res.json();
      if (json.success) {
        setInventory(json.inventory);
        if (json.requisitions) setRequisitions(json.requisitions);
        setLastUpdated(new Date());
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, [fetchData]);

  // Build lookup map: blood_group + component => unit
  const unitMap: Record<string, BloodUnit> = {};
  inventory.forEach(u => { unitMap[`${u.blood_group}|${u.component}`] = u; });

  const criticalCount = inventory.filter(u => u.level === 'critical').length;
  const lowCount = inventory.filter(u => u.level === 'low').length;
  const expiryCount = inventory.filter(u => u.expiry_alert).length;

  return (
    <DisplayShell zone="blood-bank" zoneName="Blood Bank Inventory" fullscreen>
      <div className="h-full flex flex-col p-4 gap-4">

        {/* Alert summary */}
        {(criticalCount > 0 || lowCount > 0 || expiryCount > 0) && (
          <div className="flex gap-3 shrink-0">
            {criticalCount > 0 && (
              <div className="flex-1 bg-red-900/60 border border-red-700 rounded-xl p-3 text-center">
                <p className="text-red-300 text-xs uppercase tracking-widest">Critical Stock</p>
                <p className="text-red-300 text-2xl font-black">{criticalCount} units</p>
              </div>
            )}
            {lowCount > 0 && (
              <div className="flex-1 bg-amber-900/60 border border-amber-700 rounded-xl p-3 text-center">
                <p className="text-amber-300 text-xs uppercase tracking-widest">Low Stock</p>
                <p className="text-amber-300 text-2xl font-black">{lowCount} units</p>
              </div>
            )}
            {expiryCount > 0 && (
              <div className="flex-1 bg-orange-900/60 border border-orange-700 rounded-xl p-3 text-center">
                <p className="text-orange-300 text-xs uppercase tracking-widest">Expiry Alert</p>
                <p className="text-orange-300 text-2xl font-black">{expiryCount} units</p>
              </div>
            )}
          </div>
        )}

        {/* Inventory grid */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-900">
                <th className="p-2 text-left text-gray-400 font-medium">Component</th>
                {BLOOD_GROUPS.map(bg => (
                  <th key={bg} className="p-2 text-center text-gray-300 font-bold">{bg}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPONENTS.map(comp => (
                <tr key={comp} className="border-t border-gray-800">
                  <td className="p-2 text-gray-300 font-medium text-xs whitespace-nowrap">{comp}</td>
                  {BLOOD_GROUPS.map(bg => {
                    const unit = unitMap[`${bg}|${comp}`];
                    const level = unit?.level ?? 'ok';
                    const qty = unit?.units_available ?? 0;
                    return (
                      <td key={bg} className="p-1 text-center">
                        <div className={`rounded-lg border px-2 py-1.5 ${LEVEL_STYLES[level]}`}>
                          <span className="text-lg font-black">{qty}</span>
                          {unit?.expiry_alert && <span className="text-xs block">⚠️</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Active requisitions */}
        {requisitions.length > 0 && (
          <div className="shrink-0 bg-gray-800/60 border border-gray-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Active Requisitions</h3>
            <div className="space-y-2">
              {requisitions.map(r => (
                <div key={r.req_id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-gray-300 font-mono text-xs">{r.req_id}</span>
                  <span className="font-bold text-white">{r.blood_group} · {r.component} × {r.units}</span>
                  <span className="text-gray-400 text-xs">{r.ward}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${URGENCY_BADGE[r.urgency] ?? 'bg-gray-700 text-gray-300'}`}>{r.urgency}</span>
                  <span className="text-gray-400 text-xs">{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-gray-600 text-xs text-right shrink-0">
          Updated: {lastUpdated.toLocaleTimeString('en-IN')} · Refreshes every 30 s
        </p>
      </div>
    </DisplayShell>
  );
}
