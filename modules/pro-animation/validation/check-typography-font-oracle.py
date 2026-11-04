from pathlib import Path
import json,hashlib
from fontTools.ttLib import TTFont
from fontTools import version as fonttoolsVersion
from fontTools.varLib.models import normalizeLocation,piecewiseLinearMap
from fontTools.misc.fixedTools import floatToFixedToFloat
start=__import__('time').perf_counter()
root=Path('.frameweave/pa3-font-metadata')
actual=json.loads((root/'preparation/result.json').read_text(encoding='utf-8'))
sources=json.loads(Path('modules/pro-animation/validation/bidi-scene/font-sources.json').read_text(encoding='utf-8'))
records=[]
for entry in actual['fonts']:
 identity=entry['instance']['source'];source=next(s for s in sources if s['id']==identity['resourceId'])
 path=Path('modules/pro-animation/validation/bidi-scene')/source['asset'];assert hashlib.sha256(path.read_bytes()).hexdigest()==identity['sha256']
 font=TTFont(path,fontNumber=entry['instance']['faceIndex']);m=entry['metrics'];head=font['head'];os=font['OS/2'];hhea=font['hhea'];post=font['post']
 assert m['unitsPerEm']==head.unitsPerEm and m['glyphCount']==font['maxp'].numGlyphs
 asc,desc,gap=(os.sTypoAscender,os.sTypoDescender,os.sTypoLineGap) if os.fsSelection&128 else (hhea.ascent,hhea.descent,hhea.lineGap)
 if asc==0 and desc==0:asc,desc,gap=(os.sTypoAscender,os.sTypoDescender,os.sTypoLineGap) if os.sTypoAscender or os.sTypoDescender else (os.usWinAscent,-os.usWinDescent,os.sTypoLineGap)
 assert [m['ascent'],m['descent'],m['leading']]==[max(asc,0),min(desc,0),gap]
 assert m['bounds']==dict(left=head.xMin,bottom=head.yMin,right=head.xMax,top=head.yMax)
 assert m['underline']==dict(offset=post.underlinePosition,thickness=post.underlineThickness)
 assert m['strikeout']==dict(offset=os.yStrikeoutPosition,thickness=os.yStrikeoutSize)
 cmap=font.getBestCmap();mapped=0
 for row in entry['characters']:
  name=cmap.get(row['codepoint']);gid=font.getGlyphID(name) if name else None
  assert row['glyphId']==gid,(identity['resourceId'],row,gid);mapped+=gid is not None
 for g in entry['glyphs']:
  width,lsb=font['hmtx'].metrics[font.getGlyphName(g['glyphId'])]
  assert g['advance']==width and g['leftSideBearing']==lsb
 axes=font['fvar'].axes if 'fvar' in font else []
 expectedAxes=[dict(tag=a.axisTag,index=i,min=a.minValue,default=a.defaultValue,max=a.maxValue,hidden=bool(a.flags&1)) for i,a in enumerate(axes)]
 assert entry['axes']==expectedAxes
 location=normalizeLocation({'wght':700} if any(a.axisTag=='wght' for a in axes) else {},{a.axisTag:(a.minValue,a.defaultValue,a.maxValue) for a in axes})
 normalized=[]
 for a in axes:
  n=location[a.axisTag]
  if 'avar' in font:n=piecewiseLinearMap(n,font['avar'].segments[a.axisTag])
  normalized.append(floatToFixedToFloat(n,14))
 error=max([abs(a-b) for a,b in zip(entry['location'],normalized)]+[0]);assert error<=1/16384,(identity['resourceId'],entry['location'],normalized)
 records.append(dict(font=identity['resourceId'],nominalChecks=len(entry['characters']),glyphMetricsChecks=len(entry['glyphs']),axes=len(axes),locationError=error,actualLocation=entry['location'],referenceLocation=normalized))
 font.close()
result=dict(ok=True,fonttoolsVersion=fonttoolsVersion,normalizationBudget=1/16384,normalizationPolicy='Original read-fonts/Skrifa fixed16.16 design-space and F2Dot14 AVAR pipeline versus FontTools F64 normalize/remap then final14bit quantization; at most one quantization step here, not exact algorithm identity',records=records,seconds=__import__('time').perf_counter()-start,scope='Independent FontTools original table/cmap/hmtx/fvar/avar reference for four provided fonts at default instances and queried700weight location; not all font formats/scripts/variable outlines')
(root/'oracle').mkdir(exist_ok=True);(root/'oracle/result.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
