//! Private direct GPU delivery, implemented on native_video's existing owner.
use super::*;
use crate::protocol::MediaExport;
#[repr(C)]struct Lut{width:u32,height:u32,channels:u32,linear:u32,values:*const f32}
#[repr(C)]struct EncodeConfig{version:u32,width:u32,height:u32,slots:u32,fps_num:u32,fps_den:u32,codec:u32,primaries:u32,transfer:u32,alpha:u32,matte:[f32;3],lut_count:u32,luts:*const Lut,shader:*const u8,shader_bytes:u32,hdr:u32,chromaticities:[u16;8],max_nits:u32,min_nits:u32,max_cll:u16,max_fall:u16}
type EncodeOpen=unsafe extern "C" fn(u64,*const u16,*const EncodeConfig)->u64;
type EncodeFrame=unsafe extern "C" fn(u64,u32,u64,u64)->i32;
type EncodePoll=unsafe extern "C" fn(u64,*mut Completion,u32)->i32;
type EncodeFinish=unsafe extern "C" fn(u64)->i32;
#[derive(Default,Clone,Copy)]#[repr(C)]struct Completion{slot:u32,reserved:u32,frame:u64}
pub(super) struct Encoded{spec:MediaExport,id:u64,slots:BTreeMap<usize,Shared>,surface:Surface,frame:EncodeFrame,poll:EncodePoll,finish:EncodeFinish,pipeline:wgpu::RenderPipeline,submitted:u64,completed:u64,bytes:u64}
impl Videos{
 pub fn configure_encoder(&mut self,device:&wgpu::Device,spec:&MediaExport,width:u32,height:u32,slots:usize)->Result<(),String>{unsafe{
  if self.encoded.is_some(){return Ok(());}
  if !self.enabled{return Err("E_NATIVE_MEDIA_UNAVAILABLE: owner has no external float-image capability".into());}
  if self.library.is_none(){self.library=Some(Library::load(self.luid)?);self.device=Some(device.clone());}let lib=self.library.as_ref().unwrap();let dll=&lib._library;
  let open:EncodeOpen=*dll.get(b"fw_encode_open").map_err(|e|format!("E_NATIVE_MEDIA_ABI: {e}"))?;
  let luts=spec.textures.iter().map(|t|Lut{width:t.width,height:t.height,channels:t.channels,linear:u32::from(t.linear),values:t.values.as_ptr()}).collect::<Vec<_>>();
  let h=spec.hdr.as_ref();let c=EncodeConfig{version:1,width,height,slots:slots as u32,fps_num:spec.fps[0],fps_den:spec.fps[1],codec:if spec.codec=="av1_nvenc"{2}else{1},primaries:spec.primaries,transfer:spec.transfer,alpha:spec.alpha,matte:spec.matte,lut_count:luts.len()as u32,luts:luts.as_ptr(),shader:spec.shader.as_ptr(),shader_bytes:spec.shader.len()as u32,hdr:u32::from(h.is_some()),chromaticities:h.map(|h|h.chromaticities).unwrap_or([0;8]),max_nits:h.map_or(0,|h|h.max_nits),min_nits:h.map_or(0,|h|h.min_nits),max_cll:h.map_or(0,|h|h.max_cll),max_fall:h.map_or(0,|h|h.max_fall)};
  let path=OsStr::new(&spec.output).encode_wide().chain(Some(0)).collect::<Vec<_>>();let id=open(lib.owner,path.as_ptr(),&c);if id==0{return Err(Library::message(lib.error));}
  let module=device.create_shader_module(wgpu::ShaderModuleDescriptor{label:Some("media/F32-resident-export"),source:wgpu::ShaderSource::Wgsl(r#"
@group(0)@binding(0)var<storage,read>pixels:array<vec4f>;
@group(0)@binding(1)var<uniform>p:vec4u;
@vertex fn vertex(@builtin(vertex_index)i:u32)->@builtin(position)vec4f{let v=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));return vec4f(v[i],0.,1.);}
@fragment fn fragment(@builtin(position)p0:vec4f)->@location(0)vec4f{let xy=vec2u(p0.xy);return pixels[xy.y*p.x+xy.x];}
"#.into())});
  let pipeline=device.create_render_pipeline(&wgpu::RenderPipelineDescriptor{label:Some("media/float-surface-interop"),layout:None,vertex:wgpu::VertexState{module:&module,entry_point:Some("vertex"),compilation_options:Default::default(),buffers:&[]},fragment:Some(wgpu::FragmentState{module:&module,entry_point:Some("fragment"),compilation_options:Default::default(),targets:&[Some(wgpu::ColorTargetState{format:wgpu::TextureFormat::Rgba32Float,blend:None,write_mask:wgpu::ColorWrites::ALL})]}),primitive:Default::default(),depth_stencil:None,multisample:Default::default(),multiview_mask:None,cache:None});
  self.encoded=Some(Encoded{spec:spec.clone(),id,slots:BTreeMap::new(),surface:*dll.get(b"fw_encode_surface").map_err(|e|e.to_string())?,frame:*dll.get(b"fw_encode_frame").map_err(|e|e.to_string())?,poll:*dll.get(b"fw_encode_poll").map_err(|e|e.to_string())?,finish:*dll.get(b"fw_encode_finish").map_err(|e|e.to_string())?,pipeline,submitted:0,completed:0,bytes:0});Ok(())
 }}
 pub(super) fn check_encoder(&self,program:&crate::protocol::Program)->Result<(),String>{
  if let Some(e)=&self.encoded{let spec=program.media_export.as_ref().ok_or("E_NATIVE_MEDIA_RECONFIGURE: cannot remove active encoder")?;let mut previous=e.spec.clone();previous.image=spec.image;let i=&program.images[spec.image];let size=e.slots.values().next().map(|s|(s.texture.width(),s.texture.height()));if previous!=*spec||size.is_some_and(|s|s!=(i.width,i.height)){return Err("E_NATIVE_MEDIA_RECONFIGURE: cannot replace active encoding/colour/layout policy".into());}}
  Ok(())
 }
 pub(super) fn resize_encoder(&mut self,device:&wgpu::Device,count:usize)->Result<(),String>{unsafe{
  let Some(e)=self.encoded.as_mut()else{return Ok(())};
  let retired=e.slots.keys().copied().filter(|&s|s>=count).collect::<Vec<_>>();for slot in retired{let shared=e.slots.remove(&slot).unwrap();external::destroy_fence(device,shared.fence);}
  type Resize=unsafe extern "C" fn(u64,u32)->i32;let lib=self.library.as_ref().unwrap();let resize:Resize=*lib._library.get(b"fw_encode_slots").map_err(|e|e.to_string())?;lib.check(resize(e.id,count as u32))?;Ok(())
 }}
 pub fn encode(&mut self,device:&wgpu::Device,queue:&wgpu::Queue,slot:usize,sequence:u64,image:&wgpu::Buffer,width:u32,height:u32,mut encoder:wgpu::CommandEncoder)->Result<(),String>{unsafe{
  let e=self.encoded.as_mut().ok_or("E_NATIVE_MEDIA_INIT: encoder not admitted")?;let lib=self.library.as_ref().unwrap();
  if !e.slots.contains_key(&slot){let mut lease=Lease::default();lib.check((e.surface)(e.id,slot as u32,&mut lease))?;if lease.version!=1||lease.width!=width||lease.height!=height{return Err("E_NATIVE_MEDIA_ABI: inconsistent float export lease".into());}let texture=external::import_rgba32f(device,lease.texture,width,height).map_err(|e|format!("E_NATIVE_MEDIA_INTEROP: {e}"))?;let fence=external::import_fence(device,lease.fence).map_err(|e|e.to_string())?;e.slots.insert(slot,Shared{texture,fence,next:0});}
  let shared=e.slots.get_mut(&slot).unwrap();let ready=shared.next.checked_add(1).ok_or("E_NATIVE_MEDIA_FENCE: exhausted")?;
  use wgpu::util::DeviceExt;let uniform=device.create_buffer_init(&wgpu::util::BufferInitDescriptor{label:Some("media/extent"),contents:&crate::protocol::words(&[width,height,0,0]),usage:wgpu::BufferUsages::UNIFORM});let group=device.create_bind_group(&wgpu::BindGroupDescriptor{label:None,layout:&e.pipeline.get_bind_group_layout(0),entries:&[wgpu::BindGroupEntry{binding:0,resource:image.as_entire_binding()},wgpu::BindGroupEntry{binding:1,resource:uniform.as_entire_binding()}]});let view=shared.texture.create_view(&Default::default());
  {let mut pass=encoder.begin_render_pass(&wgpu::RenderPassDescriptor{label:Some("media/resident-F32-output"),color_attachments:&[Some(wgpu::RenderPassColorAttachment{view:&view,depth_slice:None,resolve_target:None,ops:wgpu::Operations{load:wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),store:wgpu::StoreOp::Store}})],..Default::default()});pass.set_pipeline(&e.pipeline);pass.set_bind_group(0,&group,&[]);pass.draw(0..3,0..1);}
  external::general(&mut encoder,&shared.texture);let acquire=external::ownership(device,&shared.texture,true);let release=external::ownership(device,&shared.texture,false);external::signal(queue,shared.fence,ready);queue.submit([acquire,encoder.finish(),release]);
  lib.check((e.frame)(e.id,slot as u32,sequence,ready))?;shared.next=ready;e.submitted+=1;Ok(())
 }}
 pub fn poll_encoder(&mut self)->Result<Vec<(usize,u64)>,String>{unsafe{let Some(e)=self.encoded.as_mut()else{return Ok(vec![])};let mut values=[Completion::default();128];let n=(e.poll)(e.id,values.as_mut_ptr(),values.len()as u32);self.library.as_ref().unwrap().check(n)?;e.completed+=n as u64;e.bytes+=values[..n as usize].iter().map(|v|v.reserved as u64).sum::<u64>();Ok(values[..n as usize].iter().map(|v|(v.slot as usize,v.frame)).collect())}}
 pub fn finish_encoder(&mut self)->Result<bool,String>{unsafe{let Some(e)=&self.encoded else{return Ok(true)};let n=(e.finish)(e.id);self.library.as_ref().unwrap().check(n)?;Ok(n==1)}}
 pub fn encoder_stats(&self)->serde_json::Value{serde_json::json!({"version":1,"enabled":self.encoded.is_some(),"residentSlots":self.encoded.as_ref().map_or(0,|e|e.slots.len()),"submitted":self.encoded.as_ref().map_or(0,|e|e.submitted),"completed":self.encoded.as_ref().map_or(0,|e|e.completed),"cpuPixelReadbacks":0,"cpuPixelUploads":0,"compressedBytes":self.encoded.as_ref().map_or(0,|e|e.bytes),"encodedBytesCpuOnly":true,"backend":"native-d3d11-ocio-nvenc","gpuColour":true})}
 #[cfg(feature="diagnostics")]
 pub fn inspect_encoder(&self,slot:usize)->Result<Vec<f32>,String>{unsafe{type Inspect=unsafe extern "C" fn(u64,u32,*mut f32,u32)->i32;let e=self.encoded.as_ref().ok_or("E_NATIVE_MEDIA_INIT: no encoder")?;let lib=self.library.as_ref().unwrap();let call:Inspect=*lib._library.get(b"fw_encode_inspect").map_err(|_|"E_NATIVE_MEDIA_DIAGNOSTICS: diagnostic helper required")?;let shared=e.slots.get(&slot).ok_or("E_NATIVE_MEDIA_SLOT: not rendered")?;let mut values=vec![0.;shared.texture.width()as usize*shared.texture.height()as usize*4];lib.check(call(e.id,slot as u32,values.as_mut_ptr(),values.len()as u32))?;Ok(values)}}
 pub(super) fn drop_encoded(&mut self){if let(Some(e),Some(device))=(&mut self.encoded,&self.device){unsafe{for s in e.slots.values(){external::destroy_fence(device,s.fence);}e.slots.clear();}}self.encoded.take();}
}
