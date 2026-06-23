import {
  composeBriefingResponse,
  inferBriefingRequest,
  inferNavigationScreen,
  isDoubtFollowUp,
  isIdentityOrGreeting,
  isSibPlaceholderResponse,
  isSubstantiveAnswer,
  lastAssistantText,
  stripRedundantIshaIntro,
  toSpokenText,
} from '../services/voice-assistant-response.service.js';

describe('voice-assistant-response', () => {
  it('strips redundant iSHA intros', () => {
    expect(stripRedundantIshaIntro("I'm iSHA, your clinical assistant. Metformin dose is 500mg."))
      .toBe('Metformin dose is 500mg.');
  });

  it('rejects filler directContent', () => {
    expect(isSubstantiveAnswer('Sure, let me check that for you.', 40)).toBe(false);
    expect(isSubstantiveAnswer('Metformin starting dose is typically 500 mg once or twice daily with meals.', 40)).toBe(true);
  });

  it('detects identity and greeting without over-matching', () => {
    expect(isIdentityOrGreeting('hello')).toBe(true);
    expect(isIdentityOrGreeting('who are you?')).toBe(true);
    expect(isIdentityOrGreeting('show my appointments today')).toBe(false);
  });

  it('detects doubt follow-ups', () => {
    expect(isDoubtFollowUp('are you sure?')).toBe(true);
    expect(isDoubtFollowUp('what is aspirin used for')).toBe(false);
  });

  it('returns last assistant text from history', () => {
    const history = [
      { role: 'user', text: 'dose of metformin' },
      { role: 'assistant', text: 'Typical starting dose is 500 mg daily.' },
      { role: 'user', text: 'are you sure?' },
    ];
    expect(lastAssistantText(history)).toBe('Typical starting dose is 500 mg daily.');
  });

  it('composes concise briefing speak separate from detail response', () => {
    const { response, speak } = composeBriefingResponse({
      unreadNotifications: [{ priority: 'urgent', title: 'Critical lab result' }],
      pendingRequests: [{ patientName: 'Ravi' }],
      upcomingSoon: [{ appointmentTime: '10:00', patientName: 'Anita' }],
      pendingTasks: [],
    });
    expect(speak).toContain('Urgent: Critical lab result.');
    expect(speak).not.toContain('Upcoming:');
    expect(response).toContain('Upcoming: 10:00 Anita');
  });

  it('limits spoken text to sentence count', () => {
    const spoken = toSpokenText('One. Two. Three. Four.', 2);
    expect(spoken).toBe('One. Two.');
  });

  it('infers navigation screens from open commands', () => {
    expect(inferNavigationScreen('open ai assist')).toBe('ai-assist');
    expect(inferNavigationScreen('go to monitoring')).toBe('monitoring');
    expect(inferNavigationScreen('what is metformin')).toBe(null);
  });

  it('infers briefing requests', () => {
    expect(inferBriefingRequest('give me my briefing')).toBe(true);
    expect(inferBriefingRequest('show appointments')).toBe(false);
  });

  it('detects SIB placeholder junk responses', () => {
    expect(isSibPlaceholderResponse('I understood this as a health intelligence request. Please confirm before I take action.')).toBe(true);
    expect(isSibPlaceholderResponse('Metformin 500mg twice daily with meals.')).toBe(false);
  });
});
