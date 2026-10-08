import { jest } from '@jest/globals';
import {
  classifyDoctorCopilotPath,
  enrichDoctorCopilotContext,
  normalizeCopilotHistory,
  buildCopilotSessionId,
} from '../services/doctor-copilot.service.js';
import { getAiLayerMapSummary } from '../services/ai-layer-map.service.js';

describe('Doctor copilot gateway', () => {
  it('routes appointment queries to agent path', () => {
    expect(classifyDoctorCopilotPath('Show my appointments for today')).toBe('agent');
  });

  it('routes clinical drug questions to clinical path', () => {
    expect(classifyDoctorCopilotPath('What are side effects of metformin?')).toBe('clinical');
  });

  it('routes CDSS and knowledge-fabric requests to the governed agent action path', () => {
    expect(classifyDoctorCopilotPath('Run CDSS using the knowledge fabric for this patient')).toBe('agent');
    expect(classifyDoctorCopilotPath("Show the patient's current condition and protocol" )).toBe('agent');
  });

  it('enriches doctor context with patient and screen', () => {
    const ctx = enrichDoctorCopilotContext(
      { id: 7, firstName: 'Asha', role: 'doctor' },
      { currentScreen: 'health-records', currentPatient: { id: 12, name: 'Ravi' } }
    );
    expect(ctx.doctorName).toBe('Asha');
    expect(ctx.currentPatient.name).toBe('Ravi');
    expect(ctx.channel).toBe('doctor_copilot');
  });

  it('normalizes conversation history', () => {
    const history = normalizeCopilotHistory([
      { role: 'user', text: 'Hello' },
      { role: 'assistant', content: 'Hi doctor' },
    ]);
    expect(history).toHaveLength(2);
    expect(history[0].content).toBe('Hello');
  });

  it('builds stable session ids', () => {
    const a = buildCopilotSessionId(99, null);
    const b = buildCopilotSessionId(99, null);
    expect(a).toBe(b);
    expect(a.startsWith('copilot_')).toBe(true);
  });
});

describe('AI layer map service', () => {
  it('returns layer registry for governance dashboard', () => {
    const summary = getAiLayerMapSummary();
    expect(summary.operatingLayers).toBe('L1–L6');
    expect(summary.agiInScope).toBe(false);
    expect(summary.serviceRegistry.length).toBeGreaterThan(10);
    expect(summary.priorities.some((p) => p.initiative.includes('AI-PLATFORM-001'))).toBe(true);
  });
});
