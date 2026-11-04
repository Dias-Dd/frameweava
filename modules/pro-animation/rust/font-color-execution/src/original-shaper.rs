// SPDX-License-Identifier: Apache-2.0
// Thin adapter to maintained HarfRust/Skrifa, NOT a reimplementation of shaping or font parsing.
use std::{cell::Cell,str::FromStr};
use wasm_bindgen::prelude::*;
use harfrust::{Font,ShaperFont,Buffer,Direction,Script,Language,Feature,ShapeOptions,GlyphId};
use skrifa::{PathSink,FontRef,MetadataProvider,instance::{Size,LocationRef},outline::{DrawSettings,pen::PathStyle}};
thread_local! {static LIVE:Cell<u32>=const{Cell::new(0)};}
#[wasm_bindgen]
pub fn live_sessions()->u32 {LIVE.with(Cell::get)}
fn error(message:impl AsRef<str>)->JsValue {JsValue::from_str(message.as_ref())}

#[derive(Default)]
struct Outline(Vec<f64>);
impl PathSink for Outline {
    fn move_to(&mut self,x:f32,y:f32){self.0.extend([1.0,x as f64,y as f64]);}
    fn line_to(&mut self,x:f32,y:f32){self.0.extend([2.0,x as f64,y as f64]);}
    fn quad_to(&mut self,cx:f32,cy:f32,x:f32,y:f32){self.0.extend([3.0,cx as f64,cy as f64,x as f64,y as f64]);}
    fn curve_to(&mut self,c1x:f32,c1y:f32,c2x:f32,c2y:f32,x:f32,y:f32){self.0.extend([4.0,c1x as f64,c1y as f64,c2x as f64,c2y as f64,x as f64,y as f64]);}
    fn close(&mut self){self.0.push(5.0);}
}
/// One owned font instance per existing Kit client. No font registry, OS font loader or downloads.
#[wasm_bindgen]
pub struct Engine {pending:Vec<u8>,base:Option<Font>,font:Option<Font>,face_index:u32,glyphs:Vec<f64>,outline:Vec<f64>}
impl Drop for Engine {fn drop(&mut self){LIVE.with(|v|v.set(v.get().saturating_sub(1)));}}
#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new()->Self {LIVE.with(|v|v.set(v.get()+1));Self{pending:Vec::new(),base:None,font:None,face_index:0,glyphs:Vec::new(),outline:Vec::new()}}
    pub fn begin_font(&mut self){self.pending=Vec::new();self.base=None;self.font=None;self.glyphs=Vec::new();self.outline=Vec::new();}
    pub fn append_font(&mut self,bytes:&[u8])->Result<(),JsValue>{
        if self.font.is_some(){return Err(error("E_PA_FONT_STATE: begin a font before appending"));}
        self.pending.try_reserve(bytes.len()).map_err(|_|error("E_PA_FONT_MEMORY: font allocation failed"))?;self.pending.extend_from_slice(bytes);Ok(())
    }
    pub fn finish_font(&mut self,face_index:u32)->Result<u32,JsValue>{
        self.base=None;self.font=None;self.glyphs=Vec::new();self.outline=Vec::new();
        let font=Font::new(std::mem::take(&mut self.pending),face_index).ok_or_else(||error("E_PA_FONT_PARSE: unsupported/malformed font or face index"))?;
        let upem=font.units_per_em();if upem==0{return Err(error("E_PA_FONT_PARSE: units per em must be positive"));}
        self.base=Some(font.clone());self.font=Some(font);self.face_index=face_index;Ok(upem as u32)
    }
    /// Absolute design-space settings, independent of the previous instance. E.g. wght=700,wdth=100.
    pub fn set_variations(&mut self,settings:&str)->Result<(),JsValue>{
        let base=self.base.as_ref().ok_or_else(||error("E_PA_FONT_STATE: font not loaded"))?;
        let mut values=Vec::new();
        if !settings.is_empty(){for setting in settings.split(','){
            let (tag,value)=setting.split_once('=').ok_or_else(||error("E_PA_FONT_VARIATION: expected tag=value"))?;
            if tag.len()!=4||!tag.is_ascii(){return Err(error("E_PA_FONT_VARIATION: four ASCII tag bytes required"));}
            let v:f32=value.parse().map_err(|_|error("E_PA_FONT_VARIATION: finite coordinate required"))?;
            if !v.is_finite(){return Err(error("E_PA_FONT_VARIATION: finite coordinate required"));}
            let axis=base.axes().iter().find(|a|a.tag().to_be_bytes()==tag.as_bytes()).ok_or_else(||error("E_PA_FONT_VARIATION: unknown font axis"))?;
            if v<axis.min_value()||v>axis.max_value(){return Err(error("E_PA_FONT_VARIATION: coordinate outside font axis range"));}
            if values.iter().any(|(previous,_)|*previous==tag){return Err(error("E_PA_FONT_VARIATION: duplicate axis"));}values.push((tag,v));
        }}
        self.font=Some(base.instance_builder().variations(values).build());self.glyphs=Vec::new();self.outline=Vec::new();Ok(())
    }
    /// Actual normalized 2.14 coordinates, useful for reproducible font-instance provenance.
    pub fn normalized_coords(&self)->Result<Vec<f64>,JsValue>{
        let font=self.font.as_ref().ok_or_else(||error("E_PA_FONT_STATE: font not loaded"))?;
        Ok(font.normalized_coords().iter().map(|v|v.to_f32() as f64).collect())
    }
    /// A single explicitly directed/scripted run, not paragraph bidi/itemization or fallback.
    /// Clusters enter as UTF-16 logical offsets; positions remain font units/y-up until the TS adapter maps them.
    pub fn shape_run(&mut self,text:&str,direction:u32,script:&str,language:&str,features:&str)->Result<u32,JsValue>{
        self.glyphs=Vec::new();self.outline=Vec::new();
        let font=self.font.as_ref().ok_or_else(||error("E_PA_FONT_STATE: font not loaded"))?;
        let direction=match direction{0=>Direction::LeftToRight,1=>Direction::RightToLeft,_=>return Err(error("E_PA_FONT_DIRECTION: explicit ltr or rtl required"))};
        if script.len()!=4||!script.bytes().all(|b|b.is_ascii_alphabetic()){return Err(error("E_PA_FONT_SCRIPT: explicit four-letter ISO15924 tag required"));}
        let script=Script::from_str(script).map_err(|_|error("E_PA_FONT_SCRIPT: invalid script"))?;
        let language=Language::new(language).ok_or_else(||error("E_PA_FONT_LANGUAGE: explicit language required"))?;
        let mut parsed=Vec::new();if !features.is_empty(){for item in features.split(','){parsed.push(Feature::from_str(item).map_err(|_|error("E_PA_FONT_FEATURE: invalid OpenType setting"))?);}}
        let mut buffer=Buffer::new();buffer.set_direction(direction);buffer.set_script(Some(script));buffer.set_language(Some(language));
        let mut cluster=0_u32;for ch in text.chars(){buffer.push(ch as u32,cluster);cluster=cluster.checked_add(ch.len_utf16() as u32).ok_or_else(||error("E_PA_FONT_RANGE: UTF16 range overflow"))?;}
        harfrust::shape(&ShaperFont::new(font),&mut buffer,ShapeOptions::new().features(&parsed)).map_err(|e|error(format!("E_PA_FONT_SHAPE: {e:?}")))?;
        let count=buffer.glyph_infos().len();self.glyphs.try_reserve(count.checked_mul(6).ok_or_else(||error("E_PA_FONT_MEMORY: glyph count overflow"))?).map_err(|_|error("E_PA_FONT_MEMORY: glyph allocation failed"))?;
        for (info,pos) in buffer.glyph_infos().iter().zip(buffer.glyph_positions()) {self.glyphs.extend([info.glyph_id as f64,info.cluster as f64,pos.x_advance as f64,pos.y_advance as f64,pos.x_offset as f64,pos.y_offset as f64]);}
        u32::try_from(count).map_err(|_|error("E_PA_FONT_RANGE: glyph count exceeds transport index"))
    }
    pub fn read_glyphs(&self,start:u32,count:u32)->Result<Vec<f64>,JsValue>{
        let a=(start as usize).checked_mul(6).ok_or_else(||error("E_PA_FONT_RANGE: overflow"))?;
        let size=(count as usize).checked_mul(6).ok_or_else(||error("E_PA_FONT_RANGE: overflow"))?;
        let b=a.checked_add(size).ok_or_else(||error("E_PA_FONT_RANGE: overflow"))?;
        Ok(self.glyphs.get(a..b).ok_or_else(||error("E_PA_FONT_RANGE: invalid glyph range"))?.to_vec())
    }
    pub fn outline_glyph(&mut self,glyph:u32)->Result<u32,JsValue>{
        self.outline=Vec::new();let font=self.font.as_ref().ok_or_else(||error("E_PA_FONT_STATE: font not loaded"))?;
        if glyph>=font.num_glyphs(){return Err(error("E_PA_FONT_GLYPH: glyph index outside loaded face"));}
        // The new ScalerFont path uses FreeType fixed arithmetic. The pinned library also
        // retains its public HarfBuzz-style FLOAT scaler; select it, without patching a crate.
        // Borrow the very same immutable bytes and normalized location used by the shaper.
        let raw=match font.source(){harfrust::font::Source::Blob(blob)=>FontRef::from_index(blob,self.face_index).map_err(|_|error("E_PA_FONT_OUTLINE: SFNT face required"))?,_=>return Err(error("E_PA_FONT_OUTLINE: byte-backed SFNT face required"))};
        let outlines=raw.outline_glyphs();let mut sink=Outline::default();
        if let Some(outline)=outlines.get(GlyphId::new(glyph)){
            let settings=DrawSettings::unhinted(Size::unscaled(),LocationRef::new(font.normalized_coords())).with_path_style(PathStyle::HarfBuzz);
            outline.draw(settings,&mut sink).map_err(|e|error(format!("E_PA_FONT_OUTLINE: {e:?}")))?;
        }
        self.outline=sink.0;u32::try_from(self.outline.len()).map_err(|_|error("E_PA_FONT_RANGE: outline exceeds transport index"))
    }
    pub fn read_outline(&self,start:u32,count:u32)->Result<Vec<f64>,JsValue>{
        let end=(start as usize).checked_add(count as usize).ok_or_else(||error("E_PA_FONT_RANGE: overflow"))?;
        Ok(self.outline.get(start as usize..end).ok_or_else(||error("E_PA_FONT_RANGE: invalid outline range"))?.to_vec())
    }
    pub fn reset_results(&mut self){self.glyphs=Vec::new();self.outline=Vec::new();}
}
