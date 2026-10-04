#!/usr/bin/env python3
"""Freeze a review ZIP and per-file manifest; does not publish or claim CI success."""
import hashlib
import json
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
out=root.parent/'frame-return-output'
out.mkdir(exist_ok=True)
exclude={'node_modules','.git','__pycache__','test-results','.native-work'}
files=sorted(p for p in root.rglob('*') if p.is_file() and not any(x in exclude for x in p.relative_to(root).parts) and p.suffix!='.pyc')
manifest={'format':'frame-return-review-freeze/v1','independentSourceReview':'incomplete','nativeGate':'unrun-local-hosted-required','browserGate':'unrun-local-hosted-required','files':[]}
zip_path=out/'frame-return-source.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for p in files:
        relative=p.relative_to(root).as_posix();data=p.read_bytes()
        info=zipfile.ZipInfo('frame-return/'+relative,date_time=(2026,10,4,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
        archive.writestr(info,data)
        manifest['files'].append({'path':relative,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
manifest['zip']={'name':zip_path.name,'bytes':zip_path.stat().st_size,'sha256':hashlib.sha256(zip_path.read_bytes()).hexdigest()}
(out/'source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(out/'frame-return.html').write_bytes((root/'dist/index.html').read_bytes())
print(json.dumps({'files':len(files),**manifest['zip']},indent=2))
