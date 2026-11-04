# SPDX-License-Identifier: Apache-2.0
"""C HarfBuzz15 per-run shape/positions + independent original UTF16/control remapping.
Run order is the itemizer's separately conformance-tested UAX9 result, not a C layout oracle.
"""
import hashlib, json, time, struct
from pathlib import Path
import uharfbuzz as hb
base=Path('.frameweave/pa3-bidi'); started=time.perf_counter()
assert hb.version_string()=='15.0.0', hb.version_string()
data=json.loads((base/'bidi-oracle-input.json').read_text(encoding='utf-8')); assert data['positionBudgetPx']==1e-8 and data['outlineBudgetFontUnits']==1e-4
sources=json.loads(Path('modules/pro-animation/validation/bidi-scene/font-sources.json').read_text(encoding='utf-8'))
fonts={}
for s in sources:
    raw=(Path('modules/pro-animation/validation/bidi-scene')/s['asset']).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==s['font']['sha256']
    face=hb.Face(raw); font=hb.Font(face); hb.ot_font_set_funcs(font); font.scale=(face.upem,face.upem); fonts[s['id']]=(font,face.upem)
prop=(base/'upstream/unicode16/PropList.txt').read_bytes(); assert hashlib.sha256(prop).hexdigest()=='53d614508e2a0b2305a8aa21cd60d993de9326cdf65993660dfcce4503548583'
controls=set()
for row in prop.decode().splitlines():
    fields=row.split('#')[0].split(';')
    if len(fields)!=2 or fields[1].strip()!='Bidi_Control':continue
    a=fields[0].strip().split('..'); controls.update(range(int(a[0],16),int(a[-1],16)+1))
assert len(controls)==12
def offsets(text):
    n=0; result=[]
    for ch in text:result.append(n); n+=len(ch.encode('utf-16-le'))//2
    return result
def utf16_slice(s,start,end):return s.encode('utf-16-le')[start*2:end*2].decode('utf-16-le')
def canonical(commands):
    result=[]; start=None
    for i,row in enumerate(commands):
        if row[0]==1:start=row[1:]
        if row[0]==2 and i+1<len(commands) and commands[i+1][0]==5 and row[1:]==start:continue
        result.extend(row)
    return result
def c_outline(font,gid):
    commands=[]; draw=hb.DrawFuncs()
    draw.set_move_to_func(lambda x,y,s:s.append([1,x,y])); draw.set_line_to_func(lambda x,y,s:s.append([2,x,y]))
    draw.set_quadratic_to_func(lambda cx,cy,x,y,s:s.append([3,cx,cy,x,y])); draw.set_cubic_to_func(lambda a,b,c,d,x,y,s:s.append([4,a,b,c,d,x,y])); draw.set_close_path_func(lambda s:s.append([5]))
    font.draw_glyph(gid,draw,commands); return [struct.unpack('f',struct.pack('f',n))[0] for n in canonical(commands)]
def local_outline(path,x,y,scale):
    commands=[]
    for c in path['commands']:
        if c['op']=='Z':commands.append([5]);continue
        keys={'M':['point'],'L':['point'],'Q':['control','point'],'C':['control1','control2','point']}[c['op']]; row=[{'M':1,'L':2,'Q':3,'C':4}[c['op']]]
        for k in keys:row.extend([(c[k]['x']-x)/scale,-(c[k]['y']-y)/scale])
        commands.append(row)
    return canonical(commands)
