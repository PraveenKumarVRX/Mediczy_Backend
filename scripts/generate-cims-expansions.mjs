import fs from 'fs';
import path from 'path';

const dataDir = path.resolve('server/data');
const totalNew = 1800;
const files = [
  { name: 'cims-medicine-expansion-4.json', count: 300 },
  { name: 'cims-medicine-expansion-5.json', count: 300 },
  { name: 'cims-medicine-expansion-6.json', count: 300 },
  { name: 'cims-medicine-expansion-7.json', count: 300 },
  { name: 'cims-medicine-expansion-8.json', count: 300 },
  { name: 'cims-medicine-expansion-9.json', count: 300 }
];

const categories = [
  { name: 'Analgesics & Antipyretics', subs: ['NSAID', 'Analgesic', 'Opioid', 'COX-2'] },
  { name: 'Anti-infectives', subs: ['Beta-lactam', 'Cephalosporin', 'Macrolide', 'Fluoroquinolone', 'Antifungal', 'Antiviral', 'Antiparasitic'] },
  { name: 'Cardiovascular', subs: ['ACE Inhibitor', 'ARB', 'Beta-blocker', 'Calcium Channel Blocker', 'Statin', 'Diuretic', 'Antiplatelet'] },
  { name: 'Diabetes', subs: ['Metformin', 'Sulfonylurea', 'DPP-4 Inhibitor', 'SGLT2 Inhibitor', 'Insulin'] },
  { name: 'Gastroenterology', subs: ['PPI', 'H2 Blocker', 'Antacid', 'Antiemetic', 'Laxative'] },
  { name: 'Respiratory', subs: ['Bronchodilator', 'Inhaled Steroid', 'Antihistamine', 'Antitussive'] },
  { name: 'CNS', subs: ['SSRI', 'SNRI', 'TCA', 'Anticonvulsant', 'Antipsychotic', 'Anxiolytic'] },
  { name: 'Dermatology', subs: ['Antifungal', 'Antibacterial', 'Retinoid', 'Steroid', 'Emollient'] },
  { name: 'Ophthalmology', subs: ['Antibiotic', 'Lubricant', 'Anti-inflammatory', 'Antiglaucoma'] },
  { name: 'Vitamins & Minerals', subs: ['Multivitamin', 'Iron', 'Calcium', 'Vitamin D', 'B-Complex'] },
  { name: 'Hormones', subs: ['Thyroid', 'Corticosteroid', 'Sex Hormone', 'Insulin'] },
  { name: 'Musculoskeletal', subs: ['Muscle Relaxant', 'NSAID', 'DMARD', 'Gout'] },
  { name: 'Nephrology', subs: ['Erythropoietin', 'Phosphate Binder', 'Diuretic'] },
  { name: 'Oncology', subs: ['Chemotherapy', 'Targeted Therapy', 'Supportive Care'] },
  { name: 'Obstetrics & Gynecology', subs: ['Contraceptive', 'Antifibrinolytic', 'Oxytocic', 'Antifungal'] }
];

const forms = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Ointment', 'Gel', 'Inhaler', 'Drops'];
const manufacturers = ['Cipla', 'Sun Pharma', 'Dr Reddy', 'Torrent', 'GSK', 'Abbott', 'Pfizer', 'Lupin', 'Zydus', 'Mankind'];
const schedules = ['OTC', 'H', 'X'];
const strengths = ['5mg', '10mg', '20mg', '25mg', '40mg', '50mg', '100mg', '200mg', '500mg', '1g', '2g', '5ml', '10ml'];

let globalIndex = 1000;
let created = 0;

const makeMedicine = (idx) => {
  const cat = categories[idx % categories.length];
  const sub = cat.subs[idx % cat.subs.length];
  const form = forms[idx % forms.length];
  const manufacturer = manufacturers[idx % manufacturers.length];
  const schedule = schedules[idx % schedules.length];
  const strength = strengths[idx % strengths.length];

  const genericBase = `${cat.name.split(' ')[0]}Gen${idx % 97}`;
  const brandBase = `${cat.name.split(' ')[0]}Brand${idx % 211}`;

  return {
    id: `CIMS${globalIndex++}`,
    brandName: `${brandBase} ${strength}`,
    genericName: genericBase,
    strength,
    form,
    category: cat.name,
    subCategory: sub,
    manufacturer,
    composition: `${genericBase} ${strength}`,
    mrp: 20 + (idx % 180),
    packSize: (idx % 20) + 1,
    schedule,
    indication: `${cat.name} related condition management`,
    contraindication: 'Hypersensitivity',
    sideEffects: 'Nausea, dizziness, headache',
    dosage: 'As directed by physician',
    storage: 'Cool, dry place',
    pregnancy: ['A', 'B', 'C', 'D', 'X'][idx % 5],
    lactation: ['L1', 'L2', 'L3'][idx % 3],
    pediatric: 'Use with caution'
  };
};

for (const file of files) {
  const medicines = [];
  for (let i = 0; i < file.count; i++) {
    medicines.push(makeMedicine(created + i));
  }
  created += file.count;

  const filePath = path.join(dataDir, file.name);
  fs.writeFileSync(filePath, JSON.stringify({ medicines }, null, 2));
  console.log(`✅ Wrote ${file.count} medicines to ${file.name}`);
}

console.log(`Total new medicines generated: ${created} (target ${totalNew})`);
