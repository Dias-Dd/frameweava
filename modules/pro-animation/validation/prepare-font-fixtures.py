# SPDX-License-Identifier: Apache-2.0
# Original small OpenType fonts exercise actual COLR table traversal. Not substituted Noto text evidence.
from pathlib import Path
import json, hashlib
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.colorLib.builder import buildCOLR, buildCPAL
from fontTools.ttLib.tables.otTables import PaintFormat as P, CompositeMode as C, ExtendMode as E
root=Path('.frameweave/pa4-font/fixtures');root.mkdir(parents=True,exist_ok=True)
order=['.notdef','space','color','left','right','triangle','linear','radial','sweep']
fb=FontBuilder(1000,isTTF=True);fb.setupGlyphOrder(order);fb.setupCharacterMap({32:'space',65:'color',66:'linear',67:'radial',68:'sweep'})
glyphs={}
for name in order:
 pen=TTGlyphPen(None)
 if name not in ['space','color','linear','radial','sweep']:
  x=0 if name!='right' else 300
  points=[(x,0),(x+400,0),(x+400,700),(x,700)] if name!='triangle' else [(50,0),(650,0),(350,700)]
  pen.moveTo(points[0])
  for point in points[1:]:pen.lineTo(point)
  pen.closePath()
 glyphs[name]=pen.glyph()
fb.setupGlyf(glyphs);fb.setupHorizontalMetrics({n:(800,0) for n in order});fb.setupHorizontalHeader(ascent=800,descent=-200)
fb.setupNameTable({'familyName':'Frameweave Original Color Fixture','styleName':'Regular','uniqueFontIdentifier':'Frameweave.ColorFixture.1','fullName':'Frameweave Original Color Fixture','psName':'FrameweaveColorFixture'})
fb.setupOS2(sTypoAscender=800,sTypoDescender=-200,usWinAscent=800,usWinDescent=200);fb.setupPost();fb.setupMaxp();fb.font['head'].created=fb.font['head'].modified=3406620153
fb.font['CPAL']=buildCPAL([[(1.,0.,0.,1.),(0.,0.,1.,.5)],[(0.,1.,0.,1.),(1.,1.,0.,1.)]])
fb.font['COLR']=buildCOLR({'color':[('left',0),('right',1)]},version=0,glyphMap=fb.font.getReverseGlyphMap());fb.save(root/'colrv0.ttf')
line={'Extend':E.PAD,'ColorStop':[{'StopOffset':0.,'PaletteIndex':0,'Alpha':1.},{'StopOffset':1.,'PaletteIndex':1,'Alpha':.5}]}
def clip(brush):return {'Format':P.PaintGlyph,'Glyph':'triangle','Paint':brush}
linear=clip({'Format':P.PaintLinearGradient,'ColorLine':line,'x0':0,'y0':0,'x1':700,'y1':0,'x2':0,'y2':700})
radial=clip({'Format':P.PaintRadialGradient,'ColorLine':line,'x0':100,'y0':100,'r0':0,'x1':400,'y1':400,'r1':500})
sweep=clip({'Format':P.PaintSweepGradient,'ColorLine':line,'centerX':350,'centerY':350,'startAngle':0.,'endAngle':180.})
solid=clip({'Format':P.PaintSolid,'PaletteIndex':0xffff,'Alpha':.75})
fb.font['COLR']=buildCOLR({'color':{'Format':P.PaintComposite,'SourcePaint':solid,'CompositeMode':C.SRC_OVER,'BackdropPaint':linear},'linear':linear,'radial':radial,'sweep':sweep},version=1,glyphMap=fb.font.getReverseGlyphMap(),clipBoxes={n:(0,0,800,800) for n in ['color','linear','radial','sweep']});fb.save(root/'colrv1.ttf')
from fontTools.ttLib import TTFont
f=TTFont(root/'colrv0.ttf',recalcTimestamp=False);f['hmtx'].metrics['right']=(800,300);f['hmtx'].metrics['triangle']=(800,50);f['COLR']=buildCOLR({'color':[('left',0),('right',1)],'linear':[('triangle',0xffff)]},version=0,glyphMap=f.getReverseGlyphMap());f.save(root/'colrv0-foreground.ttf')
# Real embedded PNG/SVG font formats; original reproducible artwork and bytes.
import struct,zlib
from fontTools.ttLib import newTable,TTFont
from fontTools.ttLib.tables.sbixStrike import Strike
from fontTools.ttLib.tables.sbixGlyph import Glyph
from fontTools.ttLib.tables.S_V_G_ import SVGDocument
chunk=lambda tag,data:struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',8,6,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+bytes([220,40,90,255])*8 for y in range(6))))+chunk(b'IEND',b'')
(root/'embedded.png').write_bytes(png)
f=TTFont(root/'colrv0.ttf',recalcTimestamp=False);del f['COLR'];del f['CPAL'];sbix=newTable('sbix');sbix.version=1;sbix.flags=1;sbix.strikes={}
for ppem in [16,32]:
 strike=Strike(ppem=ppem,resolution=72);strike.glyphs={'color':Glyph(glyphName='color',originOffsetX=2,originOffsetY=-1,graphicType='png ',imageData=png)};sbix.strikes[ppem]=strike
f['sbix']=sbix;f.save(root/'sbix.ttf')
svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -800 1000 1000"><defs><linearGradient id="ink"><stop stop-color="#dd2255"/><stop offset="1" stop-color="#2299ee"/></linearGradient></defs><g id="glyph2"><path d="M0 -700H600V0H0Z" fill="url(#ink)"/></g><g id="glyph6"><circle cx="400" cy="-350" r="300" fill="#33bb66"/></g></svg>'
f=TTFont(root/'colrv0.ttf',recalcTimestamp=False);del f['COLR'];del f['CPAL'];f['SVG ']=newTable('SVG ');f['SVG '].docList=[SVGDocument(svg,2,2,False),SVGDocument(svg,6,6,False)];f.save(root/'svg.ttf');f['SVG '].docList=[SVGDocument(svg,2,2,True),SVGDocument(svg,6,6,True)];f.save(root/'svg-gzip.ttf');(root/'embedded.svg').write_text(svg,encoding='utf8')
proof={'fontTools':'4.68.0','origin':'original authored test contours/paint recipes, Apache-2.0; no third-party glyph artwork','fixtures':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.glob('*.ttf')}}
(root/'reference.json').write_text(json.dumps(proof,indent=2),encoding='utf8');print(json.dumps(proof))
