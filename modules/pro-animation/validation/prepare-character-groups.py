# SPDX-License-Identifier: Apache-2.0
# Derived lookup only; original UCD16 data and Unicode License V3 stay byte-identical in vendor.
from pathlib import Path
import bisect,json,hashlib
root=Path('modules/pro-animation');source=root/'vendor/unicode-16';blocks=[]
for line in (source/'Blocks.txt').read_text(encoding='utf8').splitlines():
 line=line.split('#')[0].strip()
 if not line:continue
 interval,name=line.split(';');lo,hi=interval.strip().split('..');blocks.append((int(lo,16),int(hi,16),name.strip()))
starts=[b[0] for b in blocks];rows=[];pending=None
for line in (source/'UnicodeData.txt').read_text(encoding='utf8').splitlines():
 f=line.split(';');cp=int(f[0],16);name=f[1];gc=f[2]
 if name.endswith(', First>'):pending=(cp,gc);continue
 if name.endswith(', Last>'):
  assert pending and pending[1]==gc;lo=pending[0];pending=None
 else:lo=cp
 rows.append((lo,cp,gc))
groups=[];keys={};digit_run={}
for lo,hi,gc in rows:
 if gc[0] in 'CMZ':continue
 bucket='upper' if gc=='Lu' else 'lower' if gc=='Ll' else 'title' if gc=='Lt' else 'letter' if gc[0]=='L' else 'digit' if gc=='Nd' else 'number' if gc[0]=='N' else 'symbol' if gc[0] in 'PS' else None
 if not bucket:continue
 while lo<=hi:
  bi=bisect.bisect_right(starts,lo)-1;assert bi>=0;blo,bhi,block=blocks[bi];end=min(hi,bhi);assert lo>=blo and lo<=bhi
  # Decimal digit sets are complete contiguous sets of ten; separate adjacent mathematical styles too.
  if bucket=='digit':
   key=(block,bucket,lo);assert end-lo+1==1 or (end-lo+1)%10==0
   if end-lo+1==1:
    last=digit_run.get(block)
    if last and last[1]+1==lo and last[2]<10:key=last[0];digit_run[block]=(key,lo,last[2]+1)
    else:digit_run[block]=(key,lo,1)
   else:end=lo+9
  else:key=(block,bucket)
  index=keys.get(key)
  if index is None:index=len(groups);keys[key]=index;groups.append({'block':block,'kind':bucket,'ranges':[],'count':0})
  g=groups[index];r=g['ranges']
  if r and r[-1][1]+1==lo:r[-1][1]=end
  else:r.append([lo,end,g['count']])
  g['count']+=end-lo+1;lo=end+1
intervals=[]
for index,g in enumerate(groups):
 assert g['count']>0
 if g['kind']=='digit':assert g['count']==10,(g['block'],g['count'])
 for lo,hi,rank in g['ranges']:intervals.append([lo,hi,index,rank])
intervals.sort();assert all(a[1]<b[0] for a,b in zip(intervals,intervals[1:]))
p=root/'src/text-controls/character-data.ts'
text='// Generated from original Unicode16 UCD; see vendor/unicode-16/LICENSE and provenance/text-controls.\nexport const characterGroupUnicode = "16.0.0";\n'
text+='export const characterGroups: readonly {readonly block:string;readonly kind:string;readonly count:number;readonly ranges:readonly (readonly number[])[]}[] = '+json.dumps(groups,separators=(',',':'))+';\n'
text+='export const characterIntervals: readonly (readonly number[])[] = '+json.dumps(intervals,separators=(',',':'))+';\n'
p.write_bytes(text.encode('utf8'))
print(json.dumps({'groups':len(groups),'intervals':len(intervals),'sourceScalars':sum(g['count'] for g in groups),'generatedBytes':p.stat().st_size,'generatedSha256':hashlib.sha256(p.read_bytes()).hexdigest()}))
