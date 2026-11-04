// SPDX-License-Identifier: Apache-2.0
// Thin data adapter. Clipper2 algorithms remain unchanged in clipper2-rust 1.2.0
// (BSL-1.0), crate archive SHA256 210e9ea90a5f6c731c23bf642383ad7c006d8b24803c5c33afd5aaeae5a33f66.
use std::cell::Cell;
use wasm_bindgen::prelude::*;
use clipper2_rust::{
    Clipper64, ClipperOffset, ClipType, EndType, FillRule, JoinType, Path64, Paths64,
    Point64, PolyFace64, PolyTree64, poly_tree_to_faces64,
};

thread_local! { static LIVE: Cell<u32> = const { Cell::new(0) }; }
#[wasm_bindgen]
pub fn live_sessions() -> u32 { LIVE.with(Cell::get) }
fn error(message: &str) -> JsValue { JsValue::from_str(message) }

fn filled(paths: &Paths64, rule: FillRule) -> Result<Paths64, JsValue> {
    if paths.is_empty() { return Ok(Vec::new()); }
    let mut engine = Clipper64::new();
    engine.add_subject(paths);
    let mut out = Vec::new();
    if !engine.execute(ClipType::Union, rule, &mut out, None) || engine.error_code() != 0 {
        return Err(error("E_PA_PATHOPS_CLIPPER: operand normalization failed"));
    }
    Ok(out)
}
fn tree(subject: &Paths64, clip: &Paths64, op: ClipType, rule: FillRule) -> Result<PolyTree64, JsValue> {
    let mut out = PolyTree64::new();
    if subject.is_empty() && clip.is_empty() { return Ok(out); }
    let mut engine = Clipper64::new();
    engine.add_subject(subject); engine.add_clip(clip);
    if !engine.execute_tree(op, rule, &mut out, &mut Vec::new()) || engine.error_code() != 0 {
        return Err(error("E_PA_PATHOPS_CLIPPER: boolean solve failed"));
    }
    Ok(out)
}

