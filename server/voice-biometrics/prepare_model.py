"""Fetch only pinned official model artifacts; no upstream code is executed."""
import argparse,hashlib,json,os,tempfile,urllib.request
from pathlib import Path

def main():
    parser=argparse.ArgumentParser();parser.add_argument('directory');args=parser.parse_args()
    manifest=json.loads((Path(__file__).parent/'model-manifest.json').read_text())
    root=Path(args.directory).resolve();root.mkdir(parents=True,exist_ok=True)
    for name,digest in manifest['files'].items():
        target=root/name
        if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest()==digest:continue
        url=f"https://huggingface.co/{manifest['repository']}/resolve/{manifest['revision']}/{name}"
        temporary=None
        try:
            with urllib.request.urlopen(url,timeout=60) as response,tempfile.NamedTemporaryFile(dir=root,delete=False) as out:
                temporary=Path(out.name);h=hashlib.sha256()
                while chunk:=response.read(1048576):h.update(chunk);out.write(chunk)
            if h.hexdigest()!=digest:raise RuntimeError('Pinned artifact hash mismatch')
            os.replace(temporary,target);temporary=None
        finally:
            if temporary:temporary.unlink(missing_ok=True)
    print(json.dumps({'prepared':True,'revision':manifest['revision'],'files':len(manifest['files'])}))
if __name__=='__main__':main()
