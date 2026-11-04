// Selected original EffectCraft Rust at861c51f8187bf56efc77cc7b60fc4a513d2b7198. MIT OR Apache-2.0.
// fit tangent helpers originated in VectorCraft as attributed by the preserved original fit.rs.
use kurbo::{BezPath,CubicBez,ParamCurve,ParamCurveArclen,ParamCurveDeriv,PathEl,PathSeg,Point,Vec2};
const ACC:f64=1e-3;
#[derive(Clone, Debug)]
struct Sub {
    segs: Vec<PathSeg>,
    closed: bool,
}

#[derive(Clone, Copy, Debug)]
struct Sample {
    p: Point,
    tan: Vec2,
    /// Length of the piece before / after this sample.
    len_prev: f64,
    len_next: f64,
}

fn degenerate(s: &PathSeg) -> bool {
    let c = s.to_cubic();
    let d = |a: Point, b: Point| a.distance(b) < 1e-9;
    d(c.p0, c.p1) && d(c.p0, c.p2) && d(c.p0, c.p3)
}

fn subs(p: &BezPath) -> Vec<Sub> {
    p.subpaths()
        .filter_map(|els| {
            let closed = matches!(els.last(), Some(PathEl::ClosePath));
            let bp = BezPath::from_vec(els.to_vec());
            let segs: Vec<PathSeg> = bp.segments().filter(|s| !degenerate(s)).collect();
            (!segs.is_empty()).then_some(Sub { segs, closed })
        })
        .collect()
}

fn seg_start_tan(s: &PathSeg) -> Vec2 {
    start_tangent(&s.to_cubic())
}

fn seg_end_tan(s: &PathSeg) -> Vec2 {
    end_tangent(&s.to_cubic())
}

fn seg_tan_at(s: &PathSeg, t: f64) -> Vec2 {
    let c = s.to_cubic();
    if t <= 1e-9 {
        return start_tangent(&c);
    }
    if t >= 1.0 - 1e-9 {
        return end_tangent(&c);
    }
    unit(c.deriv().eval(t).to_vec2()).unwrap_or_else(|| start_tangent(&c))
}

fn perp(v: Vec2) -> Vec2 {
    Vec2::new(-v.y, v.x)
}

fn resample(sub: &Sub, m: usize) -> Vec<Sample> {
    let segs = &sub.segs;
    let n = segs.len();
    let lens: Vec<f64> = segs.iter().map(|s| s.arclen(ACC)).collect();
    let mut out = Vec::with_capacity(n * m + 1);
    for j in 0..n {
        let piece = lens[j] / m as f64;
        for k in 0..m {
            if k == 0 {
                let tout = seg_start_tan(&segs[j]);
                let prev = if sub.closed || j > 0 { Some((j + n - 1) % n) } else { None };
                let tan = match prev {
                    Some(pj) => unit(seg_end_tan(&segs[pj]) + tout).unwrap_or(tout),
                    None => tout,
                };
                let len_prev = prev.map_or(0.0, |pj| lens[pj] / m as f64);
                out.push(Sample { p: segs[j].start(), tan, len_prev, len_next: piece });
            } else {
                let t = segs[j].inv_arclen(piece * k as f64, ACC);
                out.push(Sample { p: segs[j].eval(t), tan: seg_tan_at(&segs[j], t), len_prev: piece, len_next: piece });
            }
        }
    }
    if !sub.closed {
        let last = &segs[n - 1];
        out.push(Sample { p: last.end(), tan: seg_end_tan(last), len_prev: lens[n - 1] / m as f64, len_next: 0.0 });
    }
    out
}

fn emit(samples: &[Sample], disp: &[Vec2], closed: bool, smooth: bool, handle: f64, out: &mut BezPath) {
    let n = samples.len();
    if n == 0 {
        return;
    }
    let pt = |i: usize| samples[i].p + disp[i];
    out.move_to(pt(0));
    let count = if closed { n } else { n - 1 };
    for i in 0..count {
        let j = (i + 1) % n;
        if smooth {
            let (a, b) = (&samples[i], &samples[j]);
            out.curve_to(pt(i) + a.tan * (a.len_next * handle), pt(j) - b.tan * (b.len_prev * handle), pt(j));
        } else {
            out.line_to(pt(j));
        }
    }
    if closed {
        out.close_path();
    }
}

pub fn zigzag(paths: &[BezPath], size: f64, ridges: f64, smooth: bool) -> Vec<BezPath> {
    let m = ridges.round().clamp(0.0, 1000.0) as usize + 1;
    paths
        .iter()
        .map(|p| {
            let mut out = BezPath::new();
            for sub in subs(p) {
                let s = resample(&sub, m);
                let disp: Vec<Vec2> = s.iter().enumerate().map(|(i, x)| perp(x.tan) * if i % 2 == 0 { size } else { -size }).collect();
                emit(&s, &disp, sub.closed, smooth, 0.36, &mut out);
            }
            out
        })
        .collect()
}

pub(crate) fn unit(v: Vec2) -> Option<Vec2> {
    let l = v.hypot();
    if l > 1e-12 && l.is_finite() { Some(v / l) } else { None }
}

pub(crate) fn start_tangent(c: &CubicBez) -> Vec2 {
    unit(c.p1 - c.p0).or_else(|| unit(c.p2 - c.p0)).or_else(|| unit(c.p3 - c.p0)).unwrap_or(Vec2::new(1.0, 0.0))
}

pub(crate) fn end_tangent(c: &CubicBez) -> Vec2 {
    unit(c.p3 - c.p2).or_else(|| unit(c.p3 - c.p1)).or_else(|| unit(c.p3 - c.p0)).unwrap_or(Vec2::new(1.0, 0.0))
}
