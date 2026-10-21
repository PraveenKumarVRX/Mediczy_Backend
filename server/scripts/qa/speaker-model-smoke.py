"""Real encoder smoke using a generated tone; never a recognition evaluation."""
import argparse,importlib.util,json,os,time
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[2]/'voice-biometrics'
p=argparse.ArgumentParser();p.add_argument('--artifact',required=True);p.add_argument('--evidence',required=True);args=p.parse_args()
manifest=json.loads((root/'model-manifest.json').read_text());os.environ.update(VOICE_SPEAKER_MODEL_DIR=str(Path(args.artifact).resolve()),VOICE_BIOMETRIC_MODEL_SHA256=manifest['files']['embedding_model.ckpt'],VOICE_SPEAKER_CONFIG_SHA256=manifest['files']['hyperparams.yaml'])
spec=importlib.util.spec_from_file_location('speaker_service',root/'service.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
samples=(.15*np.sin(2*np.pi*220*np.arange(64000,dtype=np.float32)/16000)).astype(np.float32);start=time.monotonic();result=module.encode(samples)
assert len(result['embedding'])==192 and np.isfinite(result['embedding']).all() and np.linalg.norm(result['embedding'])>0
assert result['model']==manifest['files']['embedding_model.ckpt'] and not result['liveness']
record={'passed':True,'at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'modelRepo':manifest['repository'],'revision':manifest['revision'],'modelSha256':result['model'],'configSha256':manifest['files']['hyperparams.yaml'],'dimensions':192,'elapsedSeconds':round(time.monotonic()-start,2),'audio':'generated non-speech tone; no patient or human enrollment','liveness':False,'authenticationAllowed':False,'recognitionAccuracyEvaluated':False,'spoofModelEvaluated':False}
Path(args.evidence).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
