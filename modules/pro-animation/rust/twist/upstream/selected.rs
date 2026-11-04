// Original EffectCraft Rust @861c51f8187bf56efc77cc7b60fc4a513d2b7198, MIT OR Apache-2.0.
use kurbo::{BezPath,ParamCurve,ParamCurveArclen,ParamCurveDeriv,PathEl,PathSeg,Point,Vec2};
const ACC:f64=1e-3;
#[derive(Clone,Debug)]
struct Sub {
    segs: Vec<PathSeg>,
    closed: bool,
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

fn perp(v: Vec2) -> Vec2 {
    Vec2::new(-v.y, v.x)
}

pub fn twist(paths: &[BezPath], angle_deg: f64, center: [f64; 2]) -> Vec<BezPath> {
    let c = Point::new(center[0], center[1]);
    let mut rmax: f64 = 0.0;
    for p in paths {
        for el in p.elements() {
            if let Some(q) = el.end_point() {
                rmax = rmax.max(q.distance(c));
            }
        }
    }
    let a = angle_deg.to_radians();
    if a == 0.0 || rmax <= 1e-9 || !a.is_finite() {
        return paths.to_vec();
    }
    let k = a / rmax;
    let rot = |v: Vec2, th: f64| {
        let (s, co) = th.sin_cos();
        Vec2::new(v.x * co - v.y * s, v.x * s + v.y * co)
    };
    let map = |p: Point| {
        let v = p - c;
        c + rot(v, k * v.hypot())
    };
    // Derivative of the warp at `p` applied to `dv`.
    let jac = |p: Point, dv: Vec2| {
        let v = p - c;
        let r = v.hypot();
        let mut w = dv;
        if r > 1e-12 {
            w += perp(v) * (k * v.dot(dv) / r);
        }
        rot(w, k * r)
    };
    paths
        .iter()
        .map(|p| {
            let mut out = BezPath::new();
            for sub in subs(p) {
                out.move_to(map(sub.segs[0].start()));
                for seg in &sub.segs {
                    let cb = seg.to_cubic();
                    let len = seg.arclen(ACC);
                    let m = ((a.abs() * len / rmax) / 0.15 + len / 50.0).ceil().clamp(1.0, 64.0) as usize;
                    for i in 0..m {
                        let q = cb.subsegment(i as f64 / m as f64..(i + 1) as f64 / m as f64);
                        let (p0, p3) = (map(q.p0), map(q.p3));
                        out.curve_to(p0 + jac(q.p0, q.p1 - q.p0), p3 + jac(q.p3, q.p2 - q.p3), p3);
                    }
                }
                if sub.closed {
                    out.close_path();
                }
            }
            out
        })
        .collect()
}
