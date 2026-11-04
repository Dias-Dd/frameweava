// SPDX-License-Identifier: Apache-2.0
// op 1: LE f32 gain + LE u32 RGB invert mask + straight RGBA8 -> straight RGBA8.
pub fn run(op: u32, input: &[u8], output: &mut [u8]) -> Result<usize, i32> {
    if op != 1 { return Err(-3); }
    if input.len() < 12 || (input.len()-8) % 4 != 0 { return Err(-4); }
    let gain = f32::from_le_bytes(input[0..4].try_into().unwrap());
    let mask = u32::from_le_bytes(input[4..8].try_into().unwrap());
    if !gain.is_finite() || !(0.0..=2.0).contains(&gain) || mask > 7 { return Err(-4); }
    let pixels = &input[8..]; if output.len() < pixels.len() { return Err(-5); }
    for (source,target) in pixels.chunks_exact(4).zip(output.chunks_exact_mut(4)) {
        for channel in 0..3 { let base = if mask & (1 << channel) != 0 { 255-source[channel] } else { source[channel] };
            target[channel] = ((base as f32 * gain + 0.5).floor().min(255.0)) as u8; }
        target[3] = source[3];
    }
    Ok(pixels.len())
}
