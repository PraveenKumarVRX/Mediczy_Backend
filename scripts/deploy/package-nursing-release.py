#!/usr/bin/env python3
"""Package the reviewed nursing slice without stashing or deploying unrelated working-tree edits."""
import argparse, hashlib, io, json, os, pathlib, shutil, subprocess, tarfile

root=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--output',required=True);args=p.parse_args()
out=pathlib.Path(args.output).resolve()
if out.exists(): raise SystemExit('Use a new release directory')
manifest=json.loads((root/'docs/testing/NURSING_IMPLEMENTATION_VERIFICATION_2026-10-19.json').read_text())
files=set(manifest['source_sha256'])
files.update('''client/src/features/hospital-os/pages/NurseHandoverPage.tsx
client/src/pages/hospital/HospitalNurseStation.tsx
client/src/pages/nurse/NurseNotes.tsx
server/routes/domains/hmis.domain.js
server/services/consent-enforcement.service.js
server/models/nurse.model.intelligent.js
server/middleware/ringFencing.js
server/__tests__/nursing-ringfencing.test.js
server/app.js
server/utils/nursing-upload-paths.js
server/__tests__/nursing-upload-parser.test.js
server/__tests__/emar.test.js
server/__tests__/nursing-ipd.test.js
server/__tests__/roadmap-intelligence-route.test.js
server/package-lock.json
client/package-lock.json
scripts/deploy/package-nursing-release.py
scripts/deploy/activate-nursing-backend.cjs
server/scripts/deploy/nursing-production-release.mjs
server/scripts/demo/provision-nursing-demo.mjs
client/scripts/nursing-live-smoke.mjs
client/scripts/nursing-demo-live.mjs
client/scripts/nursing-demo-browser.mjs
client/scripts/nursing-demo-storage.mjs
infra/nursing/private-images.cloudformation.json'''.splitlines())
files.update(['server/database/index.js', 'server/middleware/api-auth.js', 'server/middleware/ipThreatIntelligence.js', 'server/services/database-provisioning.service.js', 'server/services/tenant-provisioner.service.js', 'server/services/dedicated-db-provisioner.service.js', 'server/db/pgPool.js', 'server/db/postgres.js', 'server/db/postgres-sequelize.js', 'server/db/postgres-tls.js', 'server/db/certs/aws-rds-ap-south-1.pem', 'server/scripts/ssm-env-loader.mjs', 'server/utils/runtime-secret-policy.js', 'server/scripts/ops/harden-nursing-database.mjs', 'server/scripts/ops/database-recovery-dump.mjs', 'server/scripts/ops/database-recovery-restore.mjs', 'infra/database/nursing-ownership.sql', 'infra/database/recovery.cloudformation.json', 'infra/database/encrypted-target.cloudformation.json', 'scripts/ops/load-prod-env.sh', 'scripts/ops/fix-prod-db-ownership.sh', 'scripts/ops/uat-to-prod-db-sync.sh', 'scripts/backup/pg-dump-prod.lib.sh'])
files.update(['server/scripts/ops/database-encrypted-cutover.mjs','scripts/sib-fastapi-start.sh','infra/database/sib-verified-tls.patch'])
files.update(['scripts/backup/encrypted-nightly-backup.sh','scripts/database/backup-database.sh','infra/database/backup-storage.cloudformation.json','infra/database/monitoring.cloudformation.json'])
base=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
out.mkdir(parents=True,mode=0o750)
archive=subprocess.Popen(['git','archive',base],cwd=root,stdout=subprocess.PIPE)
def release_filter(member,destination):
    parts=pathlib.PurePosixPath(member.name).parts
    if any(part in {'.venv','.venv-selenium','venv','node_modules','dist'} or part.startswith('.env') for part in parts): return None
    if member.issym() and pathlib.PurePosixPath(member.linkname).is_absolute(): return None
    return tarfile.data_filter(member,destination)
with tarfile.open(fileobj=archive.stdout,mode='r|') as tar:
    tar.extractall(out,filter=release_filter)
if archive.wait()!=0: raise SystemExit('git archive failed')
for name in files:
    target=out/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,target)
for name in ['server/node_modules','client/node_modules','.env','server/.env'] + [str(p.relative_to(root)) for p in (root/'client').glob('.env*') if p.is_file()]:
    source=root/name
    if source.exists():
        target=out/name
        if target.exists(): raise SystemExit('Release unexpectedly contains runtime state: '+name)
        target.symlink_to(source,target_is_directory=source.is_dir())
record={'base_commit':base,'source_tree':str(root),'release_directory':str(out),'overlay_sha256':{name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in sorted(files)},'excluded_unrelated_changes':True}
(out/'nursing-release-manifest.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'release_directory':str(out),'base_commit':base,'nursing_overlay_files':len(files)}))
