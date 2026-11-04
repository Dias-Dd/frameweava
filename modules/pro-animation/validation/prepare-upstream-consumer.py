# SPDX-License-Identifier: Apache-2.0
# Exact read-only Git blob snapshot in THIS worktree, not a Git worktree/sync/patch.
from pathlib import Path
import subprocess,json,hashlib,time,os
commit='c7685c25a0d843a65566388ea8e055853fac8cfc';evidence='7ad93fd90836da47cb3fd41fa9194bffb6a5a62c'
root=Path('.frameweave/pa3-upstream').resolve();core=root/'core-c7685';core.mkdir(parents=True,exist_ok=True)
t=time.perf_counter();rows=[]
listing=subprocess.check_output(['git','ls-tree','-rl',commit]).decode('utf-8')
for line in listing.splitlines():
 header,name=line.split('\t',1);mode,kind,oid,size=header.split();parts=name.split('/')
 if kind!='blob' or mode!='100644' and mode!='100755':continue
 include=name in ['package.json','package-lock.json','tsconfig.json','LICENSE'] or parts[0] in ['src','licenses','tools'] or name.startswith('plugins/builtin/') or parts[0]=='modules' and not any(p in ['tests','validation','node_modules','target'] for p in parts)
 if include:rows.append((name,oid,int(size)))
proc=subprocess.Popen(['git','cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE);records=[]
try:
 for name,oid,size in rows:
  proc.stdin.write((oid+'\n').encode());proc.stdin.flush();head=proc.stdout.readline().decode().split();assert head==[oid,'blob',str(size)]
  data=proc.stdout.read(size);assert len(data)==size and proc.stdout.read(1)==b'\n';path=(core/name).resolve();assert path.is_relative_to(core) and path!=core;path.parent.mkdir(parents=True,exist_ok=True)
  if path.exists():assert path.is_file() and path.read_bytes()==data,'Changed frozen consumer source: '+name
  else:path.write_bytes(data)
  records.append({'path':name,'gitBlob':oid,'bytes':size,'sha256':hashlib.sha256(data).hexdigest()})
finally:proc.stdin.close();assert proc.wait()==0
receipt={'version':1,'sourceCommit':commit,'ownerEvidenceCommit':evidence,'exactParent':'9637cc42af3ef6f17806e345475d34c0ea871d15','files':records,'seconds':time.perf_counter()-t,'core':str(core),'scope':'Exact original src/plugins/builtin/runtime-module source snapshot; tests/validation excluded just as runtime pin excludes them. Own source remains on agents/agent-2. No other worktree touched, no branch/history sync, no source overlay or lock/trust refresh. Candidate Core is not Main released SDK.'}
(root/'consumer-source.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print(json.dumps({'ok':True,'files':len(records),'bytes':sum(r['bytes'] for r in records),'seconds':receipt['seconds']}))
