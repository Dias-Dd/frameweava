# Original small real OpenType graph, Apache-2.0; no third-party artwork.
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.colorLib.builder import buildCOLR
from fontTools.ttLib.tables.otTables import PaintFormat as P, ExtendMode as E
import json, hashlib
out=Path('.frameweave/pa4-colr/fixtures');out.mkdir(parents=True,exist_ok=True)
original=Path('docs/pro-animation/colr-paint-validation/fixtures/original.ttf');font=TTFont(original,recalcTimestamp=False)
line={'Extend':E.PAD,'ColorStop':[{'StopOffset':0.,'PaletteIndex':0,'Alpha':1.},{'StopOffset':1.,'PaletteIndex':1,'Alpha':1.}]}
def fill(p0,p1,p2):
 return {'Format':P.PaintGlyph,'Glyph':'triangle','Paint':{'Format':P.PaintLinearGradient,'ColorLine':line,'x0':p0[0],'y0':p0[1],'x1':p1[0],'y1':p1[1],'x2':p2[0],'y2':p2[1]}}
font['COLR']=buildCOLR({'color':fill((0,0),(0,0),(0,700)),'linear':fill((0,0),(700,0),(0,0)),'radial':fill((0,0),(350,350),(700,700)),'sweep':{'Format':P.PaintGlyph,'Glyph':'triangle','Paint':{'Format':P.PaintSolid,'PaletteIndex':0,'Alpha':1.}}},version=1,glyphMap=font.getReverseGlyphMap(),clipBoxes={name:(0,0,800,800) for name in ['color','linear','radial','sweep']})
font.save(out/'degenerate.ttf');(out/'original.ttf').write_bytes(original.read_bytes())
print(json.dumps({'origin':'Original authored actual OpenType fixtures, Apache-2.0','fonts':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in out.glob('*.ttf')}}))
