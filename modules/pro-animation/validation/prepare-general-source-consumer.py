from pathlib import Path
import subprocess,json,hashlib,time,shutil
start=time.perf_counter();root=Path('.').resolve();out=root/'.frameweave/pa3-upstream';core=out/'core-general-f36';core.mkdir(parents=True,exist_ok=True);commit='f36feba48db87f6b6e02c23766542c42f115dd9e';rows=[]
for line in subprocess.check_output(['git','ls-tree','-rl',commit]).decode('utf8').splitlines():
 h,n=line.split('\t',1);mode,kind,oid,size=h.split();parts=n.split('/')
 if kind=='blob' and (n in ['package.json','package-lock.json','tsconfig.json','LICENSE'] or parts[0] in ['src','licenses','tools'] or n.startswith('plugins/builtin/') or parts[0]=='modules' and not any(p in ['tests','validation','node_modules','target'] for p in parts)):rows.append((n,oid,int(size)))
p=subprocess.Popen(['git','cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
for name,oid,size in rows:
 p.stdin.write((oid+'\n').encode());p.stdin.flush();h=p.stdout.readline().decode().split();assert h==[oid,'blob',str(size)];data=p.stdout.read(size);assert p.stdout.read(1)==b'\n';f=core/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data)
p.stdin.close();assert p.wait()==0
fix='992fe3408843b25e6cedeef1a82cd3b0a9ee1310'
for name in ['modules/spidermonkey-host/runtime.ts','modules/spidermonkey-host/text-decoder.ts','modules/spidermonkey-host/codec.ts','modules/spidermonkey-host/src/engine.rs']:
 f=core/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(subprocess.check_output(['git','show',fix+':'+name]))
for f in (root/'modules/pro-animation/src').rglob('*'):
 if f.is_file():dest=core/f.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(f.read_bytes())
# Read only the exact frozen binary named by the delivered receipt; never execute a live other-worktree cache.
receipt=json.loads(subprocess.check_output(['git','show','af025b70ea1ee613e3d68b35e9bd24fd0765f258:modules/native-gpu/validation/temporal-upstream/evidence/native-build.json']));binary=Path(receipt['executable']['file']);sha=receipt['executable']['sha256'];assert sha=='77e3aedac6bcdef26836fa5d476f7e66149cf38d7fd638cddc2f55378efe95d5';assert hashlib.sha256(binary.read_bytes()).hexdigest()==sha,'Exact frozen binary unavailable; do not mix versions'
for name,digest in receipt['inputHashes'].items():assert hashlib.sha256((core/'modules/native-gpu'/name).read_bytes()).hexdigest()==digest,name
local=out/'native-f36';local.mkdir(exist_ok=True);shutil.copyfile(binary,local/binary.name);(local/'native-build.json').write_bytes((json.dumps(receipt,indent=2)+'\n').encode())
record={'coreCommit':commit,'coreEvidence':'7f4239815706095b0f5b2cd2dee645472180292d','supplement':'af025b70ea1ee613e3d68b35e9bd24fd0765f258','decoderFix':fix,'ownSourceBase':subprocess.check_output(['git','rev-parse','HEAD']).decode().strip(),'nativeBinarySha256':sha,'allNativeReceiptInputsMatch':True,'candidatePaSource':'Only own current modules/pro-animation/src copied; no Core modifications or released pin changes','isolatedSdk':str(core),'seconds':time.perf_counter()-start};(out/'general-source-receipt.json').write_bytes((json.dumps(record,indent=2)+'\n').encode());print(json.dumps(record))
