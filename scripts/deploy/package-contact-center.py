#!/usr/bin/env python3
"""Overlay committed, reviewed voice files onto an isolated copy of the live release."""
import argparse,hashlib,json,pathlib,subprocess,os
root=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--base-release',required=True);p.add_argument('--output',required=True);p.add_argument('--revision',required=True);args=p.parse_args()
base=pathlib.Path(args.base_release).resolve();out=pathlib.Path(args.output).resolve()
parent=pathlib.Path('/home/ubuntu/mediqzy-releases')
if base.parent!=parent or out.parent!=parent or not (base/'server/index.js').is_file() or out.exists():raise SystemExit('Use the current isolated base and a new release directory')
revision=subprocess.check_output(['git','rev-parse',args.revision+'^{commit}'],cwd=root,text=True).strip()
manifest=json.loads(subprocess.check_output(['git','show',revision+':docs/testing/CONTACT_CENTER_LIVEKIT_VERIFICATION_2026-10-20.json'],cwd=root))
files=set(manifest['sourceSha256'])
files.update(['server/routes/crm.route.js','client/src/pages/crm/CRMTelecallerDialer.tsx','client/src/pages/crm/CRMTelecallerDialer.test.tsx','client/src/pages/crm/dialerClient.ts','client/tsconfig.dialer.json','client/src/pages/crm/contact-center-theme.css','client/src/pages/crm/contactCenterClient.ts','client/src/pages/crm/contactCenterClient.test.ts','client/src/utils/voice-permission.ts','client/src/pages/crm/ContactCenterRecovery.test.tsx','scripts/deploy/activate-contact-center.cjs','scripts/deploy/package-contact-center.py','server/scripts/qa/contact-center-release-smoke.mjs'])
out.mkdir(mode=0o750)
subprocess.run(['rsync','-a','--exclude=.git/','--exclude=node_modules/','--exclude=dist/','--exclude=logs/','--exclude=__pycache__/','--exclude=.venv/','--exclude=venv/',str(base)+'/',str(out)+'/'],check=True)
for relative in ['server/node_modules','client/node_modules']:
 target=out/relative
 if not target.exists():target.symlink_to(root/relative,target_is_directory=True)
for relative in files:
 target=out/relative;target.parent.mkdir(parents=True,exist_ok=True)
 target.write_bytes(subprocess.check_output(['git','show',revision+':'+relative],cwd=root))
record={'at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'commit':revision,'parentRelease':str(base),'release':str(out),'strategy':'Preserve current live baseline and overlay only reviewed committed communications files','sourceSha256':{f:hashlib.sha256((out/f).read_bytes()).hexdigest() for f in sorted(files)},'unrelatedWorkingTreeEditsExcluded':True}
(out/'contact-center-release-manifest.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'release':str(out),'commit':revision,'overlaidFiles':len(files)}))
