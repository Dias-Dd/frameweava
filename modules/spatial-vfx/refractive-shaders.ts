/** Ray origins, directions and eight state words per pixel stay on the GPU. */
export const seedRefractiveRays = /* wgsl */ `
fn compute(pixel: vec3u, local: vec3u, group: vec3u) {
  let width = paramU32(21u);
  let ndc = vec2f(2. * (f32(pixel.x) + .5) / f32(width) - 1.,
                 1. - 2. * (f32(pixel.y) + .5) / f32(paramU32(22u)));
  let right = vec3f(paramF32(0u), paramF32(1u), paramF32(2u));
  let up = vec3f(paramF32(4u), paramF32(5u), paramF32(6u));
  let forward = -vec3f(paramF32(8u), paramF32(9u), paramF32(10u));
  let offset = ndc.x * paramF32(16u) * right + ndc.y * paramF32(17u) * up;
  var origin = vec3f(paramF32(12u), paramF32(13u), paramF32(14u));
  var direction = forward;
  if (paramU32(20u) == 1u) { direction = normalize(forward + offset); }
  else { origin += offset; }
  let axial = dot(direction, forward);
  origin += direction * (paramF32(18u) / axial);
  let index = pixel.y * width + pixel.x;
  let ray = index * 3u;
  store0(ray, origin.x); store0(ray + 1u, origin.y); store0(ray + 2u, origin.z);
  store1(ray, direction.x); store1(ray + 1u, direction.y); store1(ray + 2u, direction.z);
  let s = index * 8u;
  store2(s, 0.); store2(s + 1u, 0.); store2(s + 2u, 0.); store2(s + 3u, -1.);
  store2(s + 4u, 1.); store2(s + 5u, 1.); store2(s + 6u, 1.);
  store2(s + 7u, (paramF32(19u) - paramF32(18u)) / axial);
}
`;

