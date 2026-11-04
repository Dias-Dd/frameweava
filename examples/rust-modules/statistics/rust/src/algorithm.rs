// SPDX-License-Identifier: Apache-2.0
// op 1: LE f32 gain, followed by 1..256 LE f32 samples -> sum, mean, min, max.
pub fn run(op: u32, input: &[u8], output: &mut [u8]) -> Result<usize, i32> {
    if op != 1 { return Err(-3); }
    if input.len() < 8 || input.len() % 4 != 0 || input.len() > 1028 { return Err(-4); }
    if output.len() < 16 { return Err(-5); }
    let gain = f32::from_le_bytes(input[0..4].try_into().unwrap());
    if !gain.is_finite() { return Err(-4); }
    let mut sum = 0.0f32; let mut min = f32::INFINITY; let mut max = f32::NEG_INFINITY;
    for bytes in input[4..].chunks_exact(4) {
        let value = f32::from_le_bytes(bytes.try_into().unwrap()) * gain;
        if !value.is_finite() { return Err(-4); }
        sum += value; min = min.min(value); max = max.max(value);
    }
    let result = [sum, sum / ((input.len() - 4) / 4) as f32, min, max];
    if result.iter().any(|v| !v.is_finite()) { return Err(-4); }
    for (i, value) in result.iter().enumerate() { output[i*4..i*4+4].copy_from_slice(&value.to_le_bytes()); }
    Ok(16)
}
