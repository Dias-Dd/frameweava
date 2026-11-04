// SPDX-License-Identifier: Apache-2.0
use std::cell::Cell;
use wasm_bindgen::prelude::*;
thread_local! { static LIVE: Cell<u32> = const { Cell::new(0) }; }
#[wasm_bindgen(module = "/js/host.js")]
extern "C" { fn normalize_label(value: &str) -> String; fn report_count() -> u32; }
#[wasm_bindgen]
pub struct Engine { calls: u32 }
impl Drop for Engine { fn drop(&mut self) { LIVE.with(|live| live.set(live.get()-1)); } }
#[wasm_bindgen]
pub fn live_sessions() -> u32 { LIVE.with(Cell::get) }
#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Engine { LIVE.with(|live| live.set(live.get()+1)); Engine { calls: 0 } }
    /// Up to 512 UTF-8 bytes and 1..128 nonnegative finite values. JS normalizes the label.
    pub fn normalize(&mut self, label: &str, values: &[f64]) -> Result<String, JsValue> {
        if label.len()>512 || values.is_empty() || values.len()>128 || values.iter().any(|v| !v.is_finite() || *v<0.0) { return Err(JsValue::from_str("Expected a short label and nonnegative finite values")); }
        self.calls+=1; Ok(format!("{}:{:.2}",normalize_label(label),values.iter().sum::<f64>()))
    }
    /// Scales at most 128 finite f64 values, factor in [0,4].
    pub fn scale(&mut self, values: &[f64], factor: f64) -> Result<Vec<f64>, JsValue> {
        if values.len()>128 || !factor.is_finite() || !(0.0..=4.0).contains(&factor) || values.iter().any(|v| !v.is_finite()) { return Err(JsValue::from_str("Invalid scale input")); }
        self.calls+=1; Ok(values.iter().map(|v|v*factor).collect())
    }
    pub fn calls(&self) -> u32 { self.calls }
    pub fn host_calls(&self) -> u32 { report_count() }
}
