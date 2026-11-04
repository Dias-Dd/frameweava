# SPDX-License-Identifier: Apache-2.0
# Original genuine OpenType fixture: Tr cmap characters, vertical metrics, deliberately no GSUB.
from pathlib import Path
import json,hashlib,fontTools
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
out=Path('.frameweave/pa4-vertical/fixtures');out.mkdir(parents=True,exist_ok=True)
order=['.notdef','left','right','a','space'];fb=FontBuilder(1000,isTTF=True)
fb.setupGlyphOrder(order);fb.setupCharacterMap({0x3008:'left',0x3009:'right',65:'a',32:'space'})
glyphs={}
for name in order:
 p=TTGlyphPen(None)
 if name!='space':
  p.moveTo((0,0));p.lineTo((500,0));p.lineTo((250,700));p.closePath()
 glyphs[name]=p.glyph()
fb.setupGlyf(glyphs);fb.setupHorizontalMetrics({n:(600,0) for n in order});fb.setupHorizontalHeader(ascent=800,descent=-200)
fb.setupVerticalMetrics({n:(1000,100) for n in order});fb.setupVerticalHeader(ascent=500,descent=-500)
fb.setupNameTable({'familyName':'Frameweave Original Vertical Fallback','styleName':'Regular','uniqueFontIdentifier':'Frameweave.Vertical.NoGSUB.1','fullName':'Frameweave Original Vertical Fallback','psName':'FrameweaveVerticalFallback'})
fb.setupOS2(sTypoAscender=800,sTypoDescender=-200,usWinAscent=800,usWinDescent=200);fb.setupPost();fb.setupMaxp();fb.font['head'].created=fb.font['head'].modified=3406620153
file=out/'no-vertical-gsub.ttf';fb.save(file)
print(json.dumps({'source':'original authored geometry, no production-font claim','fontTools':fontTools.__version__,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}))
