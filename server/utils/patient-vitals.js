// Adult screening ranges; these flags are not a diagnosis.
// Glucose: https://www.niddk.nih.gov/health-information/diabetes/overview/tests-diagnosis
// BP: https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings
export const vitalUnits = { blood_pressure: 'mmHg', heart_rate: 'bpm', temperature: '°F', blood_sugar: 'mg/dL', oxygen_level: '%', weight: 'kg' };

export function classifyVital(type, raw, fasting = false) {
  const parts = String(raw).trim().split('/').map(Number);
  const n = parts[0];
  if (!Object.hasOwn(vitalUnits, type) || !String(raw).trim() || !parts.every(Number.isFinite) || parts.some(v => v <= 0)) throw new Error('Enter a valid positive reading');
  if (type === 'blood_pressure') {
    if (parts.length !== 2 || n <= parts[1]) throw new Error('Enter blood pressure as systolic/diastolic, for example 120/80');
    if (n >= 180 || parts[1] >= 120) return 'critical';
    if (n >= 130 || parts[1] >= 80) return 'high';
    return n < 90 || parts[1] < 60 ? 'low' : 'normal';
  }
  if (parts.length !== 1) throw new Error('Enter a numeric reading');
  if (type === 'blood_sugar') return n < 54 || n >= 300 ? 'critical' : n < 70 ? 'low' : fasting ? (n >= 126 ? 'diabetes_range' : n >= 100 ? 'prediabetes_range' : 'normal') : n >= 200 ? 'high' : 'unclassified';
  if (type === 'heart_rate') return n < 40 || n > 150 ? 'critical' : n < 60 ? 'low' : n > 100 ? 'high' : 'normal';
  if (type === 'oxygen_level') { if (n > 100) throw new Error('Oxygen saturation cannot exceed 100%'); return n < 90 ? 'critical' : n < 95 ? 'low' : 'normal'; }
  if (type === 'temperature') return n < 95 || n >= 104 ? 'critical' : n >= 100.4 ? 'high' : 'normal';
  return 'unclassified'; // Weight needs height, age and context.
}

export function patientVitalHistory(records) {
  const readings = records.map(record => typeof record.toJSON === 'function' ? record.toJSON() : record);
  const aliases = { blood_glucose: 'blood_sugar', spo2: 'oxygen_level' };
  const key = reading => `${new Date(reading.recordedAt).toISOString()}:${reading.deviceId || ''}:${reading.source || ''}`;
  const diastolic = new Map(readings.filter(reading => reading.dataType === 'blood_pressure_diastolic').map(reading => [key(reading), reading]));
  return readings.flatMap(reading => {
    const r = { ...reading };
    let type = aliases[r.dataType] || r.dataType;
    if (r.dataType === 'blood_pressure_systolic') {
      const pair = diastolic.get(key(r));
      if (!pair || (r.unit && r.unit !== 'mmHg') || (pair.unit && pair.unit !== 'mmHg')) return [];
      type = 'blood_pressure';
      r.value = `${r.value}/${pair.value}`;
    }
    if (!vitalUnits[type]) return [];
    const value = r.metadata?.displayValue || (type === 'blood_pressure' && r.metadata?.diastolic ? `${r.metadata.systolic ?? r.value}/${r.metadata.diastolic}` : String(r.value));
    let status = 'unclassified';
    try {
      let classifiedValue = value;
      if (type === 'temperature' && ['°C', 'C', 'celsius'].includes(r.unit)) classifiedValue = String(Number(value) * 9 / 5 + 32);
      else if (r.unit && r.unit !== vitalUnits[type]) throw new Error('Unsupported unit');
      status = classifyVital(type, classifiedValue, r.metadata?.fasting === true || /fasting/i.test(r.metadata?.notes || ''));
    } catch { /* Unsupported historic reading stays unclassified. */ }
    return [{ id: String(r.id), type, value, unit: r.unit || vitalUnits[type], status, timestamp: r.recordedAt, notes: r.metadata?.notes || '', recordedBy: r.source === 'manual' ? 'Self' : r.source }];
  });
}
