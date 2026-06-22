#!/usr/bin/env node
/**
 * Render Mermaid diagrams from MEDIQZY_HOSPITAL_OS_WORKFLOW_CHARTS.md to PNG/SVG.
 *
 * Prerequisites: npm install -g @mermaid-js/mermaid-cli  (or npx)
 * Usage: node scripts/docs/render-workflow-diagrams.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const SOURCE = path.join(ROOT, 'docs/hospital/MEDIQZY_HOSPITAL_OS_WORKFLOW_CHARTS.md');
const OUT_DIR = path.join(ROOT, 'docs/hospital/exports/diagrams');
const TMP = path.join(OUT_DIR, '.tmp');

const md = fs.readFileSync(SOURCE, 'utf8');
const blocks = [...md.matchAll(/```mermaid\n([\s\S]*?)```/g)];

if (!blocks.length) {
  console.error('No mermaid blocks found in', SOURCE);
  process.exit(1);
}

fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const names = [
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
];

console.log(`Rendering ${blocks.length} Mermaid diagrams → ${OUT_DIR}\n`);

blocks.forEach((match, i) => {
  const slug = names[i] || `diagram-${String(i + 1).padStart(2, '0')}`;
  const mmdPath = path.join(TMP, `${slug}.mmd`);
  const pngPath = path.join(OUT_DIR, `${slug}.png`);
  const svgPath = path.join(OUT_DIR, `${slug}.svg`);

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

// Index HTML for quick preview
const index = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Workflow diagrams</title>
<style>body{font-family:system-ui;max-width:960px;margin:2rem auto;padding:0 1rem}
img{max-width:100%;border:1px solid #e2e8f0;border-radius:8px;margin:1.5rem 0}</style></head><body>
<h1>MediQzy Hospital OS — rendered flowcharts</h1>
<p>Generated from MEDIQZY_HOSPITAL_OS_WORKFLOW_CHARTS.md. Insert PNG/SVG into Word or PowerPoint.</p>
${names.slice(0, blocks.length).map((n) => `<h2>${n}</h2><img src="${n}.png" alt="${n}" />`).join('\n')}
</body></html>`;
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), index);

console.log(`\nPreview: file://${OUT_DIR}/index.html`);
console.log('Import PNG/SVG into Word, PowerPoint, draw.io, or Figma.');
