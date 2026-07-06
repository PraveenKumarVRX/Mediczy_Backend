import { applyTemplate } from '../services/imaging/imaging-template-macros.js';

describe('imaging-report-templates', () => {
  it('replaces macro placeholders', () => {
    const body = 'FINDINGS:\n{{findings}}\n\nIMPRESSION:\n{{impression}}';
    const out = applyTemplate(body, { findings: 'Clear lungs.', impression: 'Normal.' });
    expect(out).toContain('Clear lungs.');
    expect(out).toContain('Normal.');
    expect(out).not.toContain('{{');
  });

  it('strips unfilled macros', () => {
    const out = applyTemplate('{{technique}}\n{{findings}}', { technique: 'CT chest' });
    expect(out).toContain('CT chest');
    expect(out).not.toContain('{{findings}}');
  });
});

describe('imaging-workflow states', () => {
  it('documents expected workflow states', () => {
    const states = ['received', 'ai_analysis', 'assigned', 'drafting', 'review', 'signed', 'archived'];
    expect(states).toContain('received');
    expect(states).toContain('ai_analysis');
    expect(states).toContain('signed');
  });
});
