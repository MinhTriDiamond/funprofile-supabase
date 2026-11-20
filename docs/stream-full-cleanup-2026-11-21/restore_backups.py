import json,hashlib,sys
from pathlib import Path
root=Path(__file__).resolve().parent
output=Path(sys.argv[1] if len(sys.argv)>1 else root/'restored');output.mkdir(exist_ok=True)
manifest=json.loads((root/'manifest.json').read_text())
for item in manifest['files']:
 target=output/item['filename']
 if target.exists(): raise RuntimeError('Refuse to overwrite '+str(target))
 digest=hashlib.sha256();size=0
 with target.open('xb') as dst:
  for part in item['parts']:
   source=root/part['filename'];part_digest=hashlib.sha256();part_size=0
   with source.open('rb') as src:
    for chunk in iter(lambda:src.read(4*1024*1024),b''):
     part_digest.update(chunk);digest.update(chunk);dst.write(chunk);part_size+=len(chunk);size+=len(chunk)
   if part_size!=part['bytes'] or part_digest.hexdigest()!=part['sha256']: raise RuntimeError('Part verification failed: '+source.name)
 if size!=item['bytes'] or digest.hexdigest()!=item['sha256']: raise RuntimeError('Full file verification failed')
 print('Verified restored:',target.name,size,digest.hexdigest())
