import subprocess,pathlib,re,csv,json,collections,argparse
parser=argparse.ArgumentParser(description='Inventory two source snapshots; no app execution or dependency installation.')
parser.add_argument('medcore')
parser.add_argument('mediqzy')
parser.add_argument('output')
args=parser.parse_args()
out=pathlib.Path(args.output)
out.mkdir(parents=True,exist_ok=True)
repos={'medcore':pathlib.Path(args.medcore),'mediqzy':pathlib.Path(args.mediqzy)}
summary={}
for name,root in repos.items():
 files=subprocess.check_output(['git','ls-files','-z'],cwd=root,text=True).rstrip('\0').split('\0')
 inv=[]; routes=[]; models=[]; mounts=[]
 for f in files:
  p=root/f
  if not p.is_file(): continue
  test=bool(re.search(r'(?:\.test\.|\.spec\.|(?:^|/)(?:__tests__|tests|e2e)/)',f))
  inv.append([f,p.stat().st_size,'test' if test else 'source_or_asset'])
  if p.suffix not in ('.js','.mjs','.cjs','.ts','.tsx','.jsx','.prisma','.sql'): continue
  s=p.read_text(errors='replace')
  if ('routes/' in f or f.endswith('/app.ts') or f.endswith('/index.js') or f.endswith('/app.js')) and not test:
   for m in re.finditer(r'\b([A-Za-z_][\w.]*)\.(get|post|put|patch|delete|head|options)\(\s*([\'"`])([^\'"`\n]+)\3',s):
    routes.append([f,s[:m.start()].count('\n')+1,m[1],m[2].upper(),m[4]])
   for m in re.finditer(r'\b(?:app|router)\.use\(\s*([\'"`])([^\'"`\n]+)\1',s):
    mounts.append([f,s[:m.start()].count('\n')+1,m[2]])
  if p.suffix=='.prisma':
   for m in re.finditer(r'^model (\w+)',s,re.M): models.append([f,s[:m.start()].count('\n')+1,m[1]])
 for suffix,headers,rows in [('files',['path','bytes','classification'],inv),('routes',['path','line','receiver','method','local_path'],routes),('mounts',['path','line','local_mount'],mounts),('models',['path','line','model'],models)]:
  with (out/f'{name}-{suffix}.csv').open('w') as fh:
   w=csv.writer(fh);w.writerow(headers);w.writerows(rows)
 summary[name]={'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'tracked_files':len(inv),'classified_test_files':sum(x[2]=='test' for x in inv),'literal_route_declarations':len(routes),'literal_mounts':len(mounts),'prisma_models':len(models),'next_page_files':sum(f.endswith('/page.tsx') for f in files),'extensions':dict(collections.Counter(pathlib.Path(f).suffix for f in files))}
(out/'inventory-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:{a:b for a,b in v.items() if a!='extensions'} for k,v in summary.items()},indent=2))
