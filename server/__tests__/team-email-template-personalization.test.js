import { personalizeEmailTemplate, templatePlaceholders } from '../services/team-email-template-personalization.service.js';

describe('Team email template personalisation', () => {
  it('collects each valid placeholder once in first-seen order', () => {
    expect(templatePlaceholders('Hi {{employee_name}}', '<p>{{valid_to}} {{employee_name}}</p>'))
      .toEqual(['employee_name', 'valid_to']);
  });

  it('escapes personalised HTML values and retains intentionally unfilled variables', () => {
    const message = personalizeEmailTemplate({
      subject: 'AHC for {{employee_name}} by {{valid_to}}',
      body: '<p>Hello {{employee_name}}</p><a href="{{booking_url}}">Book</a>',
      variables: { employee_name: 'Aarav <Test>', booking_url: 'https://example.test/?x=1&y=2' },
    });
    expect(message.subject).toBe('AHC for Aarav <Test> by {{valid_to}}');
    expect(message.body).toContain('Aarav &lt;Test&gt;');
    expect(message.body).toContain('x=1&amp;y=2');
    expect(message.placeholders).toEqual(['employee_name', 'valid_to', 'booking_url']);
  });
});
