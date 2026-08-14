import {
  buildMultipartRelated,
  buildAdaptiveDicomPolicy,
  studyToDicomJson,
  instanceToDicomJson,
  groupInstancesBySeries,
} from '../services/dicomweb-ohif.service.js';

describe('dicomweb-ohif', () => {
  it('converts study row to DICOM JSON tags', () => {
    const json = studyToDicomJson({
      study_instance_uid: '1.2.3.4',
      patient_name: 'DOE^JOHN',
      modality: 'CT',
      study_date: '2024-06-01',
    }, 3);
    expect(json['0020000D'].Value[0]).toBe('1.2.3.4');
    expect(json['00080060'].Value[0]).toBe('CT');
    expect(json['00201208'].Value[0]).toBe('3');
  });

  it('groups instances by series', () => {
    const map = groupInstancesBySeries([
      { series_instance_uid: 's1', sop_instance_uid: 'i1' },
      { series_instance_uid: 's1', sop_instance_uid: 'i2' },
      { series_instance_uid: 's2', sop_instance_uid: 'i3' },
    ]);
    expect(map.get('s1').length).toBe(2);
    expect(map.get('s2').length).toBe(1);
  });

  it('builds instance DICOM JSON', () => {
    const json = instanceToDicomJson(
      { study_instance_uid: '1.2.3', modality: 'MR' },
      { sop_instance_uid: '9.9.9', series_instance_uid: '5.5.5' },
    );
    expect(json['00080018'].Value[0]).toBe('9.9.9');
    expect(json['0020000E'].Value[0]).toBe('5.5.5');
  });

  it('does not leak internal parsed-file markers into DICOM JSON', () => {
    const json = instanceToDicomJson(
      { study_instance_uid: '1.2.3', modality: 'MR' },
      { sop_instance_uid: '9.9.9', series_instance_uid: '5.5.5' },
      {
        sopClassUid: '1.2.840.10008.5.1.4.1.1.4',
        _hasPixelData: true,
        _parseFailed: false,
        '00280010': { vr: 'US', Value: ['224'] },
      },
    );
    expect(json.sopClassUid).toBeUndefined();
    expect(json._hasPixelData).toBeUndefined();
    expect(json._parseFailed).toBeUndefined();
    expect(json['00080016'].Value[0]).toBe('1.2.840.10008.5.1.4.1.1.4');
    expect(json['00280010'].Value[0]).toBe('224');
  });

  it('adds transfer syntax to WADO-RS multipart frame parts', () => {
    const { body } = buildMultipartRelated([{
      bytes: Buffer.from([1, 2, 3]),
      contentType: 'application/octet-stream',
      transferSyntaxUID: '1.2.840.10008.1.2.1',
    }]);
    expect(body.toString('latin1')).toContain(
      'Content-Type: application/octet-stream; transfer-syntax=1.2.840.10008.1.2.1',
    );
  });

  it('selects constrained imaging policy for save-data clients', () => {
    const policy = buildAdaptiveDicomPolicy({ 'save-data': 'on', ect: '3g' }, {});
    expect(policy.mode).toBe('constrained');
    expect(policy.lowBandwidth).toBe(true);
    expect(policy.prefetchWindow).toBeLessThan(8);
    expect(policy.frameCacheSeconds).toBeGreaterThanOrEqual(3600);
  });

  it('allows diagnostic imaging policy override', () => {
    const policy = buildAdaptiveDicomPolicy({ 'save-data': 'on', ect: '2g' }, { quality: 'diagnostic' });
    expect(policy.mode).toBe('diagnostic');
    expect(policy.lowBandwidth).toBe(false);
    expect(policy.prefetchWindow).toBeGreaterThan(8);
  });
});
