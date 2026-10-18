"""Check release metadata, exact runtime allowlist, source parity and privacy boundaries."""
import hashlib,json,re,zipfile
from build_release import ROOT,FILES
m=json.loads((ROOT/'module.json').read_text(encoding='utf-8'))
p=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
assert m['id']==p['name'] and m['version']==p['version']
assert m['manifest']==m['url']+'/releases/latest/download/module.json'
assert m['download']==m['url']+'/releases/download/v'+m['version']+'/module.zip'
assert m['socket'] is True and m['license']=='LICENSE' and 'packs' not in m
assert m['compatibility']['verified']=='14.369'
out=ROOT/'dist'
assert (out/'module.json').read_bytes()==(ROOT/'module.json').read_bytes()
with zipfile.ZipFile(out/'module.zip') as z:
 assert sorted(z.namelist())==sorted(FILES) and z.testzip() is None
 for name in FILES:
  assert z.read(name)==(ROOT/name).read_bytes(),name
  assert not re.search(r'C:[/\\]codex|\.cloudapp\.azure\.com|/data/maintenance|FOUNDRY_ADMIN_KEY|session=|Hwayeon|Creed',z.read(name).decode('utf-8')),name
for line in (out/'SHA256SUMS').read_text().splitlines():
 digest,name=line.split('  ',1)
 assert digest==hashlib.sha256((out/name).read_bytes()).hexdigest()
assert (out/'RELEASE_NOTES.md').read_text().strip()
print('Manifest, archive allowlist, source parity, privacy boundaries and checksums verified.')
