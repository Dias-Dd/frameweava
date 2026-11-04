// SPDX-License-Identifier: Apache-2.0
use std::cell::Cell;
use wasm_bindgen::prelude::*;
use lyon_tessellation::{path::{Path, math::point}, FillTessellator, FillOptions, VertexBuffers, BuffersBuilder, FillVertex};
thread_local! { static LIVE: Cell<u32> = const { Cell::new(0) }; }
#[wasm_bindgen(module = "/js/host.js")]
extern "C" { fn report_measure(value: f64) -> f64; fn report_count() -> u32; }
#[wasm_bindgen]
pub struct Engine { calls: u32 }
impl Drop for Engine { fn drop(&mut self) { LIVE.with(|live| live.set(live.get()-1)); } }
#[wasm_bindgen]
pub fn live_sessions() -> u32 { LIVE.with(Cell::get) }
#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Engine { LIVE.with(|live| live.set(live.get()+1)); Engine { calls: 0 } }
    /// Tessellate 3..128 finite XY pairs in [-4096,4096]. Returns flat triangle XY coordinates.
    pub fn tessellate(&mut self, coordinates: &[f32]) -> Result<Vec<f32>, JsValue> {
        if coordinates.len()<6 || coordinates.len()>256 || coordinates.len()%2!=0 || coordinates.iter().any(|v| !v.is_finite() || v.abs()>4096.0) {
            return Err(JsValue::from_str("Expected 3..128 finite coordinate pairs"));
        }
        let mut builder=Path::builder(); builder.begin(point(coordinates[0],coordinates[1]));
        for pair in coordinates[2..].chunks_exact(2) { builder.line_to(point(pair[0],pair[1])); } builder.close();
        let path=builder.build(); let mut geometry: VertexBuffers<[f32;2],u32>=VertexBuffers::new();
        FillTessellator::new().tessellate_path(&path,&FillOptions::default(),&mut BuffersBuilder::new(&mut geometry,|vertex:FillVertex|vertex.position().to_array()))
            .map_err(|_| JsValue::from_str("Lyon tessellation failed"))?;
        self.calls+=1; report_measure(geometry.indices.len() as f64);
        Ok(geometry.indices.iter().flat_map(|index| geometry.vertices[*index as usize]).collect())
    }
    pub fn calls(&self) -> u32 { self.calls }
    pub fn host_calls(&self) -> u32 { report_count() }
}
