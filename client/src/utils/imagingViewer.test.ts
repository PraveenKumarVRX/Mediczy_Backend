import { describe, expect, it } from 'vitest';
import { buildOhifViewerUrl } from './imagingViewer';

describe('imagingViewer', () => {
  it('normalizes study UID and adds diagnostic viewer hints', () => {
    const url = buildOhifViewerUrl('1.2.3,', { mode: 'diagnostic' });
    expect(url).toContain('/ohif/viewer?');
    expect(url).toContain('StudyInstanceUIDs=1.2.3');
    expect(url).toContain('quality=diagnostic');
  });

  it('adds preview hint for phone and low-bandwidth launches', () => {
    const url = buildOhifViewerUrl('1.2.840.10008', { mode: 'preview' });
    expect(url).toContain('StudyInstanceUIDs=1.2.840.10008');
    expect(url).toContain('quality=preview');
  });
});
