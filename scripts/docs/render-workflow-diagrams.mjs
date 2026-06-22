#!/usr/bin/env node
/**
 * Render Mermaid diagrams from hospital workflow Markdown to PNG/SVG.
 *
 * Prerequisites: npx @mermaid-js/mermaid-cli (auto-installed via npx)
 * Usage: node scripts/docs/render-workflow-diagrams.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const SOURCES = [
  {
    source: path.join(ROOT, 'docs/hospital/MEDIQZY_HOSPITAL_OS_WORKFLOW_CHARTS.md'),
    outDir: path.join(ROOT, 'docs/hospital/exports/diagrams'),
    names: [
      '01-platform-layers',
      '02-patient-entry-paths',
      '03-master-journey-admission-discharge',
      '04-scheduled-opd-sequence',
      '05-walk-in-opd',
      '06-emergency-triage',
      '07-ipd-admission',
      '08-inpatient-stay',
      '09-discharge-readiness',
      '10-department-operations',
      '11-queue-state-machine',
      '12-adt-timeline',
      '13-display-touchpoints-floor',
      '14-insurance-billing-overlay',
      '15-elective-surgery-journey',
    ],
    title: 'MediQzy Hospital OS — kiosk & display flowcharts',
  },
  {
    source: path.join(ROOT, 'docs/hospital/MEDIQZY_COMPLETE_HOSPITAL_WORKFLOWS.md'),
    outDir: path.join(ROOT, 'docs/hospital/exports/diagrams/complete'),
    names: [
      '01-module-map',
      '02-master-timeline',
      '03-queue-kiosk-displays',
      '04-doctor-opd-orders',
      '05-er-emergency',
      '06-admission-adt-beds',
      '07-insurance-tpa',
      '08-ward-nursing-emar',
      '09-icu',
      '10-ot',
      '11-lab-pathology',
      '12-radiology-ris',
      '13-pharmacy',
      '14-billing-finance',
      '15-mrd-records',
      '16-discharge',
      '17-blood-bank',
      '18-dietary',
      '19-cssd',
      '20-role-swimlane',
    ],
    title: 'MediQzy — complete hospital module flowcharts',
  },
];

function renderSource({ source, outDir, names, title }) {
  const md = fs.readFileSync(source, 'utf8');
  const blocks = [...md.matchAll(/```mermaid\n([\s\S]*?)```/g)];

  if (!blocks.length) {
    console.error('No mermaid blocks found in', source);
    return;
  }

  const tmp = path.join(outDir, '.tmp');
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Rendering ${blocks.length} diagrams from ${path.basename(source)} → ${outDir}\n`);

  blocks.forEach((match, i) => {
    const slug = names[i] || `diagram-${String(i + 1).padStart(2, '0')}`;
    const mmdPath = path.join(tmp, `${slug}.mmd`);
    const pngPath = path.join(outDir, `${slug}.png`);
    const svgPath = path.join(outDir, `${slug}.svg`);

    fs.writeFileSync(mmdPath, match[1].trim() + '\n');

    try {
      execSync(`npx --yes @mermaid-js/mermaid-cli -i "${mmdPath}" -o "${pngPath}" -b transparent`, {
        stdio: 'pipe',
        cwd: ROOT,
      });
      execSync(`npx --yes @mermaid-js/mermaid-cli -i "${mmdPath}" -o "${svgPath}" -b transparent`, {
        stdio: 'pipe',
        cwd: ROOT,
      });
      console.log(`  ✓ ${slug}.png + .svg`);
    } catch (e) {
      console.error(`  ✗ ${slug}:`, e.stderr?.toString() || e.message);
    }
  });

  const index = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui;max-width:960px;margin:2rem auto;padding:0 1rem}
img{max-width:100%;border:1px solid #e2e8f0;border-radius:8px;margin:1.5rem 0}</style></head><body>
<h1>${title}</h1>
<p>Generated from ${path.basename(source)}. Insert PNG/SVG into Word or PowerPoint.</p>
${names.slice(0, blocks.length).map((n) => `<h2>${n}</h2><img src="${n}.png" alt="${n}" />`).join('\n')}
</body></html>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), index);
  console.log(`\nPreview: file://${outDir}/index.html\n`);
}

for (const cfg of SOURCES) {
  renderSource(cfg);
}

console.log('Import PNG/SVG into Word, PowerPoint, draw.io, or Figma.');
