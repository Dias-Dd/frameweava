# SPDX-License-Identifier: Apache-2.0
# Authored OpenType fixtures, real CBLC/CBDT and EBLC/EBDT tables via installed fontTools.
# Uses the existing original fixture outlines and PNG, no third-party glyph artwork.
from pathlib import Path
import hashlib,json
from fontTools.ttLib import TTFont,newTable
from fontTools.ttLib.tables.E_B_L_C_ import Strike,SbitLineMetrics,eblc_index_sub_table_1
from fontTools.ttLib.tables.C_B_D_T_ import cbdt_bitmap_format_17
from fontTools.ttLib.tables.E_B_D_T_ import ebdt_bitmap_format_1
from fontTools.ttLib.tables.BitmapGlyphMetrics import SmallGlyphMetrics
out=Path('.frameweave/pa4-vertical-final/fixtures');out.mkdir(parents=True,exist_ok=True)
original=Path('docs/pro-animation/font-embedded-validation/fixtures/sbix.ttf')
font=TTFont(original,recalcTimestamp=False)
png=font['sbix'].strikes[32].glyphs['color'].imageData
for kind,dataTag,locationTag,version,formatId,depth in [('cbdt','CBDT','CBLC',3.0,17,32),('ebdt','EBDT','EBLC',2.0,1,8)]:
    f=TTFont(original,recalcTimestamp=False);del f['sbix']
    data=newTable(dataTag);data.version=version
    location=newTable(locationTag);location.version=version
    strike=Strike();size=strike.bitmapSizeTable
    size.colorRef=0;size.ppemX=32;size.ppemY=32;size.bitDepth=depth;size.flags=1
    for axis in ['hori','vert']:
        metrics=SbitLineMetrics()
        for name in ['ascender','descender','widthMax','caretSlopeNumerator','caretSlopeDenominator','caretOffset','minOriginSB','minAdvanceSB','maxBeforeBL','minAfterBL','pad1','pad2']:setattr(metrics,name,0)
        metrics.ascender=8;metrics.descender=-2;metrics.widthMax=9;setattr(size,axis,metrics)
    index=eblc_index_sub_table_1(None,None);index.indexFormat=1;index.imageFormat=formatId;index.imageDataOffset=0;index.names=['color'];strike.indexSubTables=[index]
    glyph=(cbdt_bitmap_format_17 if kind=='cbdt' else ebdt_bitmap_format_1)(None,None)
    glyph.metrics=SmallGlyphMetrics()
    for key,value in dict(height=6,width=8,BearingX=2,BearingY=5,Advance=9).items():setattr(glyph.metrics,key,value)
    glyph.imageData=png if kind=='cbdt' else bytes([0,64,128,255,255,128,64,0]*6)
    data.strikeData=[{'color':glyph}];location.strikes=[strike];f[dataTag]=data;f[locationTag]=location
    f.save(out/(kind+'.ttf'))
proof={'origin':'Original test artwork and outlines, Apache-2.0','sourceFontSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'fixtures':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.glob('*.ttf')}}
(out/'sources.json').write_text(json.dumps(proof,indent=2),encoding='utf8');print(json.dumps(proof))