rows=[]; failures=[]; maximum=0; glyph_count=0; max_outline=0; outline_scalars=0; outline_cache={}
for case in data['cases']:
    try:
        line=case['line']; options=case['options']; text=line['layout']['text']; pending=[]; advance=0
        for run in line['runs']:
            original=utf16_slice(text,run['item']['start'],run['item']['end']); mapping=[]; clean=''
            for ch,start in zip(original,offsets(original)):
                if ord(ch) in controls:continue
                clean+=ch; mapping.extend(run['item']['start']+start+k for k in range(len(ch.encode('utf-16-le'))//2))
            assert clean==run['text'] and mapping==run['sourceUnits']
            source=next(f['source']['resourceId'] for f in line['layout']['fonts'] if f['id']==run['fontId']); font,upem=fonts[source]; b=hb.Buffer(); b.add_codepoints([ord(ch) for ch in clean]); b.direction=run['item']['direction']; b.script=run['script']; b.language=options['language']; hb.shape(font,b,options['features'])
            infos=b.glyph_infos; positions=b.glyph_positions; scale=options['fontSize']/upem; part_advance=sum(p.x_advance for p in positions)*scale; pending.append((run,mapping,clean,infos,positions,scale)); advance+=part_advance
        direction=line['analysis']['paragraphs'][0]['direction']; align=options['align']; align=('right' if direction=='rtl' else 'left') if align=='start' else align; pen=options['x']+((options['width']-advance)/2 if align=='center' else options['width']-advance if align=='right' else 0)
        case_max=abs(advance-line['advance']); glyphs=0; case_outline=0; scalars=0
        for run,mapping,clean,infos,positions,scale in pending:
            cp=offsets(clean); starts=sorted(set(cp[i.cluster] for i in infos)); ends={a:(starts[j+1] if j+1<len(starts) else len(clean.encode('utf-16-le'))//2) for j,a in enumerate(starts)}; py=options['baseline']; assert len(infos)==len(run['globalGlyphIndices'])
            for local,(info,p) in enumerate(zip(infos,positions)):
                actual=line['layout']['glyphs'][run['globalGlyphIndices'][local]]; a=cp[info.cluster]; e=ends[a]
                assert actual['glyphId']==info.codepoint
                assert actual['cluster']=={'start':mapping[a],'end':mapping[e-1]+1}
                source=next(f['source']['resourceId'] for f in line['layout']['fonts'] if f['id']==run['fontId']); font,_=fonts[source]; outline_key=(source,info.codepoint)
                if outline_key not in outline_cache:outline_cache[outline_key]=c_outline(font,info.codepoint)
                expected_path=outline_cache[outline_key]; actual_path=next((p['path'] for p in line['glyphPaths'] if p['glyphIndex']==run['globalGlyphIndices'][local]),None)
                if not expected_path:assert actual_path is None
                else:
                    assert actual_path is not None
                    local_path=local_outline(actual_path,actual['x'],actual['y'],scale); assert len(local_path)==len(expected_path), (case['index'],info.codepoint,'outline topology')
                    for av,ev in zip(local_path,expected_path):case_outline=max(case_outline,abs(av-ev)); scalars+=1
                for value,want in [(actual['x'],pen+p.x_offset*scale),(actual['y'],py-p.y_offset*scale),(actual['advanceX'],p.x_advance*scale),(actual['advanceY'],-p.y_advance*scale)]:case_max=max(case_max,abs(value-want))
                pen+=p.x_advance*scale; py-=p.y_advance*scale; glyphs+=1
        assert glyphs==len(line['layout']['glyphs']); assert case_max<=data['positionBudgetPx'], case_max
        assert case_outline<=data['outlineBudgetFontUnits'], case_outline
        maximum=max(maximum,case_max); max_outline=max(max_outline,case_outline); outline_scalars+=scalars; glyph_count+=glyphs; rows.append({'index':case['index'],'glyphs':glyphs,'maxPositionErrorPx':case_max,'maxOutlineErrorFontUnits':case_outline,'outlineScalars':scalars,'passed':True})
    except Exception as error:failures.append({'index':case['index'],'error':repr(error)})
report={'reference':'original C HarfBuzz '+hb.version_string(),'uharfbuzz':hb.__version__,'cases':len(data['cases']),'passed':len(rows),'failed':len(failures),'glyphs':glyph_count,'maxPositionErrorPx':maximum,'positionBudgetPx':data['positionBudgetPx'],'maxOutlineErrorFontUnits':max_outline,'outlineScalars':outline_scalars,'outlineBudgetFontUnits':data['outlineBudgetFontUnits'],'rows':rows,'failures':failures,'ms':(time.perf_counter()-started)*1000,'scope':'Per-run shaping, glyph IDs/UTF16 original clusters, positioning and align; unhinted default-instance translated outlines, canonical explicit closing-line equivalence. UAX9 run order independently verified against official corpus, not a second C paragraph layout engine. No variable-axis precision certification.'}
(base/'bidi-c-reference.json').write_text(json.dumps(report,indent=2),encoding='utf-8'); print(json.dumps(report)); assert not failures
