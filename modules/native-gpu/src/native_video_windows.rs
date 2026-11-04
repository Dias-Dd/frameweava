use crate::{external_windows as external,protocol::{ImageImport,Image,VideoFrame}};
use std::{collections::BTreeMap,ffi::OsStr,os::windows::{ffi::OsStrExt,fs::OpenOptionsExt},fs::{File,OpenOptions},path::Path};
use serde::Deserialize;use sha2::{Digest,Sha256};
#[repr(C)]struct Config{version:u32,width:u32,height:u32,source_width:u32,source_height:u32,ten_bit:u32,transfer:u32,primaries:u32,matrix:[f32;12],reference_white:f32,peak_nits:f32,hlg_gamma:f32,reserved:f32}
#[derive(Default)]#[repr(C)]struct Lease{version:u32,width:u32,height:u32,reserved:u32,texture:usize,fence:usize}
type Open=unsafe extern "C" fn(u64)->u64;type Close=unsafe extern "C" fn(u64)->i32;
type VideoOpen=unsafe extern "C" fn(u64,*const u16,*const Config)->u64;
type Surface=unsafe extern "C" fn(u64,u32,*mut Lease)->i32;
type Frame=unsafe extern "C" fn(u64,u32,u64,i64,u64,u64)->i32;
type Error=unsafe extern "C" fn(*mut u8,u32)->u32;
#[derive(Deserialize)]#[serde(deny_unknown_fields)]struct Receipt{version:u32,abi:u32,trusted_local:bool,#[serde(default)]features:Vec<String>,files:BTreeMap<String,String>,#[serde(rename="sourceHashes")]_source_hashes:serde_json::Value,#[serde(rename="wallMs")]_wall_ms:f64}
struct Library{_library:libloading::Library,_file:File,owner:u64,close:Close,open_video:VideoOpen,surface:Surface,frame:Frame,error:Error}
impl Library{
 unsafe fn load(luid:u64)->Result<Self,String>{
  let root=std::fs::canonicalize(std::env::var_os("FRAMEWEAVE_MEDIA_RUNTIME").ok_or("E_NATIVE_MEDIA_MISSING: explicitly build/configure the reviewed local media helper")?).map_err(|e|format!("E_NATIVE_MEDIA_MISSING: {e}"))?;
  let r:Receipt=serde_json::from_slice(&std::fs::read(root.join("media-runtime.json")).map_err(|e|format!("E_NATIVE_MEDIA_INTEGRITY: {e}"))?).map_err(|e|format!("E_NATIVE_MEDIA_INTEGRITY: {e}"))?;
  if r.features.iter().any(|f|f!="diagnostics")||r.features.iter().any(|f|f=="diagnostics")&&!cfg!(feature="diagnostics"){return Err("E_NATIVE_MEDIA_DIAGNOSTICS: diagnostic helper cannot run in a production owner".into());}
  if r.version!=1||r.abi!=1||!r.trusted_local||r.files.len()!=1||!r.files.contains_key("frameweave_media.dll"){return Err("E_NATIVE_MEDIA_INTEGRITY: exact reviewed local receipt required".into());}
  let path=root.join("frameweave_media.dll");let mut file=OpenOptions::new().read(true).share_mode(1).open(&path).map_err(|e|format!("E_NATIVE_MEDIA_INTEGRITY: {e}"))?;let mut h=Sha256::new();{use std::io::Read;let mut bytes=[0;65536];loop{let n=file.read(&mut bytes).map_err(|e|e.to_string())?;if n==0{break;}h.update(&bytes[..n]);}}if format!("{:x}",h.finalize())!=r.files["frameweave_media.dll"]{return Err("E_NATIVE_MEDIA_INTEGRITY: helper bytes changed".into());}
  let lib=libloading::os::windows::Library::load_with_flags(&path,0x00000100|0x00000800).map_err(|e|format!("E_NATIVE_MEDIA_LOAD: {e}"))?;let library:libloading::Library=lib.into();
  let open:Open=*library.get(b"fw_media_open").map_err(|e|e.to_string())?;let close:Close=*library.get(b"fw_media_close").map_err(|e|e.to_string())?;let error:Error=*library.get(b"fw_media_error").map_err(|e|e.to_string())?;let owner=open(luid);if owner==0{return Err(Self::message(error));}
  Ok(Self{close,error,owner,open_video:*library.get(b"fw_video_open").map_err(|e|e.to_string())?,surface:*library.get(b"fw_video_surface").map_err(|e|e.to_string())?,frame:*library.get(b"fw_video_frame").map_err(|e|e.to_string())?,_library:library,_file:file})
 }
 unsafe fn message(error:Error)->String{let mut bytes=[0;8192];let n=error(bytes.as_mut_ptr(),bytes.len()as u32).min(bytes.len()as u32);format!("E_NATIVE_HARDWARE_VIDEO: {}",String::from_utf8_lossy(&bytes[..n as usize]))}
 unsafe fn check(&self,status:i32)->Result<(),String>{if status<0{Err(Self::message(self.error))}else{Ok(())}}
}
impl Drop for Library{fn drop(&mut self){unsafe{(self.close)(self.owner);}}}
struct Shared{texture:wgpu::Texture,fence:ash::vk::Semaphore,next:u64}
struct Source{id:u64,definition:VideoFrame,size:(u32,u32),file:String,_locked:File,slots:BTreeMap<usize,Shared>}
#[path="native_encode_windows.rs"] mod encode;
use encode::Encoded;
pub struct Videos{encoded:Option<Encoded>,enabled:bool,luid:u64,library:Option<Library>,sources:BTreeMap<String,Source>,pipeline:Option<wgpu::ComputePipeline>,device:Option<wgpu::Device>,calls:u64}
impl Videos{
 pub fn new(enabled:bool,luid:u64)->Self{Self{encoded:None,enabled,luid,library:None,sources:BTreeMap::new(),pipeline:None,device:None,calls:0}}
 pub fn execute(&mut self,device:&wgpu::Device,queue:&wgpu::Queue,root:&Path,item:&ImageImport,info:&Image,slot:usize,output:&wgpu::Buffer,encoder:wgpu::CommandEncoder)->Result<wgpu::CommandEncoder,String>{unsafe{
  if !self.enabled{return Err("E_NATIVE_VIDEO_UNAVAILABLE: native owner lacks external float images/fences".into());}if self.library.is_none(){self.library=Some(Library::load(self.luid)?);self.device=Some(device.clone());}
  let frame=item.video.as_ref().ok_or("E_NATIVE_VIDEO_PROTOCOL: missing frame descriptor")?;let stream=item.stream.as_ref().ok_or("E_NATIVE_VIDEO_PROTOCOL: missing stream identity")?;
  let mut definition=frame.clone();definition.frame=0;definition.pts=0;
  let lib=self.library.as_ref().unwrap();
  if let Some(old)=self.sources.get(stream){if old.definition!=definition||old.file!=item.file||old.size!=(info.width,info.height){return Err("E_NATIVE_VIDEO_RECONFIGURE: hardware source/colour/layout are owner-immutable".into());}}
  else{
   let path=root.join(&item.file);let locked=OpenOptions::new().read(true).share_mode(1).open(&path).map_err(|e|format!("E_NATIVE_VIDEO_IO: {e}"))?;let path=OsStr::new(&path).encode_wide().chain(Some(0)).collect::<Vec<_>>();
   let config=Config{version:1,width:info.width,height:info.height,source_width:frame.width,source_height:frame.height,ten_bit:u32::from(frame.ten_bit),transfer:frame.transfer,primaries:frame.primaries,matrix:frame.matrix,reference_white:frame.reference_white,peak_nits:frame.peak_nits,hlg_gamma:frame.hlg_gamma,reserved:0.};
   let id=(lib.open_video)(lib.owner,path.as_ptr(),&config);if id==0{return Err(Library::message(lib.error));}
   self.sources.insert(stream.clone(),Source{id,definition,size:(info.width,info.height),file:item.file.clone(),_locked:locked,slots:BTreeMap::new()});
  }
  let source=self.sources.get_mut(stream).unwrap();
  if !source.slots.contains_key(&slot){let mut lease=Lease::default();lib.check((lib.surface)(source.id,slot as u32,&mut lease))?;if lease.version!=1||lease.width!=info.width||lease.height!=info.height{return Err("E_NATIVE_VIDEO_ABI: wrong float Surface lease".into());}
   let texture=external::import_rgba32f(device,lease.texture,info.width,info.height).map_err(|e|format!("E_NATIVE_VIDEO_INTEROP: {e}"))?;let fence=external::import_fence(device,lease.fence).map_err(|e|format!("E_NATIVE_VIDEO_INTEROP: {e}"))?;source.slots.insert(slot,Shared{texture,fence,next:0});}
  let shared=source.slots.get_mut(&slot).unwrap();let ready=shared.next.checked_add(1).ok_or("E_NATIVE_VIDEO_FENCE: exhausted")?;let done=ready.checked_add(1).ok_or("E_NATIVE_VIDEO_FENCE: exhausted")?;
  lib.check((lib.frame)(source.id,slot as u32,frame.frame,frame.pts,shared.next,ready))?;
  // Drain preceding recorded commands before switching queue ownership.
  queue.submit([encoder.finish()]);
  if self.pipeline.is_none(){self.pipeline=Some(crate::gpu::compute(device,&format!("{}{}",include_str!("half.wgsl"),r#"
@group(0)@binding(0)var image:texture_2d<f32>;
@group(0)@binding(1)var<storage,read_write>output:array<vec4f>;
@group(0)@binding(2)var<uniform>p:vec4u;
@compute @workgroup_size(8,8)fn main(@builtin(global_invocation_id)g:vec3u){if(g.x>=p.x||g.y>=p.y){return;}var v=textureLoad(image,vec2i(g.xy),0);if(p.z==1u){v=vec4f(half(v.r),half(v.g),half(v.b),1.);}output[g.y*p.x+g.x]=v;}
"#),"main"));}
  let data=[info.width,info.height,u32::from(info.format=="rgba16float"),0];use wgpu::util::DeviceExt;let uniform=device.create_buffer_init(&wgpu::util::BufferInitDescriptor{label:Some("video/float-contract"),contents:&crate::protocol::words(&data),usage:wgpu::BufferUsages::UNIFORM});
  let pipeline=self.pipeline.as_ref().unwrap();let view=shared.texture.create_view(&Default::default());let group=device.create_bind_group(&wgpu::BindGroupDescriptor{label:Some("video/resident-surface"),layout:&pipeline.get_bind_group_layout(0),entries:&[wgpu::BindGroupEntry{binding:0,resource:wgpu::BindingResource::TextureView(&view)},wgpu::BindGroupEntry{binding:1,resource:output.as_entire_binding()},wgpu::BindGroupEntry{binding:2,resource:uniform.as_entire_binding()}]});
  let mut encoder=device.create_command_encoder(&Default::default());{let mut pass=encoder.begin_compute_pass(&Default::default());pass.set_pipeline(pipeline);pass.set_bind_group(0,&group,&[]);pass.dispatch_workgroups(info.width.div_ceil(8),info.height.div_ceil(8),1);}
  external::general(&mut encoder,&shared.texture);let acquire=external::ownership(device,&shared.texture,true);let release=external::ownership(device,&shared.texture,false);external::wait(queue,shared.fence,ready);external::signal(queue,shared.fence,done);queue.submit([acquire,encoder.finish(),release]);shared.next=done;self.calls+=1;
  Ok(device.create_command_encoder(&Default::default()))
 }}
 /// Reconfiguration occurs only after all admitted frame slots complete.
 pub fn retain_program(&mut self,device:&wgpu::Device,program:&crate::protocol::Program)->Result<(),String>{unsafe{
  if self.library.is_none()||program.state_continuation{return Ok(());}
  self.check_encoder(program)?;
  // One owner-idle lifetime barrier, never a per-frame numerical/readback wait.
  device.poll(wgpu::PollType::wait_indefinitely()).map_err(|e|e.to_string())?;
  let lib=self.library.as_ref().unwrap();type Trim=unsafe extern "C" fn(u64,u32)->i32;
  let close:Close=*lib._library.get(b"fw_video_close").map_err(|e|e.to_string())?;
  let trim:Trim=*lib._library.get(b"fw_video_slots").map_err(|e|e.to_string())?;
  let obsolete=self.sources.iter().filter_map(|(stream,source)|{
   let keep=program.imports.iter().any(|i|i.source.as_deref()==Some("hardware-video")&&i.stream.as_ref()==Some(stream)&&i.file==source.file&&i.video.as_ref().is_some_and(|v|{let mut a=v.clone();a.frame=0;a.pts=0;a==source.definition})&&program.images.get(i.image).is_some_and(|v|(v.width,v.height)==source.size));
   (!keep).then(||stream.clone())
  }).collect::<Vec<_>>();
  for stream in obsolete{let mut source=self.sources.remove(&stream).unwrap();for shared in source.slots.values(){external::destroy_fence(device,shared.fence);}source.slots.clear();lib.check(close(source.id))?;}
  for source in self.sources.values_mut(){let retired=source.slots.keys().copied().filter(|&s|s>=program.slots).collect::<Vec<_>>();for slot in retired{let shared=source.slots.remove(&slot).unwrap();external::destroy_fence(device,shared.fence);}lib.check(trim(source.id,program.slots as u32))?;}
  self.resize_encoder(device,program.slots)?;Ok(())
 }}
 pub fn has_encoder(&self)->bool{self.encoded.is_some()}
 pub fn stats(&self)->serde_json::Value{serde_json::json!({"version":1,"loaded":self.library.is_some(),"sources":self.sources.len(),"residentSlots":self.sources.values().map(|s|s.slots.len()).sum::<usize>(),"driverManagedDecodeBytes":"unknown","requests":self.calls,"additionalD3D11Devices":u32::from(self.library.is_some()),"cpuPixelReadbacks":0,"cpuPixelUploads":0,"format":"rgba32float","timestampPolicy":"ordinal + source-relative PTS verification","blockingGpuFenceWaits":0})}
}
impl Drop for Videos{fn drop(&mut self){if let Some(device)=&self.device{unsafe{let _=device.poll(wgpu::PollType::wait_indefinitely());for source in self.sources.values_mut(){for shared in source.slots.values(){external::destroy_fence(device,shared.fence);}source.slots.clear();}}}self.sources.clear();self.drop_encoded();self.library.take();}}
