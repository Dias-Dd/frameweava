// SPDX-License-Identifier: Apache-2.0
// Authored static primitive geometry and unilateral projection. Mathematical reference:
// Mueller et al., Position Based Dynamics (2006), section 3.4: swept entry-point
// halfspaces with static nearest-surface recovery, followed by velocity response.
// No paper text/code or external collision runtime is embedded. Coulomb impulses
// use deterministic projected Gauss-Seidel; no warm starting or mutable native world.
use super::xpbd::{add, cross, dot, finite, norm, scale, sub, V};
use super::{put_f64, put_u32, Reader};
use std::collections::BTreeMap;
pub const HEADER: usize = 56;
pub const STRIDE: usize = 112;
#[derive(Clone, Debug)]
pub enum Shape {
    Plane { normal: V, offset: f64 },
    Sphere { center: V, radius: f64 },
}
#[derive(Clone, Debug)]
pub struct Collider {
    pub shape: Shape,
    pub friction: f64,
    pub restitution: f64,
}
pub struct Config {
    pub radii: Vec<f64>,
    pub colliders: Vec<Collider>,
    pub max_contacts: usize,
    pub tolerance: f64,
}
impl Config {
    pub fn decode(input: &[u8], n: usize) -> Result<Self, i32> {
        let mut r = Reader { data: input, at: 0 };
        if r.u32()? != 0x31434644 || r.u32()? != n {
            return Err(-4);
        }
        let count = r.u32()?;
        let max_contacts = r.u32()?;
        let tolerance = r.f64()?;
        let expected = 24usize
            .checked_add(n.checked_mul(8).ok_or(-4)?)
            .and_then(|v| v.checked_add(count.checked_mul(52)?))
            .ok_or(-4)?;
        if input.len() != expected || count == 0 || max_contacts == 0 || tolerance < 0.0 {
            return Err(-4);
        }
        let mut radii = Vec::with_capacity(n);
        for _ in 0..n {
            let radius = r.f64()?;
            if radius < 0.0 {
                return Err(-4);
            }
            radii.push(radius);
        }
        let mut colliders = Vec::with_capacity(count);
        for _ in 0..count {
            let tag = r.u32()?;
            let v = r.point()?;
            let value = r.f64()?;
            let friction = r.f64()?;
            let restitution = r.f64()?;
            if friction < 0.0 || !(0.0..=1.0).contains(&restitution) {
                return Err(-4);
            }
            let shape = if tag == 0 {
                let length = finite(norm(v))?;
                if (length - 1.0).abs() > 1e-10 {
                    return Err(-4);
                }
                Shape::Plane {
                    normal: scale(v, 1.0 / length),
                    offset: value,
                }
            } else if tag == 1 {
                if value <= 0.0 {
                    return Err(-4);
                }
                for radius in &radii {
                    finite(value + radius)?;
                }
                Shape::Sphere {
                    center: v,
                    radius: value,
                }
            } else {
                return Err(-4);
            };
            colliders.push(Collider {
                shape,
                friction,
                restitution,
            });
        }
        Ok(Self {
            radii,
            colliders,
            max_contacts,
            tolerance,
        })
    }
    pub fn capacity(&self, m: usize) -> Result<usize, i32> {
        HEADER
            .checked_add(self.radii.len().checked_mul(48).ok_or(-4)?)
            .and_then(|v| v.checked_add(m.checked_mul(8)?))
            .and_then(|v| {
                v.checked_add(
                    self.radii
                        .len()
                        .checked_mul(self.colliders.len())?
                        .min(self.max_contacts)
                        .checked_mul(STRIDE)?,
                )
            })
            .ok_or(-4)
    }
    pub fn work(&self, m: usize, iterations: usize) -> f64 {
        let pairs = self.radii.len() as f64 * self.colliders.len() as f64;
        (self.radii.len() as f64 + 16.0 * m as f64 + 96.0 * pairs) * iterations.max(1) as f64
            + 32.0 * pairs
    }
    pub fn penetration(&self, p: V, i: usize, c: usize) -> Result<f64, i32> {
        let distance = match self.colliders[c].shape {
            Shape::Plane { normal, offset } => finite(dot(p, normal) - offset - self.radii[i])?,
            Shape::Sphere { center, radius } => {
                finite(norm(sub(p, center)) - radius - self.radii[i])?
            }
        };
        Ok((-distance).max(0.0))
    }
    pub fn max_penetration(&self, p: &[V]) -> Result<f64, i32> {
        let mut value = 0.0f64;
        for (i, point) in p.iter().enumerate() {
            for c in 0..self.colliders.len() {
                value = value.max(self.penetration(*point, i, c)?);
            }
        }
        Ok(value)
    }
}
#[derive(Debug)]
pub struct Contact {
    pub normal: V,
    pub point: V,
    pub fraction: f64,
    pub lambda: f64,
    pub normal_impulse: f64,
    pub tangent_impulse: V,
    pub active: bool,
}
fn surface_contact(
    before: V,
    after: V,
    radius: f64,
    collider: &Collider,
    tolerance: f64,
) -> Result<Option<Contact>, i32> {
    let (normal, point, fraction) = match collider.shape {
        Shape::Plane { normal, offset } => {
            let end = finite(dot(after, normal) - offset - radius)?;
            if end > tolerance {
                return Ok(None);
            }
            let start = finite(dot(before, normal) - offset - radius)?;
            let fraction = if start > 0.0 && end < start {
                finite(start / (start - end))?.clamp(0.0, 1.0)
            } else {
                1.0
            };
            (normal, sub(after, scale(normal, end)), fraction)
        }
        Shape::Sphere {
            center,
            radius: obstacle,
        } => {
            let radius = finite(radius + obstacle)?;
            let start = sub(before, center);
            let delta = sub(after, before);
            let start_length = finite(norm(start))?;
            let travel = finite(norm(delta))?;
            let mut hit = None;
            if start_length >= radius && travel > 0.0 {
                let direction = scale(delta, 1.0 / travel);
                let towards = finite(-dot(start, direction))?;
                let perpendicular = finite(norm(cross(start, direction)))?;
                if towards >= 0.0 && perpendicular <= radius {
                    let ratio = perpendicular / radius;
                    let half_chord = finite(radius * (1.0 - ratio * ratio).max(0.0).sqrt())?;
                    let distance = finite(towards - half_chord)?;
                    if distance >= 0.0 && distance <= travel {
                        let fraction = distance / travel;
                        let offset = add(start, scale(delta, fraction));
                        let length = finite(norm(offset))?;
                        if length == 0.0 {
                            return Err(-9);
                        }
                        hit = Some((scale(offset, 1.0 / length), fraction));
                    }
                }
            }
            let (normal, fraction) = if let Some(value) = hit {
                value
            } else {
                let offset = sub(after, center);
                let length = finite(norm(offset))?;
                if length > finite(radius + tolerance)? {
                    return Ok(None);
                }
                if length == 0.0 {
                    return Err(-9);
                }
                (scale(offset, 1.0 / length), 1.0)
            };
            (normal, add(center, scale(normal, radius)), fraction)
        }
    };
    for value in normal.iter().chain(point.iter()) {
        finite(*value)?;
    }
    Ok(Some(Contact {
        normal,
        point,
        fraction,
        lambda: 0.0,
        normal_impulse: 0.0,
        tangent_impulse: [0.0; 3],
        active: false,
    }))
}
pub struct Solver<'a> {
    config: &'a Config,
    previous: &'a [V],
    incoming: &'a [V],
    mass: &'a [f64],
    dt: f64,
    pub contacts: BTreeMap<(usize, usize), Contact>,
}
impl<'a> Solver<'a> {
    pub fn new(
        config: &'a Config,
        previous: &'a [V],
        incoming: &'a [V],
        mass: &'a [f64],
        dt: f64,
    ) -> Self {
        Self {
            config,
            previous,
            incoming,
            mass,
            dt,
            contacts: BTreeMap::new(),
        }
    }
    pub fn generate(&mut self, positions: &[V]) -> Result<(), i32> {
        for (i, p) in positions.iter().enumerate() {
            for (c, collider) in self.config.colliders.iter().enumerate() {
                if self.contacts.contains_key(&(i, c)) {
                    continue;
                }
                if let Some(contact) = surface_contact(
                    self.previous[i],
                    *p,
                    self.config.radii[i],
                    collider,
                    self.config.tolerance,
                )? {
                    if self.contacts.len() >= self.config.max_contacts {
                        return Err(-6);
                    }
                    self.contacts.insert((i, c), contact);
                }
            }
        }
        Ok(())
    }
    pub fn project(&mut self, positions: &mut [V]) -> Result<(), i32> {
        self.generate(positions)?;
        for (&(i, _), contact) in &mut self.contacts {
            let distance = finite(dot(sub(positions[i], contact.point), contact.normal))?;
            if distance < 0.0 {
                if self.mass[i] == 0.0 {
                    if distance < -self.config.tolerance {
                        return Err(-10);
                    }
                    continue;
                }
                contact.lambda = finite(contact.lambda - distance / self.mass[i])?;
                positions[i] = sub(positions[i], scale(contact.normal, distance));
                for v in positions[i] {
                    finite(v)?;
                }
            }
        }
        Ok(())
    }
    pub fn position_residual(&self, positions: &[V]) -> Result<f64, i32> {
        let mut residual = self.config.max_penetration(positions)?;
        for (&(i, _), contact) in &self.contacts {
            residual = residual
                .max((-finite(dot(sub(positions[i], contact.point), contact.normal))?).max(0.0));
        }
        Ok(residual)
    }
    pub fn measure(&mut self, positions: &[V]) -> Result<(f64, f64), i32> {
        self.generate(positions)?;
        for (&(i, c), _) in &self.contacts {
            if self.mass[i] == 0.0
                && self.config.penetration(positions[i], i, c)? > self.config.tolerance
            {
                return Err(-10);
            }
        }
        let mut residual = 0.0f64;
        for (&(i, c), contact) in &self.contacts {
            if self.mass[i] > 0.0 {
                let incoming = finite(dot(self.incoming[i], contact.normal))?;
                residual = residual.max(
                    finite(self.config.colliders[c].restitution * (-incoming).max(0.0) - incoming)?
                        .max(0.0),
                );
            }
        }
        Ok((self.config.max_penetration(positions)?, residual))
    }
    pub fn velocities(
        &mut self,
        positions: &[V],
        iterations: usize,
    ) -> Result<(Vec<V>, f64, f64), i32> {
        let penetration = self.config.max_penetration(positions)?;
        if self.position_residual(positions)? > self.config.tolerance {
            return Err(-12);
        }
        let mut velocities: Vec<V> = positions
            .iter()
            .zip(self.previous)
            .map(|(p, old)| scale(sub(*p, *old), 1.0 / self.dt))
            .collect();
        for v in velocities.iter().flatten() {
            finite(*v)?;
        }
        for (&(i, _), contact) in &mut self.contacts {
            contact.active = contact.lambda > 0.0
                || finite(dot(sub(positions[i], contact.point), contact.normal))?
                    <= self.config.tolerance;
            contact.normal_impulse = finite(contact.lambda / self.dt)?;
        }
        for _ in 0..iterations {
            for (&(i, c), contact) in &mut self.contacts {
                if !contact.active || self.mass[i] == 0.0 {
                    continue;
                }
                let collider = &self.config.colliders[c];
                let w = self.mass[i];
                let target = finite(
                    collider.restitution * (-dot(self.incoming[i], contact.normal)).max(0.0),
                )?;
                let normal_speed = finite(dot(velocities[i], contact.normal))?;
                let impulse =
                    finite(contact.normal_impulse + (target - normal_speed) / w)?.max(0.0);
                let delta = finite(impulse - contact.normal_impulse)?;
                velocities[i] = add(velocities[i], scale(contact.normal, finite(w * delta)?));
                contact.normal_impulse = impulse;
                let normal_speed = finite(dot(velocities[i], contact.normal))?;
                let tangent = sub(velocities[i], scale(contact.normal, normal_speed));
                let proposal = sub(contact.tangent_impulse, scale(tangent, 1.0 / w));
                let proposal = sub(
                    proposal,
                    scale(contact.normal, dot(proposal, contact.normal)),
                );
                let length = finite(norm(proposal))?;
                let limit = finite(collider.friction * impulse)?;
                let next = if length > limit && length > 0.0 {
                    scale(proposal, limit / length)
                } else {
                    proposal
                };
                velocities[i] = add(velocities[i], scale(sub(next, contact.tangent_impulse), w));
                contact.tangent_impulse = next;
                for v in velocities[i] {
                    finite(v)?;
                }
            }
        }
        let mut residual = 0.0f64;
        for (&(i, c), contact) in &self.contacts {
            if contact.active && self.mass[i] > 0.0 {
                let target = finite(
                    self.config.colliders[c].restitution
                        * (-dot(self.incoming[i], contact.normal)).max(0.0),
                )?;
                residual =
                    residual.max(finite(target - dot(velocities[i], contact.normal))?.max(0.0));
            }
        }
        Ok((velocities, penetration, residual))
    }
    pub fn write(&self, out: &mut [u8], mut at: usize, positions: &[V]) {
        for (&(i, c), contact) in &self.contacts {
            put_u32(out, at, i);
            put_u32(out, at + 4, c);
            for (k, v) in contact.normal.iter().enumerate() {
                put_f64(out, at + 8 + k * 8, *v);
            }
            let point = sub(contact.point, scale(contact.normal, self.config.radii[i]));
            for (k, v) in point.iter().enumerate() {
                put_f64(out, at + 32 + k * 8, *v);
            }
            put_f64(out, at + 56, contact.fraction);
            put_f64(out, at + 64, contact.normal_impulse);
            for (k, v) in contact.tangent_impulse.iter().enumerate() {
                put_f64(out, at + 72 + k * 8, *v);
            }
            put_f64(
                out,
                at + 96,
                self.config.penetration(positions[i], i, c).unwrap(),
            );
            put_u32(out, at + 104, usize::from(contact.active));
            put_u32(out, at + 108, 0);
            at += STRIDE;
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn plane(friction: f64, restitution: f64) -> Collider {
        Collider {
            shape: Shape::Plane {
                normal: [0.0, 1.0, 0.0],
                offset: 0.0,
            },
            friction,
            restitution,
        }
    }
    #[test]
    fn plane_projection_friction_and_restitution_match_isolated_impulse() {
        let c = Config {
            radii: vec![0.1],
            colliders: vec![plane(0.3, 0.5)],
            max_contacts: 1,
            tolerance: 1e-9,
        };
        let previous = [[0.0, 1.1, 0.0]];
        let incoming = [[2.0, -2.0, 0.0]];
        let mass = [0.5];
        let mut p = [[2.0, -0.9, 0.0]];
        let mut s = Solver::new(&c, &previous, &incoming, &mass, 1.0);
        s.project(&mut p).unwrap();
        let (v, penetration, residual) = s.velocities(&p, 4).unwrap();
        assert!((p[0][1] - 0.1).abs() < 1e-14);
        assert!((v[0][1] - 1.0).abs() < 1e-14);
        assert!((v[0][0] - 1.1).abs() < 1e-14);
        assert!(penetration < 1e-14 && residual < 1e-14);
        assert!((s.contacts[&(0, 0)].normal_impulse - 6.0).abs() < 1e-14);
    }
    #[test]
    fn sphere_sweep_stops_a_complete_tunnel_without_endpoint_overlap() {
        let c = Collider {
            shape: Shape::Sphere {
                center: [0.0; 3],
                radius: 1.0,
            },
            friction: 0.0,
            restitution: 0.0,
        };
        let h = surface_contact([-10.0, 0.0, 0.0], [10.0, 0.0, 0.0], 0.1, &c, 1e-9)
            .unwrap()
            .unwrap();
        assert!((h.fraction - 0.445).abs() < 1e-14);
        assert_eq!(h.normal, [-1.0, 0.0, 0.0]);
        assert!((h.point[0] + 1.1).abs() < 1e-14);
        assert!(
            surface_contact([-10.0, 2.0, 0.0], [10.0, 2.0, 0.0], 0.1, &c, 1e-9)
                .unwrap()
                .is_none()
        );
    }
    #[test]
    fn interacting_floor_sphere_halfspaces_need_contact_cleanup_without_relaxing_tolerance() {
        let c = Config {
            radii: vec![0.02],
            colliders: vec![
                plane(0.0, 0.0),
                Collider {
                    shape: Shape::Sphere {
                        center: [0.0, 0.3, 0.0],
                        radius: 0.6,
                    },
                    friction: 0.0,
                    restitution: 0.0,
                },
            ],
            max_contacts: 2,
            tolerance: 1e-8,
        };
        let previous = [[0.7, 0.02, 0.0]];
        let incoming = [[-0.3, -0.12, 0.0]];
        let mass = [1.0];
        let mut positions = [[0.4, -0.1, 0.0]];
        let mut solver = Solver::new(&c, &previous, &incoming, &mass, 1.0);
        solver.project(&mut positions).unwrap();
        assert!(solver.position_residual(&positions).unwrap() > c.tolerance);
        for _ in 0..32 {
            if solver.position_residual(&positions).unwrap() <= c.tolerance {
                break;
            }
            solver.project(&mut positions).unwrap();
        }
        assert!(solver.position_residual(&positions).unwrap() <= c.tolerance);
        assert!(c.max_penetration(&positions).unwrap() <= c.tolerance);
    }
    #[test]
    fn fixed_penetration_and_contact_budget_fail_explicitly() {
        let c = Config {
            radii: vec![0.1],
            colliders: vec![plane(0.0, 0.0)],
            max_contacts: 1,
            tolerance: 1e-9,
        };
        let p = [[0.0, -1.0, 0.0]];
        let v = [[0.0; 3]];
        let mass = [0.0];
        let mut s = Solver::new(&c, &p, &v, &mass, 0.1);
        assert_eq!(s.project(&mut p.clone()).unwrap_err(), -10);
        let c = Config {
            max_contacts: 0,
            ..c
        };
        let mut s = Solver::new(&c, &p, &v, &mass, 0.1);
        assert_eq!(s.generate(&p).unwrap_err(), -6);
    }
}
