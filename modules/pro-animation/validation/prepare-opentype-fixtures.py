# SPDX-License-Identifier: Apache-2.0
# Original synthetic fonts test binary edge cases; real Noto fonts remain the rendering evidence.
from pathlib import Path
import json,hashlib,time
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables as ot
from fontTools.varLib.builder import buildVarRegionList,buildVarData,buildVarStore
from fontTools.varLib.models import normalizeValue
root=Path('.frameweave/pa3-opentype/fixtures');root.mkdir(parents=True,exist_ok=True)
t=time.perf_counter()
order=['.notdef','A','V','f','i','fi','ficomp','acute','component']
fb=FontBuilder(1000,isTTF=True);fb.setupGlyphOrder(order);fb.setupCharacterMap({65:'A',86:'V',102:'f',105:'i',0x301:'acute',0xe000:'ficomp'})
glyphs={}
for name in order:
 pen=TTGlyphPen(glyphs)
 if name=='ficomp':pen.addComponent('fi',(1,0,0,1,50,0))
 else:
  for x in [0,300]:
   pen.moveTo((x,0));pen.lineTo((x+100,0));pen.lineTo((x+100,600));pen.lineTo((x,600));pen.closePath()
 glyphs[name]=pen.glyph()
fb.setupGlyf(glyphs);fb.setupHorizontalMetrics({n:(600,0 if n!='ficomp' else 50) for n in order});fb.setupHorizontalHeader(ascent=800,descent=-200)
fb.setupNameTable({'familyName':'Frameweave Original OpenType Test','styleName':'Regular','uniqueFontIdentifier':'Frameweave.OpenType.1','fullName':'Frameweave Original OpenType Test','psName':'FrameweaveOpenTypeTest'});fb.setupOS2(sTypoAscender=800,sTypoDescender=-200,usWinAscent=800,usWinDescent=200);fb.setupPost();fb.setupMaxp()
addOpenTypeFeaturesFromString(fb.font,"""languagesystem DFLT dflt; languagesystem latn dflt; table GDEF {GlyphClassDef [A V f i], [fi ficomp], [acute], [component]; Attach fi 0 4; LigatureCaretByPos fi 200 400; LigatureCaretByIndex ficomp 4;} GDEF; feature liga {sub f i by fi;} liga; feature kern {pos A V -80;} kern;""")
g=fb.font['GDEF'].table;g.MarkAttachClassDef=ot.ClassDef();g.MarkAttachClassDef.classDefs={'acute':2};l=g.LigCaretList.LigGlyph[g.LigCaretList.Coverage.glyphs.index('fi')]
def cv(fmt,coordinate=None,index=None,device=None):
 c=ot.CaretValue();c.Format=fmt
 if fmt==2:c.CaretValuePoint=index
 else:c.Coordinate=coordinate
 if fmt==3:c.DeviceTable=device
 return c
d=ot.Device();d.StartSize=16;d.EndSize=16;d.DeltaFormat=1;d.DeltaValue=[1]
l.CaretValue=[cv(1,200),cv(2,index=4),cv(3,260,device=d)];l.CaretCount=3
fb.font['head'].created=fb.font['head'].modified=3406620153
fb.save(root/'static.ttf')
# Real IVS evaluator fixture; no gvar required because outline geometry is intentionally static.
fb.setupFvar([('wght',100,400,900,'Weight')],[]);g.Version=0x00010003;g.VarStore=buildVarStore(buildVarRegionList([{'wght':(0,1,1)}],['wght']),[buildVarData([0],[[20]],optimize=False)])
v=ot.Device();v.StartSize=0;v.EndSize=0;v.DeltaFormat=0x8000;l.CaretValue=[cv(3,250,device=v)];l.CaretCount=1;fb.save(root/'variable.ttf')
# Invalid contour point is not silently replaced by 0 or an equal-width caret.
f=TTFont(root/'static.ttf');g=f['GDEF'].table;g.LigCaretList.LigGlyph[0].CaretValue=[cv(2,index=65535)];g.LigCaretList.LigGlyph[0].CaretCount=1;f.save(root/'invalid-point.ttf')
f=TTFont(root/'static.ttf');del f['GDEF'];f.save(root/'no-gdef.ttf')
f=TTFont(root/'static.ttf');req=f['GSUB'].table.ScriptList.ScriptRecord[0].Script.DefaultLangSys;req.ReqFeatureIndex=0;req.FeatureIndex=[];req.FeatureCount=0;f.save(root/'required.ttf')
refs=[]
for source in json.loads(Path('modules/pro-animation/validation/bidi-scene/font-sources.json').read_text(encoding='utf-8')):
 path=Path('modules/pro-animation/validation/bidi-scene')/source['asset'];data=path.read_bytes();assert hashlib.sha256(data).hexdigest()==source['font']['sha256'];font=TTFont(path);g=font['GDEF'].table if 'GDEF' in font else None
 refs.append({'id':source['id'],'glyphs':[{'glyphId':font.getGlyphID(name),'name':name,'class':g.GlyphClassDef.classDefs.get(name,0) if g and g.GlyphClassDef else 0,'carets':[{'format':c.Format,'coordinate':getattr(c,'Coordinate',None)} for c in lig.CaretValue]} for name,lig in zip(g.LigCaretList.Coverage.glyphs,g.LigCaretList.LigGlyph)] if g and g.LigCaretList else [],'tables':{tag:{'features':[{'index':i,'tag':r.FeatureTag,'lookups':r.Feature.LookupListIndex} for i,r in enumerate(font[tag].table.FeatureList.FeatureRecord)],'scripts':[r.ScriptTag for r in font[tag].table.ScriptList.ScriptRecord]} for tag in ['GSUB','GPOS'] if tag in font}})
proof={'seconds':time.perf_counter()-t,'fontTools':'4.68.0','realFonts':refs,'syntheticFonts':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.glob('*.ttf'))},'scope':'Original generated test glyphs cover GDEF1/2/3, device, variable, composite, missing/invalid cases. Rendering uses the original real Noto fonts.'}
(root/'reference.json').write_text(json.dumps(proof,indent=2),encoding='utf-8');print(json.dumps({'ok':True,'seconds':proof['seconds'],'fixtures':len(proof['syntheticFonts'])}))
