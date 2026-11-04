from pathlib import Path
import subprocess,json,hashlib,time,shutil
start=time.perf_counter();root=Path('.').resolve();out=root/'.frameweave/pa3-text-close';core=out/'sdk';core.mkdir(parents=True,exist_ok=True)
commit=subprocess.check_output(['git','rev-parse','HEAD']).decode().strip();rows=[]
for line in subprocess.check_output(['git','ls-tree','-rl',commit]).decode('utf8').splitlines():
 h,n=line.split('\t',1);mode,kind,oid,size=h.split();parts=n.split('/')
 if kind=='blob' and (n in ['package.json','package-lock.json','tsconfig.json','LICENSE'] or parts[0] in ['src','licenses','tools'] or n.startswith('plugins/builtin/') or parts[0]=='modules' and not any(p in ['tests','validation','node_modules','target'] for p in parts)):rows.append((n,oid,int(size)))
p=subprocess.Popen(['git','cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
for name,oid,size in rows:
 p.stdin.write((oid+'\n').encode());p.stdin.flush();h=p.stdout.readline().decode().split();assert h==[oid,'blob',str(size)];data=p.stdout.read(size);assert p.stdout.read(1)==b'\n';f=core/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data)
p.stdin.close();assert p.wait()==0
fix='992fe3408843b25e6cedeef1a82cd3b0a9ee1310';fixed=['modules/spidermonkey-host/runtime.ts','modules/spidermonkey-host/text-decoder.ts','modules/spidermonkey-host/codec.ts','modules/spidermonkey-host/src/engine.rs']
for name in fixed:
 f=core/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(subprocess.check_output(['git','show',fix+':'+name]))
# Candidate effect files only. No Core mutation or cross-worktree dependency/cache link.
for f in (root/'modules/pro-animation/src').rglob('*'):
 if f.is_file(): dest=core/f.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(f.read_bytes())
delivery=root.parent.parent/'frameweave-engine/outputs/main-deliveries/text-decoder-992fe340';assert delivery.exists(),delivery
bin=out/'host';bin.mkdir(exist_ok=True)
for name in ['frameweave-spidermonkey-host.exe','spidermonkey-build.json','receipt.json']:shutil.copyfile(delivery/name,bin/name)
assert hashlib.sha256((bin/'frameweave-spidermonkey-host.exe').read_bytes()).hexdigest()=='d433cdc21f0b05f4b8c8552a30c6f306ead096ceb987f6873f29c441f41bcc23'
receipt={'ownBase':commit,'coreFix':fix,'coreFiles':fixed,'isolatedSnapshot':str(core),'sdkReleased':False,'candidateFiles':[{'path':str(f.relative_to(root)).replace('\\','/'),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in (root/'modules/pro-animation/src').rglob('*') if f.is_file()],'seconds':time.perf_counter()-start};(out/'source.json').write_text(json.dumps(receipt,indent=2),encoding='utf8');print(json.dumps({'ok':True,'seconds':receipt['seconds']}))
