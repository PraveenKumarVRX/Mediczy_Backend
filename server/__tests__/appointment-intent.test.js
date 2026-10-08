import { describe, expect, it } from '@jest/globals';
import detectAppointmentIntent from '../utils/appointmentIntent.js';

describe('appointment intent routing', () => {
  it('keeps psychology virtual-call requests in the My SmartHealth flow', () => {
    const intent = detectAppointmentIntent(
      'Search for a psychology counselor and schedule a virtual call with them for me'
    );

    expect(intent.matched).toBe(true);
    expect(['book', 'find']).toContain(intent.action);
    expect(intent.specialization).toBe('Psychologist');
  });
});
