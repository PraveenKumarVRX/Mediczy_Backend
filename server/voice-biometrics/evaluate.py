"""Evaluate a consented held-out speaker corpus; never promote from toy fixtures.

Manifest: [{enroll:relative_wav,probe:relative_wav,same:bool,spoof:bool}].
Run in the isolated model environment with pinned artifact variables.
"""
import argparse,base64,hashlib,json,math
from pathlib import Path
import numpy as np
from service import decode_wave,encode

def upper95(errors,total):
    if total==0:return 1.0
    z=1.96;p=errors/total
    return (p+z*z/(2*total)+z*math.sqrt(p*(1-p)/total+z*z/(4*total*total)))/(1+z*z/total)

def main():
    p=argparse.ArgumentParser();p.add_argument('manifest');p.add_argument('--audio-root',required=True);p.add_argument('--threshold',type=float,required=True);p.add_argument('--output',required=True);args=p.parse_args()
    if not 0<args.threshold<1:raise ValueError('Threshold must be between zero and one')
    manifest=Path(args.manifest);pairs=json.loads(manifest.read_text());root=Path(args.audio_root).resolve();cache={};corpus=hashlib.sha256(manifest.read_bytes());counts={'genuine':0,'impostor':0,'spoof':0};errors={k:0 for k in counts};model=None;antispoof=None;seen_pairs=set()
    def embedding(name):
        path=(root/name).resolve()
        if not path.is_relative_to(root):raise ValueError('Audio must stay inside the approved dataset root')
        if name not in cache:
            raw=path.read_bytes();corpus.update(hashlib.sha256(raw).digest());_,samples=decode_wave(base64.b64encode(raw).decode());cache[name]={**encode(samples),'audioSha256':hashlib.sha256(raw).hexdigest()}
        return cache[name]
    for pair in pairs:
        if type(pair.get('same')) is not bool or type(pair.get('spoof')) is not bool:raise ValueError('Each pair requires explicit same/spoof labels')
        a,b=embedding(pair['enroll']),embedding(pair['probe']);model=b['model'];antispoof=b['antiSpoofModel']
        pair_key=tuple(sorted((a['audioSha256'],b['audioSha256'])))
        if pair_key[0]==pair_key[1] or pair_key in seen_pairs:raise ValueError('Comparisons must use distinct audio and unique pairs')
        seen_pairs.add(pair_key)
        x,y=np.asarray(a['embedding']),np.asarray(b['embedding']);score=float(x@y/(np.linalg.norm(x)*np.linalg.norm(y)));match=score>=args.threshold and b['liveness']
        group='spoof' if pair['spoof'] else 'genuine' if pair['same'] else 'impostor';counts[group]+=1;errors[group]+=int(not match if group=='genuine' else match)
    result={'model':model,'antiSpoofModel':antispoof,'datasetEvidence':'sha256:'+corpus.hexdigest(),'threshold':args.threshold,'counts':counts,'falseAcceptRate':errors['impostor']/max(1,counts['impostor']),'falseRejectRate':errors['genuine']/max(1,counts['genuine']),'spoofAcceptRate':errors['spoof']/max(1,counts['spoof']),'falseAcceptUpper95':upper95(errors['impostor'],counts['impostor']),'falseRejectUpper95':upper95(errors['genuine'],counts['genuine']),'spoofAcceptUpper95':upper95(errors['spoof'],counts['spoof'])}
    result['passed']=bool(antispoof and counts['impostor']>=5000 and counts['genuine']>=1000 and counts['spoof']>=1000 and result['falseAcceptUpper95']<=.001 and result['falseRejectUpper95']<=.05 and result['spoofAcceptUpper95']<=.01)
    Path(args.output).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'passed':result['passed'],'counts':counts}));return 0 if result['passed'] else 2
if __name__=='__main__':raise SystemExit(main())