/// Stage-local owned geometry session behind the existing wasm-bindgen data Kit.
/// Input/output are chunked; there is no new Stage, timeline, scheduler or renderer.
#[wasm_bindgen]
pub struct Engine {
    grid: f64, origin: [f64; 2], configured: bool,
    current: Path64, operand: Paths64, operands: Vec<Paths64>, faces: Vec<PolyFace64>, strokes: Vec<(Path64,bool)>,
    input_points: u32, collapsed: u32,
}
impl Drop for Engine {
    fn drop(&mut self) { LIVE.with(|n| n.set(n.get().saturating_sub(1))); }
}
#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        LIVE.with(|n| n.set(n.get() + 1));
        Self {grid: 1.0, origin: [0.0,0.0], configured: false, current: Vec::new(),
            operand: Vec::new(), operands: Vec::new(), faces: Vec::new(), strokes: Vec::new(), input_points: 0, collapsed: 0}
    }
    /// Start a new solve using an explicit physical-pixel integer grid and floating origin.
    pub fn begin(&mut self, grid: f64, origin_x: f64, origin_y: f64) -> Result<(), JsValue> {
        if !grid.is_finite() || grid <= 0.0 || !origin_x.is_finite() || !origin_y.is_finite() {
            return Err(error("E_PA_PATHOPS_GRID: finite positive grid and finite origin required"));
        }
        self.reset(); self.grid = grid; self.origin = [origin_x,origin_y]; self.configured = true; Ok(())
    }
    /// Append interleaved physical x/y values to the current contour; no whole-input transport cap is added.
    pub fn append(&mut self, values: &[f64], finish: bool) -> Result<(), JsValue> {
        if !self.configured || values.len() % 2 != 0 { return Err(error("E_PA_PATHOPS_INPUT: begin first; expected x/y pairs")); }
        let mut converted = Vec::new();
        converted.try_reserve(values.len()/2).map_err(|_| error("E_PA_PATHOPS_MEMORY: input allocation failed"))?;
        for p in values.chunks_exact(2) {
            let x = (p[0]-self.origin[0])/self.grid;
            let y = (p[1]-self.origin[1])/self.grid;
            // Uniform exact-integer transport domain with one scaling/rounding guard bit,
            // tighter than Clipper's i64 storage domain. This is a numeric limit, not a path-count cap.
            if !x.is_finite() || !y.is_finite() || x.abs() > 4503599627370495.0 || y.abs() > 4503599627370495.0 {
                return Err(error("E_PA_PATHOPS_GRID: scaled coordinate exceeds exact f64 integer domain; use a coarser grid"));
            }
            converted.push(Point64::new(x.round() as i64,y.round() as i64));
        }
        self.current.try_reserve(converted.len()).map_err(|_| error("E_PA_PATHOPS_MEMORY: contour allocation failed"))?;
        for p in converted { if self.current.last() != Some(&p) { self.current.push(p); } }
        self.input_points = self.input_points.checked_add((values.len()/2) as u32).ok_or_else(|| error("E_PA_PATHOPS_MEMORY: wasm point counter overflow"))?;
        if finish {
            if self.current.len()>1 && self.current.first()==self.current.last() { self.current.pop(); }
            if self.current.len() >= 3 { self.operand.push(std::mem::take(&mut self.current)); }
            else { if !self.current.is_empty() {self.collapsed+=1;} self.current=Vec::new(); }
        }
        Ok(())
    }
    /// Normalize one PathData operand with its own fill rule before combining operands.
    /// Rule 0=nonzero, 1=evenodd; overlapping independent operands never cancel by winding accident.
    pub fn finish_operand(&mut self, rule: u32) -> Result<(), JsValue> {
        if !self.configured || !self.current.is_empty() { return Err(error("E_PA_PATHOPS_INPUT: finish the current contour first")); }
        let rule = match rule {0=>FillRule::NonZero,1=>FillRule::EvenOdd,_=>return Err(error("E_PA_PATHOPS_FILL: unsupported fill rule"))};
        self.operands.push(filled(&std::mem::take(&mut self.operand),rule)?); Ok(())
    }
    /// Finish a raw centerline contour. Unlike filled operands, two distinct open points are valid.
    pub fn finish_stroke_contour(&mut self, closed: bool) -> Result<(), JsValue> {
        if !self.configured || !self.operand.is_empty() || !self.operands.is_empty() {return Err(error("E_PA_PATHOPS_INPUT: mixed stroke/fill operands"));}
        if closed && self.current.len()>1 && self.current.first()==self.current.last() {self.current.pop();}
        if self.current.len()>=if closed {3}else{2} {self.strokes.push((std::mem::take(&mut self.current),closed));}
        else {if !self.current.is_empty(){self.collapsed+=1;}self.current=Vec::new();}
        Ok(())
    }
    /// Convert raw centerlines to true filled stroke outlines. width is full physical pixel width.
    /// Open caps 0=butt,1=round,2=square; closed paths use Joined, never Polygon filling.
    pub fn stroke(&mut self, width: f64, cap: u32, join: u32, miter: f64, arc_tolerance: f64) -> Result<u32,JsValue> {
        if !self.configured || !self.current.is_empty() || !self.operand.is_empty() || !self.operands.is_empty(){return Err(error("E_PA_PATHOPS_INPUT: unfinished or mixed stroke input"));}
        if !width.is_finite()||width<0.0||!miter.is_finite()||miter<1.0||!arc_tolerance.is_finite()||arc_tolerance<=0.0{return Err(error("E_PA_PATHOPS_STROKE: finite width>=0, miter>=1 and positive arc tolerance required"));}
        let end=match cap {0=>EndType::Butt,1=>EndType::Round,2=>EndType::Square,_=>return Err(error("E_PA_PATHOPS_CAP: unsupported cap"))};
        let join=match join {0=>JoinType::Miter,1=>JoinType::Round,2=>JoinType::Bevel,3=>JoinType::Square,_=>return Err(error("E_PA_PATHOPS_JOIN: unsupported join"))};
        self.faces=Vec::new();if width==0.0||self.strokes.is_empty(){return Ok(0);}
        let delta=width/(2.0*self.grid);let tolerance=arc_tolerance/self.grid;
        if !delta.is_finite()||!tolerance.is_finite()||delta<0.5{return Err(error("E_PA_PATHOPS_GRID: stroke width is below integer-grid resolution or scaled width overflows; use a resolvable finer grid"));}
        let extent=self.strokes.iter().flat_map(|(p,_)|p.iter()).map(|p|(p.x as f64).abs().max((p.y as f64).abs())).fold(0.0_f64,f64::max);
        let reach=delta*if join==JoinType::Miter{miter.max(2.0)}else{2.0};
        if !reach.is_finite()||extent+reach>4503599627370495.0{return Err(error("E_PA_PATHOPS_GRID: stroke/join reach exceeds guarded integer domain"));}
        let mut engine=ClipperOffset::new(miter,tolerance,false,false);
        for (path,closed) in &self.strokes {engine.add_path(path,join,if *closed{EndType::Joined}else{end});}
        let mut result=PolyTree64::new();engine.execute_tree(delta,&mut result);
        if engine.error_code()!=0{return Err(error("E_PA_PATHOPS_CLIPPER: stroke solve failed"));}
        self.faces=poly_tree_to_faces64(&result);Ok(self.faces.len() as u32)
    }
    /// Boolean modes: 0 union, 1 intersection, 2 first-minus-rest, 3 xor.
    pub fn boolean(&mut self, operation: u32) -> Result<u32, JsValue> {
        if !self.configured || !self.current.is_empty() || !self.operand.is_empty() || !self.strokes.is_empty() {return Err(error("E_PA_PATHOPS_INPUT: unfinished or mixed operand"));}
        if operation>3 {return Err(error("E_PA_PATHOPS_OPERATION: unsupported boolean"));}
        let mut iter=std::mem::take(&mut self.operands).into_iter();
        let first=iter.next().unwrap_or_default();
        let result=if operation==1 {
            let mut aggregate=first;
            for next in iter {
                if aggregate.is_empty() {break;}
                let mut engine=Clipper64::new(); engine.add_subject(&aggregate); engine.add_clip(&next);
                let mut out=Vec::new();
                if !engine.execute(ClipType::Intersection,FillRule::NonZero,&mut out,None)||engine.error_code()!=0 {return Err(error("E_PA_PATHOPS_CLIPPER: intersection failed"));}
                aggregate=out;
            }
            tree(&aggregate,&Vec::new(),ClipType::Union,FillRule::NonZero)?
        } else if operation==2 {
            let rest:Paths64=iter.flatten().collect(); tree(&first,&rest,ClipType::Difference,FillRule::NonZero)?
        } else {
            let all:Paths64=std::iter::once(first).chain(iter).flatten().collect();
            tree(&all,&Vec::new(),ClipType::Union,if operation==3 {FillRule::EvenOdd}else{FillRule::NonZero})?
        };
        self.faces=poly_tree_to_faces64(&result); Ok(self.faces.len() as u32)
    }
    /// Offset the already-normalized union. Positive expands filled regions, negative insets them.
    /// Joins 0=miter, 1=round, 2=bevel, 3=square; tolerances are physical pixels.
    pub fn offset(&mut self, distance: f64, join: u32, miter: f64, arc_tolerance: f64) -> Result<u32, JsValue> {
        if !distance.is_finite() || !miter.is_finite() || miter<1.0 || !arc_tolerance.is_finite() || arc_tolerance<=0.0 {
            return Err(error("E_PA_PATHOPS_OFFSET: finite distance, miter>=1 and positive arc tolerance required"));
        }
        let delta=distance/self.grid;let tolerance=arc_tolerance/self.grid;
        if !delta.is_finite()||!tolerance.is_finite()||delta.abs()>4503599627370495.0 {return Err(error("E_PA_PATHOPS_GRID: scaled offset exceeds numeric domain"));}
        self.boolean(0)?;
        let paths:Paths64=self.faces.iter().flat_map(|face|std::iter::once(face.outer.clone()).chain(face.holes.clone())).collect();
        let join=match join {0=>JoinType::Miter,1=>JoinType::Round,2=>JoinType::Bevel,3=>JoinType::Square,_=>return Err(error("E_PA_PATHOPS_JOIN: unsupported join"))};
        if paths.is_empty(){return Ok(0);}
        let extent=paths.iter().flatten().map(|p|(p.x as f64).abs().max((p.y as f64).abs())).fold(0.0_f64,f64::max);
        let reach=delta.abs()*if join==JoinType::Miter{miter.max(2.0)}else{2.0};
        if !reach.is_finite()||extent+reach>4503599627370495.0 {return Err(error("E_PA_PATHOPS_GRID: offset/join reach exceeds the guarded integer domain"));}
        let mut engine=ClipperOffset::new(miter,tolerance,false,false);
        engine.add_paths(&paths,join,EndType::Polygon);
        let mut result=PolyTree64::new();engine.execute_tree(delta,&mut result);
        if engine.error_code()!=0 {return Err(error("E_PA_PATHOPS_CLIPPER: offset failed"));}
        self.faces=poly_tree_to_faces64(&result);Ok(self.faces.len() as u32)
    }
    /// Returns point counts for the solid outer ring followed by each immediate hole.
    pub fn face_info(&self, face: u32) -> Result<Vec<f64>, JsValue> {
        let face=self.faces.get(face as usize).ok_or_else(||error("E_PA_PATHOPS_OUTPUT: unknown face"))?;
        Ok(std::iter::once(face.outer.len() as f64).chain(face.holes.iter().map(|p|p.len() as f64)).collect())
    }
    /// Read a bounded transport chunk. The caller never sees Rust pointers or a live memory view.
    pub fn read_contour(&self, face: u32, contour: u32, start: u32, count: u32) -> Result<Vec<f64>, JsValue> {
        let face=self.faces.get(face as usize).ok_or_else(||error("E_PA_PATHOPS_OUTPUT: unknown face"))?;
        let path=if contour==0 {&face.outer}else{face.holes.get(contour as usize-1).ok_or_else(||error("E_PA_PATHOPS_OUTPUT: unknown hole"))?};
        let end=(start as usize).checked_add(count as usize).ok_or_else(||error("E_PA_PATHOPS_OUTPUT: range overflow"))?;
        let slice=path.get(start as usize..end).ok_or_else(||error("E_PA_PATHOPS_OUTPUT: invalid range"))?;
        Ok(slice.iter().flat_map(|p|[p.x as f64*self.grid+self.origin[0],p.y as f64*self.grid+self.origin[1]]).collect())
    }
    pub fn input_points(&self) -> u32 { self.input_points }
    pub fn collapsed_contours(&self) -> u32 { self.collapsed }
    /// Release owned geometry after consumption/error without destroying the reusable Kit session.
    pub fn reset(&mut self) {
        self.current=Vec::new();self.operand=Vec::new();self.operands=Vec::new();self.faces=Vec::new();self.strokes=Vec::new();
        self.input_points=0;self.collapsed=0;self.configured=false;
    }
}
