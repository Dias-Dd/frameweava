"""Test-only independent C HarfBuzz oracle. Never part of runtime or package execution."""
import json, sys
from pathlib import Path
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen

class FloatOutlinePen(BasePen):
    def __init__(self,glyph_set):
        super().__init__(glyph_set)
        self.commands=[]
    def _moveTo(self,p): self.commands.extend([1,*p])
    def _lineTo(self,p): self.commands.extend([2,*p])
    def _qCurveToOne(self,p,q): self.commands.extend([3,*p,*q])
    def _curveToOne(self,p,q,r): self.commands.extend([4,*p,*q,*r])
    def _closePath(self): self.commands.append(5)

cases=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
rows=[]
for case in cases:
    data=Path(case['fontPath']).read_bytes()
    face=hb.Face(data,0)
    font=hb.Font(face)
    font.scale=(face.upem,face.upem)
    hb.ot_font_set_funcs(font)
    font.set_variations(case.get('variations',{}))
    buffer=hb.Buffer()
    buffer.add_codepoints([ord(ch) for ch in case['text']])
    buffer.direction=case['direction']
    buffer.script=case['script']
    buffer.language=case['language']
    hb.shape(font,buffer,case.get('features',{}))
    utf16=[0]
    for ch in case['text']:
        utf16.append(utf16[-1]+(2 if ord(ch)>0xffff else 1))
    glyphs=[[i.codepoint,utf16[i.cluster],p.x_advance,p.y_advance,p.x_offset,p.y_offset]
            for i,p in zip(buffer.glyph_infos,buffer.glyph_positions)]
    outlines={}
    float_outlines={}
    # Independent floating gvar geometry at the SAME normalized coordinates.
    tt=TTFont(case['fontPath'])
    axes=tt['fvar'].axes if 'fvar' in tt else []
    location={a.axisTag:v for a,v in zip(axes,font.get_var_coords_normalized())}
    glyph_set=tt.getGlyphSet(location=location,normalized=True)
    outline_scale=1
    font.scale=(face.upem*outline_scale,face.upem*outline_scale)
    for gid in list(dict.fromkeys(i.codepoint for i in buffer.glyph_infos))[:6]:
        commands=[]
        draw=hb.DrawFuncs()
        draw.set_move_to_func(lambda x,y,s:s.extend([1,x/outline_scale,y/outline_scale]))
        draw.set_line_to_func(lambda x,y,s:s.extend([2,x/outline_scale,y/outline_scale]))
        draw.set_quadratic_to_func(lambda cx,cy,x,y,s:s.extend([3,cx/outline_scale,cy/outline_scale,x/outline_scale,y/outline_scale]))
        draw.set_cubic_to_func(lambda a,b,c,d,x,y,s:s.extend([4,a/outline_scale,b/outline_scale,c/outline_scale,d/outline_scale,x/outline_scale,y/outline_scale]))
        draw.set_close_path_func(lambda s:s.append(5))
        font.draw_glyph(gid,draw,commands)
        outlines[str(gid)]=commands
        pen=FloatOutlinePen(glyph_set)
        glyph_set[tt.getGlyphName(gid)].draw(pen)
        float_outlines[str(gid)]=pen.commands
    tt.close()
    rows.append({'id':case['id'],'upem':face.upem,'glyphs':glyphs,'outlines':outlines,'floatOutlines':float_outlines,'normalizedLocation':location})
import fontTools
print(json.dumps({'binding':hb.__version__,'harfbuzz':hb.version_string(),'fontTools':fontTools.__version__,'rows':rows}))
