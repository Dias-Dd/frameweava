use serde::Deserialize;
use std::collections::HashMap;
#[derive(Clone,Debug,Deserialize,PartialEq)]#[serde(rename_all="camelCase",deny_unknown_fields)]pub struct Scene{pub version:u32,#[serde(default="backend")]pub backend:String,pub quality:String,pub invalid_geometry:String,pub transforms:usize,pub geometries:Vec<Geometry>}
#[derive(Clone,Debug,Deserialize,PartialEq)]#[serde(deny_unknown_fields)]pub struct Geometry{pub positions:usize,pub indices:Option<usize>,pub count:u32,pub mask:u8,pub id:u32}
fn backend()->String{"vulkan".into()}
impl Scene{
 /// Vulkan instances may share storage and BLAS only when they use the same buffers and triangle range.
 pub fn blas_layout(&self) -> (Vec<usize>, Vec<usize>) {
  let mut seen = HashMap::new();
  let mut sources = Vec::new();
  let mut instances = Vec::with_capacity(self.geometries.len());
  for (index, g) in self.geometries.iter().enumerate() {
   instances.push(*seen.entry((g.positions, g.indices, g.count)).or_insert_with(|| {
    let slot = sources.len();
    sources.push(index);
    slot
   }));
  }
  (sources, instances)
 }
 pub fn private_bytes(&self) -> Result<u64, String> {
  let (sources, _) = if self.backend == "vulkan" {
   self.blas_layout()
  } else {
   ((0..self.geometries.len()).collect(), Vec::new())
  };
  let instances = (self.geometries.len() as u64).checked_mul(96).and_then(|n| n.checked_add(4))
   .ok_or("E_NATIVE_RAY_BUDGET: instance byte overflow")?;
  sources.into_iter().try_fold(instances, |sum, i| {
   sum.checked_add(u64::from(self.geometries[i].count) * 12)
    .ok_or("E_NATIVE_RAY_BUDGET: geometry byte overflow".into())
  })
 }
 pub fn validate(&self,p:&crate::protocol::Program,binary_words:Option<u64>)->Result<(),String>{if self.version!=1||!matches!(self.backend.as_str(),"vulkan"|"optix")||self.quality!="trace"&&self.quality!="build"||self.invalid_geometry!="discard"||self.geometries.is_empty(){return Err("E_NATIVE_RAY_SCHEMA: expected opaque triangle scene v1".into());}let t=p.data.get(self.transforms).ok_or("E_NATIVE_RAY_TRANSFORM: missing matrix data")?;if t.r#type!="f32"||binary_words.unwrap_or(t.initial.len()as u64)!=self.geometries.len()as u64*12||t.source_image.is_some()||t.persistent.is_some(){return Err("E_NATIVE_RAY_TRANSFORM: finite CPU-declared affine matrices required".into());}if binary_words.is_none(){for i in 0..self.geometries.len(){matrix(&t.initial[i*12..i*12+12])?;}}for g in &self.geometries{let v=p.data.get(g.positions).ok_or("E_NATIVE_RAY_GEOMETRY: missing positions")?;let n=if let Some(i)=g.indices{let indices=p.data.get(i).ok_or("E_NATIVE_RAY_GEOMETRY: missing indices")?;if indices.r#type!="u32"{return Err("E_NATIVE_RAY_GEOMETRY: indices must be u32".into());}indices.length}else{v.length/3};if v.r#type!="f32"||v.length%3!=0||g.count<3||g.count%3!=0||u64::from(g.count)>n||g.id>0xffffff{return Err("E_NATIVE_RAY_GEOMETRY: invalid vertex/index/count/id layout".into());}}Ok(())}
}
pub fn matrix(words:&[u32])->Result<([f32;12],f32),String>{let a:[f32;12]=std::array::from_fn(|i|f32::from_bits(words[i]));if a.iter().any(|v|!v.is_finite()){return Err("E_NATIVE_RAY_TRANSFORM: non-finite matrix".into());}let m=a.map(f64::from);let c=[m[5]*m[10]-m[6]*m[9],m[6]*m[8]-m[4]*m[10],m[4]*m[9]-m[5]*m[8],m[2]*m[9]-m[1]*m[10],m[0]*m[10]-m[2]*m[8],m[1]*m[8]-m[0]*m[9],m[1]*m[6]-m[2]*m[5],m[2]*m[4]-m[0]*m[6],m[0]*m[5]-m[1]*m[4]];let det=m[0]*c[0]+m[1]*c[1]+m[2]*c[2];if det==0.||!det.is_finite()||c.iter().any(|v|!((*v/det)as f32).is_finite())||(0..3).any(|i|!(((c[i]*m[3]+c[3+i]*m[7]+c[6+i]*m[11])/det)as f32).is_finite()){return Err("E_NATIVE_RAY_TRANSFORM: inverse must be finite and representable as F32".into());}Ok((a,det.signum()as f32))}
