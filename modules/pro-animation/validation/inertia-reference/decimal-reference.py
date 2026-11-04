"""Independent 80-digit Decimal oracle. Test-only; no production integrator/dependency."""
from decimal import Decimal, localcontext
import json
from pathlib import Path

cases = [(12., 840., .25, t, 100.) for t in [0., 1e-12, .05, .3, 1., 100.]]
cases += [(-7., -420., .325, t, -80.) for t in [1e-10, .1, .7, 10.]]
cases += [(1e8, .001, .15, t, None) for t in [1e-12, .1, 8.]]
rows = []
with localcontext() as ctx:
    ctx.prec = 80
    d = Decimal.from_float
    for origin, velocity, tau, time, boundary in cases:
        x, v, q, t = map(d, (origin, velocity, tau, time))
        amplitude = v*q
        decay = (-t/q).exp()
        row = dict(origin=origin, velocity=velocity, tau=tau, time=time,
                   value=str(x+amplitude*(1-decay)), speed=str(v*decay))
        if boundary is not None:
            remaining = 1-(d(boundary)-x)/amplitude
            row.update(boundary=boundary, crossing=str(-q*remaining.ln()),
                       crossingVelocity=str(v*remaining))
        rows.append(row)
out = Path(__file__).with_name('decimal-reference.json')
out.write_text(json.dumps(dict(precision=80, inputSemantics='Decimal.from_float: exact binary64 inputs', cases=rows), indent=2)+'\n', encoding='utf-8')
print(out)
