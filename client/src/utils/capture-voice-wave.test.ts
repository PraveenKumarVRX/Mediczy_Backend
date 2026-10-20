import {describe,it,expect} from 'vitest';
import {encodePcmWave} from './capture-voice-wave';
describe('voice challenge audio encoding',()=>{
 it('produces mono 16 kHz PCM16 WAV and clips safely',()=>{const value=encodePcmWave(new Float32Array([0,2,-2,0]),16000);const bytes=Uint8Array.from(atob(value),s=>s.charCodeAt(0)),view=new DataView(bytes.buffer);expect(String.fromCharCode(...bytes.slice(0,4))).toBe('RIFF');expect(view.getUint32(24,true)).toBe(16000);expect(view.getUint16(22,true)).toBe(1);expect(view.getInt16(46,true)).toBe(32767);expect(view.getInt16(48,true)).toBe(-32767);});
 it('resamples input to the model contract sample rate',()=>{const bytes=Uint8Array.from(atob(encodePcmWave(new Float32Array(48000),48000)),s=>s.charCodeAt(0));expect(new DataView(bytes.buffer).getUint32(40,true)).toBe(32000);});
});
