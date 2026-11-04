import json,sys,ctypes,struct,math,itertools
import PyOpenColorIO as o
from extract import make_processor
r=json.load(open(sys.argv[1],encoding='utf-8'))
c,p=make_processor(r['request']); group=p.createGroupTransform(); parts=list(group)
prefix=o.GroupTransform()
for t in parts[:4]: prefix.appendTransform(t)
ap0=[.7347,.2653,0.,1.,.0001,-.077,.32168,.33767]
limits=list(parts[4].getParams())
def run(g,v):return c.getProcessor(g).getOptimizedCPUProcessor(o.OPTIMIZATION_NONE).applyRGB(v)
rows=[]
F=lambda x:struct.unpack('<f',struct.pack('<f',x))[0]
crt=ctypes.CDLL('ucrtbase.dll')
for name,n in [('powf',2),('sqrtf',1),('atan2f',2),('fmaf',3)]:
    fn=getattr(crt,name); fn.argtypes=[ctypes.c_float]*n; fn.restype=ctypes.c_float
def mulmatrix(a,v):return [F(F(F(v[0]*a[i])+F(v[1]*a[3+i]))+F(v[2]*a[6+i])) for i in range(3)]
for v in r['samples']:
    q=o.GroupTransform();q.appendTransform(prefix)
    matrix=run(q,v)
    q.appendTransform(o.FixedFunctionTransform(o.FIXED_FUNCTION_ACES_RGB_TO_JMH_20,ap0));jmh=run(q,v)
    q.appendTransform(o.FixedFunctionTransform(o.FIXED_FUNCTION_ACES_TONESCALE_COMPRESS_20,[100.]));tone=run(q,v)
    q.appendTransform(o.FixedFunctionTransform(o.FIXED_FUNCTION_ACES_GAMUT_COMPRESS_20,limits));gamut=run(q,v)
    combined=o.GroupTransform();combined.appendTransform(prefix);combined.appendTransform(parts[4])
    row=dict(input=v,ap0=matrix,jmh=jmh,tone=tone,gamut=gamut,combined=run(combined,v),final=run(group,v))
    if 'camMatrix' in r:
        lms=mulmatrix(r['camMatrix'],matrix)
        power=[crt.powf(abs(x),F(.42)) for x in lms]
        response=[math.copysign(F(y/F(F(27.13)+y)),x) for x,y in zip(lms,power)]
        aab=mulmatrix(r['responseMatrix'],response)
        J=F(100*crt.powf(aab[0],F(1.13705599)));M=crt.sqrtf(F(F(aab[1]*aab[1])+F(aab[2]*aab[2])));h=F(F(180*crt.atan2f(aab[2],aab[1]))/F(math.pi));h=F(h+360) if h<0 else h
        row['ucrt']=dict(lms=lms,power=power,response=response,aab=aab,jmh=[J,M,h])
    rows.append(row)
if 'camMatrix' in r:
    modes=list(itertools.product(list(itertools.permutations(range(3))),range(4)))
    def dot(a,v,mode):
        (i,j,k),fused=mode
        first=crt.fmaf(v[i],a[i],F(v[j]*a[j])) if fused&1 else F(F(v[i]*a[i])+F(v[j]*a[j]))
        return crt.fmaf(v[k],a[k],first) if fused&2 else F(first+F(v[k]*a[k]))
    def mat(a,v,mode):return [dot([a[i],a[3+i],a[6+i]],v,mode) for i in range(3)]
    candidates=[]
    for cm,rm in itertools.product(modes,modes):
        score=0
        for row in rows:
            lms=mat(r['camMatrix'],row['ap0'],cm)
            power=[crt.powf(abs(x),F(.42)) for x in lms]
            response=[math.copysign(F(y/F(F(27.13)+y)),x) for x,y in zip(lms,power)]
            aab=mat(r['responseMatrix'],response,rm)
            J=F(100*crt.powf(aab[0],F(1.13705599)));M=crt.sqrtf(F(F(aab[1]*aab[1])+F(aab[2]*aab[2])));h=F(F(180*crt.atan2f(aab[2],aab[1]))/F(math.pi));h=F(h+360) if h<0 else h
            score+=sum(abs(a-b) for a,b in zip([J,M,h],row['jmh']))
        candidates.append(dict(score=score,cam=cm,response=rm))
    rows.append(dict(roundingCandidates=sorted(candidates,key=lambda x:x['score'])[:6]))
print(json.dumps(rows))
