import { redactPhiText, sanitizeLlmMessages } from '../utils/phi-text-redactor.js';

describe('LLM text privacy boundary', () => {
  it.each(['Email: demo@example.test', 'Phone: +91 9876543210', 'Aadhaar: 1234 5678 9012', 'PAN: ABCDE1234F', 'MRN: DEMO-12345', 'Patient name: Example Person', 'DOB: 1990-02-03'])('redacts identifiers in prose: %s', text => {
    expect(redactPhiText(text)).not.toBe(text);
  });
  it('preserves ordinary clinical numbers', () => {
    const text = 'BP 120/80, pulse 72, oxygen 98%, metformin 500 mg twice daily, appointment in 14 days.';
    expect(redactPhiText(text)).toBe(text);
  });
  it('does not swallow clinical prose following a labeled identifier',()=>{
    expect(redactPhiText('MRN: DEMO-12345 needs a follow-up visit')).toBe('[REDACTED-IDENTIFIER] needs a follow-up visit');
  });
  it('masks JSON tool data without breaking JSON or call correlation',()=>{
    const sanitized=sanitizeLlmMessages([{role:'tool',tool_call_id:'call-123',content:JSON.stringify({phone:9876543210,notes:'demo@example.test',pulse:72})},{role:'assistant',tool_calls:[{id:'call-123',type:'function',function:{name:'lookup',arguments:'{"phone":9876543210}'}}]}]);
    expect(JSON.parse(sanitized[0].content)).toEqual({phone:'[REDACTED-NUM]',notes:'[REDACTED-EMAIL]',pulse:72});
    expect(sanitized[0].tool_call_id).toBe('call-123');
    expect(JSON.parse(sanitized[1].tool_calls[0].function.arguments).phone).toBe('[REDACTED-NUM]');
  });
  it('redacts strings and nested text without changing multimodal media', () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'demo@example.test' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,1234567890' } }] }];
    const sanitized = sanitizeLlmMessages(messages);
    expect(sanitized[0].content[0].text).toBe('[REDACTED-EMAIL]');
    expect(sanitized[0].content[1]).toEqual(messages[0].content[1]);
    expect(messages[0].content[0].text).toBe('demo@example.test');
  });
  it('uses explicit identifiers for names embedded in unlabelled prose', () => {
    expect(sanitizeLlmMessages([{ role: 'user', content: 'Example Person needs follow-up.' }], ['Example Person'])[0].content).toBe('[REDACTED-CONTEXT] needs follow-up.');
  });
  it('does not treat arbitrary data fields as binary media',()=>{
    expect(sanitizeLlmMessages([{role:'tool',content:{data:'Contact demo@example.test'}}])[0].content.data).toBe('Contact [REDACTED-EMAIL]');
  });
});