export const advanceRefractiveRays = /* wgsl */ `
fn sphere(index: u32) -> vec4f {
  let k = index * 4u;
  return vec4f(load6(k), load6(k + 1u), load6(k + 2u), load6(k + 3u));
}
fn insideDroplet(p: vec3f, skip: u32) -> bool {
  for (var j = 0u; j < paramU32(6u); j++) {
    if (j == skip) { continue; }
    let s = sphere(j);
    let q = p - s.xyz;
    if (dot(q, q) < s.w * s.w) { return true; }
  }
  return false;
}
struct Boundary { distance: f32, outward: vec3f }
fn boundary(o: vec3f, d: vec3f, limit: f32, epsilon: f32) -> Boundary {
  let hasPlane = paramU32(17u) == 1u;
  let level = paramF32(0u);
  var hit = Boundary(limit, vec3f(0.));
  if (hasPlane && abs(d.y) > 1e-8) {
    let t = (level - o.y) / d.y;
    if (t > epsilon && t < hit.distance && !insideDroplet(o + d * t, 0xffffffffu)) {
      hit = Boundary(t, vec3f(0., 1., 0.));
    }
  }
  for (var j = 0u; j < paramU32(6u); j++) {
    let s = sphere(j);
    let q = o - s.xyz;
    let b = dot(q, d);
    let discriminant = s.w * s.w - dot(cross(q, d), cross(q, d));
    if (discriminant <= 0.) { continue; }
    let root = sqrt(discriminant);
    let ts = vec2f(-b - root, -b + root);
    for (var side = 0u; side < 2u; side++) {
      let t = ts[side];
      if (t <= epsilon || t >= hit.distance) { continue; }
      let p = o + d * t;
      // All water uses one medium. Submerged or overlapping surfaces are internal.
      if ((hasPlane && p.y <= level) || insideDroplet(p, j)) { continue; }
      hit = Boundary(t, normalize(p - s.xyz));
    }
  }
  return hit;
}
fn sky(d: vec3f) -> vec3f {
  return mix(vec3f(paramF32(8u), paramF32(9u), paramF32(10u)),
             vec3f(paramF32(11u), paramF32(12u), paramF32(13u)),
             clamp(.5 + .5 * d.y, 0., 1.));
}
fn radiance(s: u32, color: vec3f) {
  store2(s, color.x); store2(s + 1u, color.y); store2(s + 2u, color.z);
}
fn stop(ray: u32, s: u32, color: vec3f) {
  radiance(s, color);
  store1(ray, 0.); store1(ray + 1u, 0.); store1(ray + 2u, 0.);
}
fn compute(pixel: vec3u, local: vec3u, group: vec3u) {
  let index = pixel.y * paramU32(18u) + pixel.x;
  let ray = index * 3u;
  let d = vec3f(load1(ray), load1(ray + 1u), load1(ray + 2u));
  if (all(d == vec3f(0.))) { return; }
  let o = vec3f(load0(ray), load0(ray + 1u), load0(ray + 2u));
  let s = index * 8u;
  let base = vec3f(load2(s), load2(s + 1u), load2(s + 2u));
  var throughput = vec3f(load2(s + 4u), load2(s + 5u), load2(s + 6u));
  let remaining = load2(s + 7u);
  let epsilon = paramF32(5u);
  let r = index * 4u;
  let hasMesh = load3(r) == 1u && load4(r) <= remaining;
  let surfaceHit = boundary(o, d, select(remaining, load4(r), hasMesh), epsilon);
  let hitWater = any(surfaceHit.outward != vec3f(0.));
  let medium = load2(s + 3u);
  var wet = medium == 1.;
  if (medium < 0.) {
    wet = (paramU32(17u) == 1u && o.y < paramF32(0u)) || insideDroplet(o, 0xffffffffu);
  }
  if (wet) {
    throughput *= exp(-vec3f(paramF32(2u), paramF32(3u), paramF32(4u)) * surfaceHit.distance);
  }
  if (!hitWater) {
    var color = sky(d);
    if (hasMesh) {
      let m = load3(r + 1u) * 4u;
      let normal = vec3f(load5(r), load5(r + 1u), load5(r + 2u));
      let facing = select(-normal, normal, load5(r + 3u) > .5);
      let light = vec3f(paramF32(14u), paramF32(15u), paramF32(16u));
      let lit = .28 + .72 * max(0., dot(facing, light));
      color = vec3f(load7(m), load7(m + 1u), load7(m + 2u)) * lit;
    }
    stop(ray, s, base + throughput * color);
    return;
  }
  if (paramU32(7u) == 1u) {
    // Signal a visible unresolved path rather than silently inventing its result.
    stop(ray, s, vec3f(8., 0., 8.));
    return;
  }
  let n = select(surfaceHit.outward, -surfaceHit.outward, wet);
  let ior = paramF32(1u);
  let eta = select(1. / ior, ior, wet);
  let transmitted = refract(d, n, eta);
  let reflected = normalize(reflect(d, n));
  var next = reflected;
  let crosses = any(transmitted != vec3f(0.));
  if (crosses) {
    next = normalize(transmitted);
    // Exact unpolarized dielectric Fresnel. Only its reflected environment
    // term is approximated; total internal reflection follows scene geometry.
    let ci = abs(dot(d, n));
    let ct = abs(dot(next, n));
    let rs = (eta * ci - ct) / max(1e-8, eta * ci + ct);
    let rp = (ci - eta * ct) / max(1e-8, ci + eta * ct);
    let reflection = select(.5 * (rs * rs + rp * rp), 0., ior == 1.);
    radiance(s, base + throughput * reflection * sky(reflected));
    throughput *= 1. - reflection;
  }
  let nextOrigin = o + d * surfaceHit.distance + n * select(2. * epsilon, -2. * epsilon, crosses);
  store0(ray, nextOrigin.x); store0(ray + 1u, nextOrigin.y); store0(ray + 2u, nextOrigin.z);
  store1(ray, next.x); store1(ray + 1u, next.y); store1(ray + 2u, next.z);
  store2(s + 4u, throughput.x); store2(s + 5u, throughput.y); store2(s + 6u, throughput.z);
  store2(s + 3u, select(0., 1., wet != crosses));
  store2(s + 7u, max(0., remaining - surfaceHit.distance - 2. * epsilon));
}
`;
