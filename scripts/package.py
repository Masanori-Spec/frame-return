#!/usr/bin/env python3
"""Freeze source with recorded hosted evidence; does not publish or run CI."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
out = root.parent / 'frame-return-output'
verification_path = root / 'docs/evidence/hosted/verification.json'
verification = json.loads(verification_path.read_text())
if verification.get('schema') != 'frame-return-hosted-verification/v1':
    raise ValueError('Missing or unsupported hosted verification record')
checks = verification['checks']
for gate in ('browserGate', 'nativeShortGate', 'nativeLongGate'):
    if checks.get(gate) != 'passed':
        raise ValueError('Recorded hosted gate did not pass: ' + gate)
# Documentation may change after a run; tested application bytes may not silently drift.
for relative, expected in verification['testedApplicationFilesSha256'].items():
    if hashlib.sha256((root / relative).read_bytes()).hexdigest() != expected:
        raise ValueError('Application differs from the recorded tested build: ' + relative)
for entry in verification['files']:
    path = verification_path.parent / entry['path']
    if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
        raise ValueError('Evidence file changed: ' + entry['path'])

out.mkdir(exist_ok=True)
exclude = {'node_modules', '.git', '__pycache__', 'test-results', '.native-work'}
files = sorted(p for p in root.rglob('*') if p.is_file()
               and not any(x in exclude for x in p.relative_to(root).parts)
               and p.suffix != '.pyc')
record = {'status': 'passed', 'runUrl': verification['runUrl'],
          'testedCommit': verification['testedCommit']}
manifest = {'format': 'frame-return-review-freeze/v1',
            'independentSourceReview': verification['independentSourceReview'],
            'browserGate': dict(record), 'nativeGate': dict(record),
            'verificationRecord': 'docs/evidence/hosted/verification.json',
            'verificationRecordSha256': hashlib.sha256(verification_path.read_bytes()).hexdigest(),
            'files': []}
zip_path = out / 'frame-return-source.zip'
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        relative = path.relative_to(root).as_posix()
        data = path.read_bytes()
        info = zipfile.ZipInfo('frame-return/' + relative, date_time=(2026, 10, 4, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, data)
        manifest['files'].append({'path': relative, 'bytes': len(data),
                                  'sha256': hashlib.sha256(data).hexdigest()})
manifest['zip'] = {'name': zip_path.name, 'bytes': zip_path.stat().st_size,
                   'sha256': hashlib.sha256(zip_path.read_bytes()).hexdigest()}
(out / 'source-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
(out / 'frame-return.html').write_bytes((root / 'dist/index.html').read_bytes())
print(json.dumps({'files': len(files), **manifest['zip']}, indent=2))
