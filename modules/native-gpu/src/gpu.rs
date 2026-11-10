use crate::protocol::{words, Program, Data};
use serde_json::{json, Value};
use std::sync::{mpsc, Arc};
use wgpu::util::DeviceExt;
use winit::window::Window;
use crate::encode::{Encoder,Frame};
use std::collections::BTreeMap;

struct Pass {
    pipeline: usize,
    bindings: Option<wgpu::BindGroup>,
    uniform: wgpu::Buffer,
    groups:[u32;3],
    mesh:Option<MeshPass>,
    peel:Option<crate::mesh_transparency::PeelPass>,
    module:Option<crate::native_module::ModulePass>,
    state:Option<Vec<usize>>,
    inference:Option<(usize,Vec<usize>)>,
    ray_build:Option<(crate::ray_contract::Scene,Vec<u32>,bool)>,ray_query:Option<(usize,[u32;8])>,ray_buffers:Vec<usize>,
}
struct MeshPass{target:wgpu::TextureView,depth:wgpu::TextureView,resolve:wgpu::BindGroup,indices:Option<wgpu::Buffer>,count:u32}
struct Slot {
    ray_base_bytes:u64,video_inputs:Vec<crate::protocol::ImageImport>,
    dynamic:bool,frame_prepared:bool,advance_passes:Option<Arc<[bool]>>,stage_range_lifetimes:Option<Arc<StageRangeLifetimes>>,
    #[allow(dead_code)] // Strong owner references; diagnostics also address them.
    images: Vec<wgpu::Buffer>,
    _data: Vec<wgpu::Buffer>,
    passes: Vec<Pass>,
    display: Option<(wgpu::Buffer, wgpu::BindGroup, wgpu::BindGroup)>,
    frame: Option<u64>,
    export:Option<(wgpu::Buffer,wgpu::Buffer,wgpu::BindGroup,usize)>,
    readbacks:BTreeMap<String,wgpu::Buffer>,submission:Option<wgpu::SubmissionIndex>,
    sequence:u64,
    publication:Option<u64>,generation:u64,preview_revision:Option<u64>,
}
struct PreviewTimer {
    queries:wgpu::QuerySet,
    resolve:wgpu::Buffer,
    readback:wgpu::Buffer,
    result:Option<mpsc::Receiver<Option<f64>>>,
}
impl PreviewTimer {
    fn new(device:&wgpu::Device)->Self{
        Self{
            queries:device.create_query_set(&wgpu::QuerySetDescriptor{label:Some("preview/elapsed"),ty:wgpu::QueryType::Timestamp,count:2}),
            resolve:buffer(device,"preview/timestamp-resolve",16,wgpu::BufferUsages::QUERY_RESOLVE|wgpu::BufferUsages::COPY_SRC),
            readback:buffer(device,"preview/timestamp-readback",16,wgpu::BufferUsages::MAP_READ|wgpu::BufferUsages::COPY_DST),
            result:None,
        }
    }
    fn finish(&mut self,encoder:&mut wgpu::CommandEncoder,nanoseconds:f64){
        encoder.write_timestamp(&self.queries,1);
        encoder.resolve_query_set(&self.queries,0..2,&self.resolve,0);
        encoder.copy_buffer_to_buffer(&self.resolve,0,&self.readback,0,16);
        let (send,receive)=mpsc::channel();
        self.result=Some(receive);
        let buffer=self.readback.clone();
        encoder.map_buffer_on_submit(&self.readback,wgpu::MapMode::Read,..,move|result|{
            let time=if result.is_ok(){
                let measured=buffer.slice(..).get_mapped_range().ok().and_then(|view|{
                    let start=u64::from_le_bytes(view[..8].try_into().unwrap());
                    let end=u64::from_le_bytes(view[8..16].try_into().unwrap());
                    end.checked_sub(start).map(|ticks|ticks as f64*nanoseconds/1e6)
                });
                buffer.unmap();
                measured.filter(|ms|ms.is_finite()&&*ms>0.)
            }else{None};
            let _=send.send(time);
        });
    }
}

struct Display {
    surface: Option<wgpu::Surface<'static>>,
    controls: wgpu::Buffer,
    transform: wgpu::ComputePipeline,
    render: wgpu::RenderPipeline,
    _tables: [wgpu::Buffer; 2],
}
#[derive(Clone)]
struct PipelineReuse {kernels:Vec<crate::protocol::Kernel>,compute:Vec<wgpu::ComputePipeline>,mesh:Vec<Option<wgpu::RenderPipeline>>,resolve:wgpu::ComputePipeline,pack:Option<wgpu::ComputePipeline>,peeling:Option<crate::mesh_transparency::PeelPipelines>}
fn same_display_pipeline(a:&Program,b:&Program)->bool {
    matches!((&a.display,&b.display),(Some(x),Some(y)) if x.shader==y.shader&&x.profile==y.profile&&x.reach==y.reach&&x.cusp==y.cusp&&a.slots.min(2)==b.slots.min(2))
}
fn same_display(a:&Program,b:&Program)->bool {
    same_display_pipeline(a,b)&&{
        let i=&a.images[a.display.as_ref().unwrap().image];
        let j=&b.images[b.display.as_ref().unwrap().image];
        i.width==j.width&&i.height==j.height
    }
}
struct SlotReuse {allocations:Vec<Option<wgpu::Buffer>>,display:Option<wgpu::Buffer>,meshes:Vec<Option<(wgpu::TextureView,wgpu::TextureView)>>,peels:Vec<Option<crate::mesh_transparency::PeelScratch>>,immutable:Vec<Option<wgpu::Buffer>>}
struct Allocated {binary_upload_bytes:u64,pipelines:Vec<wgpu::ComputePipeline>,mesh_pipelines:Vec<Option<wgpu::RenderPipeline>>,mesh_resolve:wgpu::ComputePipeline,slots:Vec<Slot>,display:Option<Display>,data_seeds:Vec<Option<wgpu::Buffer>>,pack:Option<wgpu::ComputePipeline>,allocated_image_bytes:u64,peeling:Option<crate::mesh_transparency::PeelPipelines>,pipelines_created:u64,pipelines_reused:u64,display_reused:bool,buffers_reused:u64,attachments_reused:u64}
struct CachedPlan {
    id:u64,
    bytes:u64,
    program:Program,
    slots:Vec<Slot>,
    display:Option<Display>,
    pipelines:Vec<wgpu::ComputePipeline>,
    mesh_pipelines:Vec<Option<wgpu::RenderPipeline>>,
    mesh_resolve:wgpu::ComputePipeline,
    data_seeds:Vec<Option<wgpu::Buffer>>,
    write_bindings:Vec<Vec<bool>>,
    image_bytes:u64,
}
fn cacheable_plan(p:&Program)->bool{
    p.version==2&&!p.state_continuation&&p.frame_continuation.is_none()&&!p.ray_query&&
        p.modules.is_empty()&&p.inferences.is_empty()&&p.imports.is_empty()&&p.resource_lease.is_none()&&
        p.export.is_none()&&p.media_export.is_none()&&
        p.data.iter().all(|d|d.persistent.is_none()&&d.resident.is_none()&&d.source_resource.is_none())&&
        p.passes.iter().all(|pass|pass.draw.is_none()&&pass.ray_build.is_none()&&pass.ray_query.is_none())
}

fn stage_cache_plan(p:&Program)->bool{
    cacheable_plan(p)&&p.data.iter().all(|d|d.immutable||d.source_image.is_some())
}

// Compute passes conservatively remain roots, including temporary buffer
// producers and state resets. Image views and the input ancestry of every
// surviving pass are followed in the admitted DAG order.
fn preview_advance_passes(program:&Program)->Option<Arc<[bool]>>{
    if program.state_continuation||program.frame_continuation.is_some()||program.export.is_some()||
        program.media_export.is_some()||!program.buffer_outputs.is_empty()||!program.modules.is_empty()||
        !program.inferences.is_empty()||program.imports.iter().any(|i|i.video.is_some())||
        program.passes.iter().any(|p|p.ray_build.is_some()||p.ray_query.is_some()||
            p.buffers.is_none()&&(p.groups.is_some()||program.kernels[p.kernel].replay_image.as_deref()!=Some("whole-output-v1"))){
        return None;
    }
    let mut images=vec![false;program.images.len()];
    let mut keep=vec![false;program.passes.len()];
    for (i,pass) in program.passes.iter().enumerate().rev(){
        if pass.buffers.is_none()&&!images[pass.output]{continue;}
        keep[i]=true;
        let mut need_data=|data:usize|{if let Some(image)=program.data[data].source_image{images[image]=true;}};
        if let Some(buffers)=&pass.buffers{
            for &data in buffers{need_data(data);}
        }else{
            let geometry=pass.draw.iter().flat_map(|d|std::iter::once(d.positions).chain(d.indices).chain(d.uvs));
            for data in pass.data.iter().copied().chain(geometry){need_data(data);}
            for &image in &pass.inputs{images[image]=true;}
        }
    }
    keep.iter().any(|&pass|!pass).then(||keep.into())
}

struct StageRangeLifetimes{
    image_last:Vec<usize>,
    scratch:Vec<(usize,usize)>,
}
fn stage_range_lifetimes(program:&Program)->Result<Option<Arc<StageRangeLifetimes>>,String>{
    if !cacheable_plan(program){return Ok(None);}
    let mut checked_read_only=std::collections::HashSet::new();
    let mut scratch=vec![(usize::MAX,0);program.data.len()];
    for (index,pass) in program.passes.iter().enumerate(){
        let kernel=&program.kernels[pass.kernel];
        if let Some(buffers)=&pass.buffers{
            if kernel.kind.as_deref()!=Some("compute"){return Ok(None);}
            for (binding,&data) in buffers.iter().enumerate(){
                if program.data[data].immutable&&checked_read_only.insert((pass.kernel,binding))&&
                    crate::binary_resource::readonly(kernel,binding as u32).is_err(){return Ok(None);}
            }
        }else if pass.groups.is_some()||kernel.replay_image.as_deref()!=Some("whole-output-v1"){
            return Ok(None);
        }
        for &data in pass.buffers.as_deref().unwrap_or(&pass.data){
            let usage=&mut scratch[data];
            usage.0=usage.0.min(index);
            usage.1=index;
        }
    }
    for output in &program.buffer_outputs{scratch[output.buffer].1=program.passes.len();}
    Ok(Some(Arc::new(StageRangeLifetimes{image_last:program.image_lifetimes()?.1,scratch})))
}

fn stage_image_charge(image:&crate::protocol::Image)->u64{image.bytes().max(4096)+256}
struct CachedPreviewFrame{
    key:String,frame:u64,buffer:wgpu::Buffer,metadata:wgpu::Buffer,
}
impl CachedPreviewFrame{fn charge(&self)->u64{self.buffer.size().max(4096)+256}}
struct CachedStage{
    key:String,
    image:crate::protocol::Image,
    buffer:wgpu::Buffer,
}
pub struct Gpu {
    last_frame:Option<u64>,continuation_consumed:bool,
    preview_revision:Option<u64>,preview_duration:u64,
    binary_upload_bytes:u64,
    pub program: Program,
    cached_plans:std::collections::VecDeque<CachedPlan>,
    active_plan:Option<(u64,u64)>,
    plan_hits:u64,
    plan_misses:u64,
    plan_evictions:u64,
    reused_preview_device:bool,
    preview_pruned_frames:u64,preview_pruned_passes:u64,
    preview_frames:std::collections::VecDeque<CachedPreviewFrame>,
    preview_frame_bytes:u64,preview_frame_hits:u64,preview_frame_misses:u64,
    stage_images:std::collections::VecDeque<CachedStage>,
    stage_image_bytes:u64,
    stage_hits:u64,
    stage_misses:u64,
    stage_passes_reused:u64,
    instance: wgpu::Instance,
    preview_format: Option<wgpu::TextureFormat>,
    preview_viewport: Option<(u32,u32)>,
    preview_timers:BTreeMap<usize,PreviewTimer>,
    preview_timing_samples:u64,
    last_preview_gpu_ms:Option<f64>,
    peeling:Option<crate::mesh_transparency::PeelPipelines>,pipelines_created:u64,pipelines_reused:u64,display_reuses:u64,frame_slot_updates:u64,buffers_reused:u64,attachments_reused:u64,
    device: wgpu::Device,
    adapter:wgpu::Adapter,
    queue: wgpu::Queue,
    pipelines: Vec<wgpu::ComputePipeline>,
    mesh_pipelines:Vec<Option<wgpu::RenderPipeline>>,
    mesh_resolve:wgpu::ComputePipeline,
    slots: Vec<Slot>,
    display: Option<Display>,
    done_rx: mpsc::Receiver<(usize, u64)>,
    done_tx: mpsc::Sender<(usize, u64)>,
    errors: mpsc::Receiver<String>,
    error_tx:mpsc::Sender<String>,reconfigurations:u64,
    submitted: u64,
    completed: u64,
    peak_in_flight: u64,
    allocated_image_bytes: u64,
    data_seeds:Vec<Option<wgpu::Buffer>>,
    encoder:Option<Encoder>,pack:Option<wgpu::ComputePipeline>,
    media_retained_bytes:u64,encoder_spec:Option<(crate::protocol::Export,u32,u32)>,export_submitted:u64,export_completed:u64,
    parked_surface:Option<wgpu::Surface<'static>>,
    mapped_tx:mpsc::Sender<(usize,u64,Result<(),String>)>,mapped_rx:mpsc::Receiver<(usize,u64,Result<(),String>)>,
    pending_export:BTreeMap<u64,Frame>,next_export:u64,export_bytes:u64,
    diagnostic_readbacks: u64,
    diagnostic_bytes: u64,
    pub closing: bool,
    rays:crate::native_ray::Rays,inference:crate::native_inference::InferenceRuntime,optix:crate::native_optix::Optix,videos:crate::native_video::Videos,modules:crate::native_module::Modules,interop:crate::native_module::Interop,
    resident:ResidentPool,checkpoints:BTreeMap<String,StateCheckpoint>,checkpoint_restores:u64,persistent:BTreeMap<String,OwnedState>,state_cursors:BTreeMap<String,(u32,u32)>,write_bindings:Vec<Vec<bool>>,data_export_directory:Option<std::path::PathBuf>,data_readbacks:u64,data_export_bytes:u64,resource_directory:Option<std::path::PathBuf>,resource_upload_bytes:u64,
}

#[derive(Default)]
struct ResidentPool{entries:BTreeMap<String,OwnedState>,upload_bytes:u64,uploads:u64,reuses:u64,evictions:u64}
impl ResidentPool{
 fn resolve(&self,p:&mut Program)->Result<(),String>{for d in &mut p.data{if let Some(r)=&d.resident{if d.initial.is_empty(){let old=self.entries.get(&r.id).ok_or("E_NATIVE_RESIDENT_SEED: unknown resident seed reference")?;let mut candidate=d.clone();candidate.initial=old.definition.initial.clone();if candidate!=old.definition{return Err("E_NATIVE_RESIDENT_SEED: resident metadata changed".into());}*d=candidate;}else if self.entries.get(&r.id).is_some_and(|old|old.definition!=*d){return Err("E_NATIVE_RESIDENT_SEED: resident identity cannot change".into());}}}Ok(())}
 fn retain(&mut self,p:&Program){let before=self.entries.len();self.entries.retain(|id,_|p.data.iter().any(|d|d.resident.as_ref().is_some_and(|r|&r.id==id)));self.evictions+=(before-self.entries.len())as u64;}
 fn get(&mut self,d:&Data,device:&wgpu::Device,queue:&wgpu::Queue)->Result<wgpu::Buffer,String>{let r=d.resident.as_ref().unwrap();if let Some(old)=self.entries.get(&r.id){if old.definition!=*d{return Err("E_NATIVE_RESIDENT_SEED: resident definition changed".into());}self.reuses+=1;return Ok(old.buffer.clone());}if d.initial.len()as u64!=d.length{return Err("E_NATIVE_RESIDENT_SEED: missing initial seed".into());}let b=buffer(device,"resident/read-only-geometry",d.length*4,wgpu::BufferUsages::STORAGE|wgpu::BufferUsages::COPY_SRC|wgpu::BufferUsages::COPY_DST|wgpu::BufferUsages::INDEX|wgpu::BufferUsages::VERTEX);queue.write_buffer(&b,0,&words(&d.initial));self.upload_bytes+=d.length*4;self.uploads+=1;self.entries.insert(r.id.clone(),OwnedState{definition:d.clone(),buffer:b.clone()});Ok(b)}
}
struct StateCheckpoint{export_submitted:u64,continuation:bool,buffers:BTreeMap<String,wgpu::Buffer>,cursors:BTreeMap<String,(u32,u32)>,bytes:u64}
struct OwnedState{definition:crate::protocol::Data,buffer:wgpu::Buffer}
fn state_write_bindings(program:&Program)->Result<Vec<Vec<bool>>,String>{program.kernels.iter().map(|k|{if k.kind.as_deref()!=Some("compute")||!program.data.iter().any(|d|d.persistent.is_some()){return Ok(vec![]);}let m=naga::front::wgsl::parse_str(&k.code).map_err(|_|"E_NATIVE_SHADER: invalid state shader")?;Ok((0..k.input_count).map(|i|m.global_variables.iter().any(|(_,v)|v.binding.as_ref().is_some_and(|b|b.group==0&&b.binding==i as u32)&&matches!(v.space,naga::AddressSpace::Storage{access} if access.contains(naga::StorageAccess::STORE)))).collect())}).collect()}

fn device_image_admission(program:&Program,limits:&wgpu::Limits,window:bool)->Result<(),String>{
    for kernel in &program.kernels{
        let bytes=(kernel.header_words as u128+(kernel.parameter_words as u128).max(1).div_ceil(4)*4)*4;
        if bytes>u128::from(limits.max_buffer_size){return Err("E_NATIVE_DEVICE_LIMIT: parameter buffer exceeds actual device storage".into());}
        if matches!(kernel.kind.as_deref(),Some("state"|"module"|"inference"|"ray-build"|"ray-query")){continue;}
        let uniform=(kernel.header_words as u128+(kernel.parameter_words as u128).max(1).div_ceil(4)*4)*4;
        if uniform>u128::from(limits.max_uniform_buffer_binding_size){return Err(format!("E_NATIVE_DEVICE_LIMIT: kernel uniform {uniform} exceeds device {}",limits.max_uniform_buffer_binding_size));}
    }
    for pass in &program.passes{
        let kernel=&program.kernels[pass.kernel];
        if matches!(kernel.kind.as_deref(),Some("state"|"module"|"inference"|"ray-build"|"ray-query")){continue;}
        let storage=pass.buffers.as_ref().map_or(pass.inputs.len()+pass.data.len()+1,Vec::len);
        if storage>limits.max_storage_buffers_per_shader_stage as usize||storage+1>limits.max_bindings_per_bind_group as usize{return Err("E_NATIVE_DEVICE_LIMIT: pass bindings exceed actual device limits".into());}
    }
    for image in &program.images{if image.bytes()>limits.max_storage_buffer_binding_size as u64||image.bytes()>limits.max_buffer_size{return Err(format!("E_NATIVE_IMAGE_LIMIT: {}x{} needs {} working image bytes; device storage={} buffer={}",image.width,image.height,image.bytes(),limits.max_storage_buffer_binding_size,limits.max_buffer_size));}}
    let texture=|width:u32,height:u32|->Result<(),String>{if width>limits.max_texture_dimension_2d||height>limits.max_texture_dimension_2d{Err(format!("E_NATIVE_IMAGE_LIMIT: {width}x{height} attachment exceeds device texture dimension {}",limits.max_texture_dimension_2d))}else{Ok(())}};
    let dispatch=|groups:[u32;3]|->Result<(),String>{if groups.iter().any(|&n|n>limits.max_compute_workgroups_per_dimension){Err(format!("E_NATIVE_IMAGE_LIMIT: {groups:?} dispatch exceeds device workgroup dimension {}",limits.max_compute_workgroups_per_dimension))}else{Ok(())}};
    for pass in &program.passes{
        if let Some(groups)=pass.groups{dispatch(groups)?;}
        if pass.buffers.is_none(){let image=&program.images[pass.output];dispatch([image.width.div_ceil(8),image.height.div_ceil(8),1])?;if pass.draw.is_some(){texture(image.width,image.height)?;}}
    }
    for module in &program.modules{texture(module.width,module.height)?;}
    if let Some(display)=&program.display{let image=&program.images[display.image];dispatch([image.width.div_ceil(8),image.height.div_ceil(8),1])?;if window{texture(image.width,image.height)?;}}
    Ok(())
}

pub(crate) fn buffer(device: &wgpu::Device, label: &str, size: u64, usage: wgpu::BufferUsages) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor { label: Some(label), size, usage, mapped_at_creation: false })
}
fn group(device: &wgpu::Device, layout: &wgpu::BindGroupLayout, buffers: &[&wgpu::Buffer]) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("frameweave/native-resident"), layout,
        entries: &buffers.iter().enumerate().map(|(i, b)| wgpu::BindGroupEntry {
            binding: i as u32, resource: b.as_entire_binding(),
        }).collect::<Vec<_>>(),
    })
}
pub(crate) fn compute(device: &wgpu::Device, code: &str, entry: &str) -> wgpu::ComputePipeline {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some(entry), source: wgpu::ShaderSource::Wgsl(code.into()) });
    device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some(entry), layout: None, module: &module, entry_point: Some(entry),
        compilation_options: Default::default(), cache: None,
    })
}

// Use the complete declared buffer interface, including currently unused inputs.
// Auto layout reflects only statically used bindings and cannot represent the
// recording contract when one branch does not sample every declared input.
fn resident_compute(device:&wgpu::Device,code:&str)->Result<wgpu::ComputePipeline,String>{
    let parsed=naga::front::wgsl::parse_str(code).map_err(|e|format!("E_NATIVE_SHADER: {e}"))?;
    let mut entries=Vec::new();
    for (_,variable) in parsed.global_variables.iter(){if let Some(binding)=&variable.binding{
        if binding.group!=0{return Err("E_NATIVE_SHADER: resident buffers require group zero".into());}
        let ty=match variable.space{naga::AddressSpace::Uniform=>wgpu::BufferBindingType::Uniform,naga::AddressSpace::Storage{access}=>wgpu::BufferBindingType::Storage{read_only:!access.contains(naga::StorageAccess::STORE)},_=>return Err("E_NATIVE_SHADER: resident interface requires buffer bindings".into())};
        entries.push(wgpu::BindGroupLayoutEntry{binding:binding.binding,visibility:wgpu::ShaderStages::COMPUTE,ty:wgpu::BindingType::Buffer{ty,has_dynamic_offset:false,min_binding_size:None},count:None});
    }}
    let bindings=device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor{label:Some("native/declared-buffers"),entries:&entries});
    let layout=device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor{label:Some("native/resident-interface"),bind_group_layouts:&[Some(&bindings)],immediate_size:0});
    let module=device.create_shader_module(wgpu::ShaderModuleDescriptor{label:Some("fw_main"),source:wgpu::ShaderSource::Wgsl(code.into())});
    Ok(device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor{label:Some("fw_main"),layout:Some(&layout),module:&module,entry_point:Some("fw_main"),compilation_options:Default::default(),cache:None}))
}

fn gpu_backends(requested:&str,ray_query:bool,available:wgpu::Backends)->Result<wgpu::Backends,String>{
    let mut backends=match requested.trim().to_ascii_lowercase().as_str(){
        "auto"=>available&(wgpu::Backends::VULKAN|wgpu::Backends::DX12|wgpu::Backends::METAL),
        "vulkan"=>wgpu::Backends::VULKAN,
        "dx12"=>wgpu::Backends::DX12,
        "metal"=>wgpu::Backends::METAL,
        "gles"=>wgpu::Backends::GL,
        _=>return Err("E_GPU_BACKEND: FRAMEWEAVE_GPU_BACKEND expects auto, vulkan, dx12, metal or gles".into()),
    };
    if ray_query{
        backends&=wgpu::Backends::VULKAN;
        if backends.is_empty(){return Err("E_NATIVE_RAY_UNAVAILABLE: Ray Query requires the Vulkan backend".into());}
    }
    if backends.is_empty()||!available.contains(backends){
        return Err(format!("E_GPU_BACKEND: {requested} is unavailable in this build; compiled backends: {available:?}"));
    }
    Ok(backends)
}

#[cfg(test)]
#[test]
fn requested_gpu_backend_checks_platform_and_ray_policy(){
    let windows=wgpu::Backends::DX12|wgpu::Backends::VULKAN;
    assert_eq!(gpu_backends("auto",false,windows).unwrap(),windows);
    assert_eq!(gpu_backends("auto",true,windows).unwrap(),wgpu::Backends::VULKAN);
    assert_eq!(gpu_backends("dx12",false,windows).unwrap(),wgpu::Backends::DX12);
    assert_eq!(gpu_backends("metal",false,wgpu::Backends::METAL).unwrap(),wgpu::Backends::METAL);
    let linux=wgpu::Backends::GL|wgpu::Backends::VULKAN;
    assert_eq!(gpu_backends("auto",false,linux).unwrap(),wgpu::Backends::VULKAN);
    assert_eq!(gpu_backends("gles",false,linux).unwrap(),wgpu::Backends::GL);
    assert!(gpu_backends("metal",false,windows).unwrap_err().starts_with("E_GPU_BACKEND:"));
    assert!(gpu_backends("unknown",false,windows).unwrap_err().starts_with("E_GPU_BACKEND:"));
    assert!(gpu_backends("dx12",true,windows).unwrap_err().starts_with("E_NATIVE_RAY_UNAVAILABLE:"));
}

impl Gpu {
    pub async fn new(program: Program, window: Option<Arc<Window>>,
        display:Option<winit::event_loop::OwnedDisplayHandle>) -> Result<Self, String> {
        let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
        if let Some(display)=display{descriptor=descriptor.with_display_handle(Box::new(display));}
        let backend=std::env::var("FRAMEWEAVE_GPU_BACKEND").unwrap_or_else(|_|"auto".into());
        descriptor.backends=gpu_backends(&backend,program.ray_query,wgpu::Instance::enabled_backend_features())?;
        let instance = wgpu::Instance::new(descriptor);
        let surface = window.map(|w| instance.create_surface(w)).transpose().map_err(|e| format!("E_NATIVE_DISPLAY: {e}"))?;
        Self::new_owner(program, instance, surface, None, None).await
    }

    pub async fn prepare_preview_reload(&self, program:Program) -> Result<Self,String> {
        if self.closing || !self.idle() || self.program.export.is_some() || self.program.media_export.is_some() ||
            program.display.is_none() || program.export.is_some() || program.media_export.is_some() ||
            program.session == self.program.session || program.ray_query != self.program.ray_query ||
            program.max_bytes != self.program.max_bytes {
            return Err("E_NATIVE_PREVIEW_RELOAD: an idle preview and a fresh owner with matching policy are required".into());
        }
        let surface = self.display.as_ref().and_then(|d| d.surface.as_ref()).or(self.parked_surface.as_ref())
            .ok_or("E_NATIVE_PREVIEW_RELOAD: no existing presentation surface")?;
        let reuse=(self.program.preview_reuse.is_some()&&program.preview_reuse.is_some()).then_some(self);
        let candidate=Self::new_owner(program,self.instance.clone(),None,Some(surface),reuse).await;
        if reuse.is_some()&&candidate.is_err(){self.bind_device_errors();}
        candidate
    }

    pub fn bind_device_errors(&self){Self::route_device_errors(&self.device,&self.error_tx);}
    fn route_device_errors(device:&wgpu::Device,sender:&mpsc::Sender<String>){
        let sender=sender.clone();
        device.on_uncaptured_error(Arc::new(move|error|{let _=sender.send(format!("{error}"));}));
    }

    async fn new_owner(program:Program, instance:wgpu::Instance, surface:Option<wgpu::Surface<'static>>,
        preview_surface:Option<&wgpu::Surface<'static>>,reuse:Option<&Self>) -> Result<Self,String> {
        program.validate()?;if program.frame_continuation.is_some(){return Err("E_NATIVE_FRAME_CONTINUATION: no previous owner submission".into());}
        let resource_directory=program.resource_lease.as_ref().map(|b|std::fs::canonicalize(&b.directory).map_err(|e|format!("E_NATIVE_RESOURCE: {e}"))).transpose()?;
        let data_export_directory=program.data_export.as_ref().map(|b|std::fs::canonicalize(&b.directory).map_err(|e|format!("E_NATIVE_DATA_IO: {e}"))).transpose()?;
        if surface.is_some()&&program.display.is_none() { return Err("E_NATIVE_DISPLAY: window requires display configuration".into()); }
        let preview_viewport=if surface.is_some()||preview_surface.is_some(){
            program.display.as_ref().map(|d|{let image=&program.images[d.image];(image.width,image.height)})
        }else{None};
        let preview_format = preview_surface.and_then(wgpu::Surface::get_configuration).map(|config|config.format);
        if program.preview_reuse.as_deref().is_some_and(|p|p!="declarative-regions-v1")||
            program.preview_reuse.is_some()&&(preview_viewport.is_none()||!cacheable_plan(&program)){
            return Err("E_NATIVE_PREVIEW_CACHE: incompatible preview cache owner".into());
        }
        let compatible_surface=surface.as_ref().or(preview_surface);
        let adapter=if let Some(old)=reuse{old.adapter.clone()}
        else if let Some(name)=std::env::var_os("FRAMEWEAVE_GPU_ADAPTER"){
            let name=name.to_string_lossy();
            let requested=name.trim().to_lowercase();
            if requested.is_empty(){return Err("E_GPU_ADAPTER: FRAMEWEAVE_GPU_ADAPTER requires a nonempty hardware name".into());}
            let adapters=instance.enumerate_adapters(wgpu::Backends::all()).await;
            adapters.into_iter().find(|adapter|{
                let info=adapter.get_info();
                info.device_type!=wgpu::DeviceType::Cpu&&info.name.to_lowercase().contains(&requested)&&
                    compatible_surface.is_none_or(|surface|adapter.is_surface_supported(surface))
            }).ok_or_else(||format!("E_GPU_ADAPTER: no compatible hardware adapter matches {name:?} on the selected backend"))?
        }else{instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface, force_fallback_adapter: false,
            ..Default::default()
        }).await.map_err(|e| if program.ray_query{format!("E_NATIVE_RAY_UNAVAILABLE: Vulkan hardware adapter required: {e}")}else{format!("E_GPU_UNAVAILABLE: {e}")})?};
        if adapter.get_info().device_type == wgpu::DeviceType::Cpu { return Err("E_GPU_UNAVAILABLE: native path requires hardware GPU".into()); }
        if let (Some(surface), Some(format)) = (preview_surface, preview_format) {
            if !surface.get_capabilities(&adapter).formats.contains(&format) {
                return Err("E_NATIVE_PREVIEW_RELOAD: replacement adapter cannot present the window format".into());
            }
        }
        let limits = adapter.limits();
        let max_buffer = program.images.iter().map(|i| i.bytes()).chain(program.data.iter().map(|d|d.length*4)).max().unwrap_or(0);
        if max_buffer > limits.max_storage_buffer_binding_size as u64 || max_buffer > limits.max_buffer_size {
            return Err("E_NATIVE_BUDGET: image exceeds hardware storage-buffer limit".into());
        }
        let (device,queue,interop)=if let Some(old)=reuse{(old.device.clone(),old.queue.clone(),old.interop.clone())}
            else{crate::native_module::owner_device(&adapter,program.ray_query,preview_viewport.is_some()).await?};
        let mut modules=crate::native_module::Modules::new(interop.enabled,interop.luid);
        let (error_tx, errors) = mpsc::channel();
        Self::route_device_errors(&device,&error_tx);
        let ray_errors=device.push_error_scope(wgpu::ErrorFilter::Validation);let rays=crate::native_ray::Rays::new(&device,program.ray_query);if let Some(error)=ray_errors.pop().await{return Err(format!("E_NATIVE_RAY_SHADER: {error}"));}
        let write_bindings=state_write_bindings(&program)?;let mut persistent=BTreeMap::new();let mut resident=ResidentPool::default();let Allocated {binary_upload_bytes,pipelines,mesh_pipelines,mesh_resolve,slots,display,data_seeds,pack,allocated_image_bytes,peeling,pipelines_created,pipelines_reused,display_reused:_,buffers_reused,attachments_reused}=Self::allocate(&program,&device,&queue,&adapter,surface,preview_format,preview_viewport,&mut modules,&mut persistent,&mut resident,None,None,vec![],None).await?;
        let (done_tx, done_rx) = mpsc::channel();
        let encoder=program.export.as_ref().map(|e|{let image=&program.images[e.image];Encoder::new(e,image.width,image.height,done_tx.clone(),error_tx.clone())}).transpose()?;
        let encoder_spec=program.export.as_ref().map(|e|(e.clone(),program.images[e.image].width,program.images[e.image].height));
        let resource_upload_bytes=program.imports.iter().filter(|i|i.source.as_deref()!=Some("hardware-video")).map(|i|program.images[i.image].bytes()*program.slots as u64).sum();
        let (mapped_tx,mapped_rx)=mpsc::channel();let media_retained_bytes=program.media_export.as_ref().map(|e|{let i=&program.images[e.image];(u64::from(i.width)*u64::from(i.height)*35+8*1024*1024)*program.slots as u64+e.textures.iter().map(|t|u64::from(t.width)*u64::from(t.height)*if t.channels==1{4}else{16}).sum::<u64>()}).unwrap_or(0);
        let optix_enabled=program.ray_query;let owner=Self { last_frame:None,continuation_consumed:false,preview_revision:None,preview_duration:0,binary_upload_bytes,program,cached_plans:Default::default(),active_plan:None,plan_hits:0,plan_misses:0,plan_evictions:0,reused_preview_device:reuse.is_some(),preview_pruned_frames:0,preview_pruned_passes:0,preview_frames:Default::default(),preview_frame_bytes:0,preview_frame_hits:0,preview_frame_misses:0,stage_images:Default::default(),stage_image_bytes:0,stage_hits:0,stage_misses:0,stage_passes_reused:0,instance,preview_format,preview_viewport,preview_timers:BTreeMap::new(),preview_timing_samples:0,last_preview_gpu_ms:None,peeling,pipelines_created,pipelines_reused,display_reuses:0,frame_slot_updates:0,buffers_reused,attachments_reused, device, adapter,queue, pipelines,mesh_pipelines,mesh_resolve, slots, display, done_rx, done_tx, errors,error_tx,reconfigurations:0,
            submitted: 0, completed: 0, peak_in_flight:0, allocated_image_bytes,data_seeds,encoder,media_retained_bytes,encoder_spec,export_submitted:0,export_completed:0,parked_surface:None,pack,mapped_tx,mapped_rx,pending_export:BTreeMap::new(),next_export:0,export_bytes:0,diagnostic_readbacks: 0, diagnostic_bytes: 0, closing: false,rays,inference:crate::native_inference::InferenceRuntime::new(interop.enabled,interop.luid),optix:crate::native_optix::Optix::new(optix_enabled,interop.luid),videos:crate::native_video::Videos::new(interop.enabled,interop.luid),modules,interop,resident,checkpoints:BTreeMap::new(),checkpoint_restores:0,persistent,state_cursors:BTreeMap::new(),write_bindings,data_export_directory,data_readbacks:0,data_export_bytes:0,resource_directory,resource_upload_bytes };
        Ok(owner)
    }

    async fn allocate(program:&Program,device:&wgpu::Device,queue:&wgpu::Queue,adapter:&wgpu::Adapter,surface:Option<wgpu::Surface<'static>>,preview_format:Option<wgpu::TextureFormat>,preview_viewport:Option<(u32,u32)>,modules:&mut crate::native_module::Modules,persistent:&mut BTreeMap<String,OwnedState>,resident:&mut ResidentPool,reuse:Option<PipelineReuse>,reused_display:Option<Display>,mut slots_reuse:Vec<SlotReuse>,frame_slot:Option<usize>)->Result<Allocated,String>{
        resident.retain(program);let limits=device.limits();device_image_admission(program,&limits,surface.is_some()||reused_display.as_ref().is_some_and(|d|d.surface.is_some()))?;if program.data.iter().map(|d|d.length*4).any(|n|n>limits.max_storage_buffer_binding_size as u64||n>limits.max_buffer_size){return Err("E_NATIVE_BUDGET: buffer exceeds the actual device limit".into());}
        // Pipeline/API validation ONCE, not a frame numerical pass or readback.
        if program.kernels.iter().any(|k|k.mesh_mode.as_deref()==Some("source-over"))&&!device.features().contains(wgpu::Features::FLOAT32_BLENDABLE){return Err("E_NATIVE_MESH_CAPABILITY: F32 hardware blending unavailable; use exact GPU depth-peel".into());}
        let scope = device.push_error_scope(wgpu::ErrorFilter::Validation);
        let matches=program.kernels.iter().enumerate().map(|(i,k)|reuse.as_ref().and_then(|r|if r.kernels.get(i)==Some(k){Some(i)}else{r.kernels.iter().position(|old|old==k)})).collect::<Vec<_>>();
        let mut pipelines_created=0u64;let mut pipelines_reused=0u64;
        let pipelines=program.kernels.iter().enumerate().map(|(n,k)|if let Some(i)=matches[n]{pipelines_reused+=1;Ok(reuse.as_ref().unwrap().compute[i].clone())}else{pipelines_created+=1;if matches!(k.kind.as_deref(),Some("mesh"|"module"|"state"|"inference"|"ray-build"|"ray-query")){Ok(compute(device,"@compute @workgroup_size(1) fn fw_main(){}","fw_main"))}else{resident_compute(device,&k.code)}}).collect::<Result<Vec<_>,String>>()?;
        let mesh_pipelines=program.kernels.iter().enumerate().map(|(n,k)|if k.kind.as_deref()==Some("mesh"){
            if let Some(i)=matches[n]{pipelines_reused+=1;return reuse.as_ref().unwrap().mesh[i].clone();}pipelines_created+=1;
            let module=device.create_shader_module(wgpu::ShaderModuleDescriptor{label:Some("native/resident-mesh"),source:wgpu::ShaderSource::Wgsl(k.code.clone().into())});
            Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor{label:Some("native/resident-mesh"),layout:None,
                vertex:wgpu::VertexState{module:&module,entry_point:Some("vertex"),compilation_options:Default::default(),buffers:&[]},
                fragment:Some(wgpu::FragmentState{module:&module,entry_point:Some("fragment"),compilation_options:Default::default(),targets:&if k.mesh_mode.as_deref()==Some("depth-peel"){vec![Some(wgpu::ColorTargetState{format:wgpu::TextureFormat::Rgba32Float,blend:None,write_mask:wgpu::ColorWrites::ALL}),Some(wgpu::ColorTargetState{format:wgpu::TextureFormat::R32Uint,blend:None,write_mask:wgpu::ColorWrites::ALL})]}else{vec![Some(wgpu::ColorTargetState{format:wgpu::TextureFormat::Rgba32Float,blend:if k.mesh_mode.as_deref()==Some("source-over"){Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING)}else{None},write_mask:wgpu::ColorWrites::ALL})]}}),
                primitive:Default::default(),depth_stencil:Some(wgpu::DepthStencilState{format:wgpu::TextureFormat::Depth32Float,depth_write_enabled:Some(k.mesh_mode.as_deref()!=Some("source-over")),depth_compare:Some(wgpu::CompareFunction::LessEqual),stencil:Default::default(),bias:Default::default()}),multisample:Default::default(),multiview_mask:None,cache:None}))
        }else{None}).collect::<Vec<_>>();
        let mesh_resolve=if let Some(r)=&reuse{pipelines_reused+=1;r.resolve.clone()}else{pipelines_created+=1;compute(device,&mesh_resolve_shader(),"main")};
        let peeling=program.kernels.iter().any(|k|k.mesh_mode.as_deref()==Some("depth-peel")).then(||if let Some(p)=reuse.as_ref().and_then(|r|r.peeling.as_ref()){pipelines_reused+=3;p.clone()}else{pipelines_created+=3;crate::mesh_transparency::PeelPipelines::new(device)});
        if let Some(e) = scope.pop().await { return Err(format!("E_NATIVE_SHADER: {e}")); }
        let scope = device.push_error_scope(wgpu::ErrorFilter::Validation);
        let display_reused=reused_display.is_some();let mut display=reused_display;
        if !display_reused {if let Some(spec) = &program.display {
            let info = &program.images[spec.image];
            let format=if let Some(surface)=&surface{
            let caps = surface.get_capabilities(&adapter);
            // OCIO emits display-encoded sRGB. An sRGB render target would encode twice.
            let format = caps.formats.iter().copied().find(|f| matches!(f, wgpu::TextureFormat::Bgra8Unorm | wgpu::TextureFormat::Rgba8Unorm))
                .ok_or("E_NATIVE_DISPLAY: display-encoded output needs an unorm swapchain")?;
            let (width,height)=preview_viewport.unwrap_or((info.width,info.height));
            validate_viewport(width,height,&device.limits())?;
            let mut config = surface.get_default_config(adapter,width,height).ok_or("E_NATIVE_DISPLAY: unavailable swapchain")?;
            config.format = format;
            config.present_mode = if caps.present_modes.contains(&wgpu::PresentMode::Mailbox) { wgpu::PresentMode::Mailbox } else { wgpu::PresentMode::AutoNoVsync };
            config.desired_maximum_frame_latency = program.slots.min(2) as u32;
            surface.configure(&device, &config);
            format
            }else{preview_format.unwrap_or(wgpu::TextureFormat::Rgba8Unorm)};
            let transform = compute(&device, &spec.shader, "main");
            let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("frameweave/native-present"), source: wgpu::ShaderSource::Wgsl(PRESENT.into()) });
            let render = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("frameweave/native-present"), layout: None,
                vertex: wgpu::VertexState { module: &module, entry_point: Some("vertex"), compilation_options: Default::default(), buffers: &[] },
                fragment: Some(wgpu::FragmentState { module: &module, entry_point: Some("fragment"), compilation_options: Default::default(),
                    targets: &[Some(wgpu::ColorTargetState { format, blend: None, write_mask: wgpu::ColorWrites::ALL })] }),
                primitive: Default::default(), depth_stencil: None, multisample: Default::default(), multiview_mask: None, cache: None,
            });
            let make = |label, values: &[u32]| device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some(label), contents: &words(values), usage: wgpu::BufferUsages::STORAGE });
            let controls = buffer(device,"preview/controls",32,wgpu::BufferUsages::UNIFORM|wgpu::BufferUsages::COPY_DST);
            display = Some(Display { surface, controls, transform, render, _tables: [make("OCIO/reach", if spec.reach.is_empty(){&[0]}else{&spec.reach}), make("OCIO/cusp", if spec.cusp.is_empty(){&[0,0,0,0]}else{&spec.cusp})] });
        }
        }
        if let Some(e) = scope.pop().await { return Err(format!("E_NATIVE_SHADER: {e}")); }
        let scope = device.push_error_scope(wgpu::ErrorFilter::Validation);
        let pack=program.export.as_ref().map(|_|reuse.as_ref().and_then(|r|r.pack.clone()).unwrap_or_else(||compute(&device,crate::encode::PACK,"main")));
        let mut slots = Vec::with_capacity(program.slots);let mut buffers_reused=0u64;let mut attachments_reused=0u64;
        let data_seeds=if frame_slot.is_some(){vec![]}else{program.data.iter().map(|d|if d.immutable||d.initial.is_empty(){None}else{Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor{label:Some("resident/immutable-data-seed"),contents:&words(&d.initial),usage:wgpu::BufferUsages::COPY_SRC}))}).collect::<Vec<_>>()};
        let mut binary_upload_bytes=0u64;let immutable_data=program.data.iter().enumerate().map(|(i,d)|->Result<Option<wgpu::Buffer>,String>{if d.resident.is_some(){return Ok(Some(resident.get(d,device,queue)?));}if !d.immutable&&!program.frame_continuation.as_ref().is_some_and(|c|i<c.data){return Ok(None);}if let Some(b)=slots_reuse.first().and_then(|s|s.immutable.get(i)).and_then(|b|b.as_ref()){return Ok(Some(b.clone()));}let b=buffer(device,"resident/shared-immutable-data",d.length*4,wgpu::BufferUsages::STORAGE|wgpu::BufferUsages::COPY_SRC|wgpu::BufferUsages::COPY_DST|wgpu::BufferUsages::INDEX|wgpu::BufferUsages::VERTEX);if d.source_resource.is_some(){binary_upload_bytes+=crate::binary_resource::upload(program,d,device,queue,&b)?;}else if !d.initial.is_empty(){queue.write_buffer(&b,0,&words(&d.initial));}Ok(Some(b))}).collect::<Result<Vec<_>,String>>()?;
        for d in &program.data{if let Some(p)=&d.persistent{if let Some(old)=persistent.get(&p.id){if old.definition!=*d{return Err("E_NATIVE_STATE_RECONFIGURE: state definition changed".into());}}else{let b=buffer(device,"resident/persistent-state",d.length*4,wgpu::BufferUsages::STORAGE|wgpu::BufferUsages::COPY_SRC|wgpu::BufferUsages::COPY_DST|wgpu::BufferUsages::INDEX|wgpu::BufferUsages::VERTEX);persistent.insert(p.id.clone(),OwnedState{definition:d.clone(),buffer:b});}}}
        let (mapping,sizes)=program.allocation_layout()?;
        let allocated_image_bytes=sizes.iter().sum::<u64>()*program.slots as u64;
        let advance_passes=if preview_viewport.is_some()&&std::env::var_os("FRAMEWEAVE_PREVIEW_FULL_REPLAY").is_none(){
            preview_advance_passes(program)
        }else{None};
        for slot_id in 0..program.slots {
            let old=slots_reuse.get_mut(slot_id);
            let usage=wgpu::BufferUsages::STORAGE|wgpu::BufferUsages::COPY_DST|if program.state_continuation||program.frame_continuation.is_some()||cfg!(feature="diagnostics")||cacheable_plan(program)||!program.buffer_outputs.is_empty()||!program.imports.is_empty(){wgpu::BufferUsages::COPY_SRC}else{wgpu::BufferUsages::empty()};
            let mut old_allocations=old.map(|s|std::mem::take(&mut s.allocations)).unwrap_or_default();
            if let Some(c)=&program.frame_continuation{if old_allocations.iter().take(c.images).any(|b|b.as_ref().is_none_or(|b|!b.usage().contains(usage))){return Err("E_NATIVE_FRAME_CONTINUATION: prefix storage cannot be rebound with different usage".into());}}
            let mut clear=device.create_command_encoder(&wgpu::CommandEncoderDescriptor{label:Some("resident/reconfigure-zero")});let mut cleared=false;
            let allocations = sizes.iter().enumerate().map(|(i,&size)|{
                if let Some(b)=old_allocations.get_mut(i).and_then(Option::take).filter(|b|b.size()==size&&b.usage().contains(usage)){
                    // A fresh plan starts with zeroed images, including partial writes.
                    // Submit before imports so a declared-resource upload cannot be erased.
                    if !program.frame_continuation.as_ref().is_some_and(|c|i<c.images){clear.clear_buffer(&b,0,None);cleared=true;}buffers_reused+=1;b
                }else{buffer(device,"resident/F32-working-allocation",size,usage)}
            }).collect::<Vec<_>>();
            if cleared{queue.submit([clear.finish()]);}
            let images=mapping.iter().map(|&i|allocations[i].clone()).collect::<Vec<_>>();
            for item in &program.imports{
                if item.source.as_deref()==Some("hardware-video"){continue;}
                let path=program.import_lease(item)?.path(&item.file)?;
                let file=std::fs::File::open(path).map_err(|e|format!("E_NATIVE_BRIDGE_IO: {e}"))?;
                let expected=program.images[item.image].bytes();
                if file.metadata().map_err(|e|format!("E_NATIVE_BRIDGE_IO: {e}"))?.len()!=expected{return Err("E_NATIVE_BRIDGE_BYTES: exact F32 byte length required".into());}
                let mut bytes=Vec::with_capacity(expected as usize);std::io::Read::read_to_end(&mut std::io::Read::take(file,expected+1),&mut bytes).map_err(|e|format!("E_NATIVE_BRIDGE_IO: {e}"))?;
                if bytes.len() as u64!=expected{return Err("E_NATIVE_BRIDGE_BYTES: imported bytes changed".into());}
                queue.write_buffer(&images[item.image],0,&bytes);
            }
            let data=program.data.iter().enumerate().map(|(i,d)|if let Some(image)=d.source_image{images[image].clone()}else if let Some(p)=&d.persistent{persistent[&p.id].buffer.clone()}else{immutable_data[i].clone().unwrap_or_else(||buffer(device,"resident/typed-data",d.length*4,wgpu::BufferUsages::STORAGE|wgpu::BufferUsages::COPY_SRC|wgpu::BufferUsages::COPY_DST|wgpu::BufferUsages::INDEX|wgpu::BufferUsages::VERTEX))}).collect::<Vec<_>>();
            if frame_slot.is_some(){for (i,d) in program.data.iter().enumerate(){if !d.immutable&&d.persistent.is_none()&&d.source_image.is_none()&&!d.initial.is_empty(){queue.write_buffer(&data[i],0,&words(&d.initial));}}}
            let mut passes = Vec::with_capacity(program.passes.len());
            for (pass_id,pass) in program.passes.iter().enumerate() {
                let kernel = &program.kernels[pass.kernel];
                let image = &program.images[pass.output];
                let uniform = buffer(&device, "frame-slot/parameters",
                    (kernel.header_words + kernel.parameter_words.max(1).div_ceil(4)*4) as u64 * 4,
                    wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST);
                queue.write_buffer(&uniform, 0, &words(&pass.header));
                if pass.ray_build.is_some()||pass.ray_query.is_some(){let build=pass.ray_build.as_ref().map(|scene|{let immutable=scene.geometries.iter().all(|g|program.data[g.positions].immutable&&g.indices.is_none_or(|i|program.data[i].immutable))&&!program.passes.iter().any(|p|program.kernels[p.kernel].kind.as_deref()==Some("compute")&&p.buffers.as_ref().is_some_and(|b|scene.geometries.iter().any(|g|b.contains(&g.positions)||g.indices.is_some_and(|i|b.contains(&i)))));(scene.clone(),program.data[scene.transforms].initial.clone(),immutable)});passes.push(Pass{pipeline:pass.kernel,bindings:None,uniform,groups:[1,1,1],mesh:None,peel:None,module:None,state:None,inference:None,ray_build:build,ray_query:pass.ray_query.map(|i|(i,pass.header[..8].try_into().unwrap())),ray_buffers:pass.buffers.clone().unwrap()});continue;}
                if let Some(index)=pass.inference{passes.push(Pass{pipeline:pass.kernel,bindings:None,uniform,groups:[1,1,1],mesh:None,peel:None,module:None,state:None,inference:Some((index,pass.buffers.clone().unwrap())),ray_build:None,ray_query:None,ray_buffers:vec![]});continue;}
                if pass.state{passes.push(Pass{pipeline:pass.kernel,bindings:None,uniform,groups:[1,1,1],mesh:None,peel:None,module:None,state:pass.buffers.clone(),inference:None,ray_build:None,ray_query:None,ray_buffers:vec![]});continue;}
                if let Some(index)=pass.module{
                    let module=modules.prepare(device,&program.modules[index],(index,frame_slot.unwrap_or(0)+slot_id),pass.inputs.first().map(|&i|&images[i]),&images[pass.output],pass.header[6])?;
                    passes.push(Pass{pipeline:pass.kernel,bindings:None,uniform,groups:[1,1,1],mesh:None,peel:None,module:Some(module),state:None,inference:None,ray_build:None,ray_query:None,ray_buffers:vec![]});continue;
                }
                if kernel.mesh_mode.as_deref()==Some("depth-peel"){
                    let d=pass.draw.as_ref().unwrap();let scratch=slots_reuse.get_mut(slot_id).and_then(|s|s.peels.get_mut(pass_id)).and_then(Option::take);if scratch.is_some(){attachments_reused+=1;}let peel=crate::mesh_transparency::PeelPass::new(device,mesh_pipelines[pass.kernel].as_ref().unwrap(),peeling.as_ref().unwrap(),image,&data[d.positions],d.uvs.map(|i|&data[i]),pass.inputs.first().map(|&i|&images[i]),&uniform,d.indices.map(|i|&data[i]),d.count,&images[pass.output],scratch);
                    passes.push(Pass{pipeline:pass.kernel,bindings:None,uniform,groups:[image.width.div_ceil(8),image.height.div_ceil(8),1],mesh:None,peel:Some(peel),module:None,state:None,inference:None,ray_build:None,ray_query:None,ray_buffers:vec![]});continue;
                }
                let mut resources=if let Some(draw)=&pass.draw{let mut r=vec![&data[draw.positions]];if let Some(uv)=draw.uvs{r.push(&data[uv]);r.push(&images[pass.inputs[0]]);}r}else if let Some(indices)=&pass.buffers{indices.iter().map(|&i|&data[i]).collect::<Vec<_>>()}else{
                    let mut r=pass.inputs.iter().map(|&i| &images[i]).collect::<Vec<_>>();r.extend(pass.data.iter().map(|&i|&data[i]));r.push(&images[pass.output]);r
                };
                resources.push(&uniform);
                let layout=if pass.draw.is_some(){mesh_pipelines[pass.kernel].as_ref().unwrap().get_bind_group_layout(0)}else{pipelines[pass.kernel].get_bind_group_layout(0)};
                let bindings = group(&device,&layout,&resources);
                let mesh=pass.draw.as_ref().map(|draw|{
                    let texture=|label,format,usage|device.create_texture(&wgpu::TextureDescriptor{label:Some(label),size:wgpu::Extent3d{width:image.width,height:image.height,depth_or_array_layers:1},mip_level_count:1,sample_count:1,dimension:wgpu::TextureDimension::D2,format,usage,view_formats:&[]});
                    let reused=slots_reuse.get_mut(slot_id).and_then(|s|s.meshes.get_mut(pass_id)).and_then(Option::take);if reused.is_some(){attachments_reused+=1;}
                    let (target,depth)=reused.unwrap_or_else(||{let target=texture("native/mesh-color",wgpu::TextureFormat::Rgba32Float,wgpu::TextureUsages::RENDER_ATTACHMENT|wgpu::TextureUsages::TEXTURE_BINDING).create_view(&Default::default());
                    let depth=texture("native/mesh-depth",wgpu::TextureFormat::Depth32Float,wgpu::TextureUsages::RENDER_ATTACHMENT).create_view(&Default::default());
                    (target,depth)});
                    let resolve=device.create_bind_group(&wgpu::BindGroupDescriptor{label:Some("native/mesh-resident-resolve"),layout:&mesh_resolve.get_bind_group_layout(0),entries:&[wgpu::BindGroupEntry{binding:0,resource:wgpu::BindingResource::TextureView(&target)},wgpu::BindGroupEntry{binding:1,resource:images[pass.output].as_entire_binding()},wgpu::BindGroupEntry{binding:2,resource:uniform.as_entire_binding()}]});
                    MeshPass{target,depth,resolve,indices:draw.indices.map(|i|data[i].clone()),count:draw.count}
                });
                passes.push(Pass { pipeline: pass.kernel, bindings:Some(bindings), uniform,groups:pass.groups.unwrap_or([image.width.div_ceil(8),image.height.div_ceil(8),1]),mesh,peel:None,module:None,state:None,inference:None,ray_build:None,ray_query:None,ray_buffers:vec![] });
            }
            let display_slot = if let (Some(d), Some(spec)) = (&display, &program.display) {
                let image = &program.images[spec.image];
                let uniform = device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("display/metadata"),
                    contents:&words(&display_metadata(image)),usage:wgpu::BufferUsages::UNIFORM });
                let output = slots_reuse.get_mut(slot_id).and_then(|s|s.display.take()).unwrap_or_else(||buffer(&device, "display/F32", image.bytes(), wgpu::BufferUsages::STORAGE |
                    if cfg!(feature="diagnostics")||preview_viewport.is_some() {wgpu::BufferUsages::COPY_SRC} else {wgpu::BufferUsages::empty()}));
                let transform = if spec.profile=="linear709-sdr-v1"{group(&device,&d.transform.get_bind_group_layout(0),&[&images[spec.image],&output,&uniform])}else{group(&device, &d.transform.get_bind_group_layout(0), &[&images[spec.image], &output, &d._tables[0], &d._tables[1], &uniform])};
                let render = group(&device, &d.render.get_bind_group_layout(0), &[&output, &uniform, &d.controls]);
                Some((output, transform, render))
            } else { None };
            let export_slot=if let (Some(spec),Some(pack))=(&program.export,&pack){
                let image=&program.images[spec.image];let mode=match spec.format.as_str(){"nv12"=>1,"gbrapf32le"=>2,_=>0};
                let raw=image.width as u64*image.height as u64*match mode{1=>6,2=>64,_=>16}/4;let size=raw.div_ceil(4)*4;
                let packed=buffer(&device,"export/GPU-packed",size,wgpu::BufferUsages::STORAGE|wgpu::BufferUsages::COPY_SRC);
                let staging=buffer(&device,"export/asynchronous-materialization",size,wgpu::BufferUsages::MAP_READ|wgpu::BufferUsages::COPY_DST);
                let metadata=device.create_buffer_init(&wgpu::util::BufferInitDescriptor{label:Some("export/packing-metadata"),contents:&words(&[image.width,image.height,u32::from(image.alpha=="premultiplied"),mode]),usage:wgpu::BufferUsages::UNIFORM});
                let source=if spec.display{&display_slot.as_ref().ok_or("E_NATIVE_ENCODE: missing display transform")?.0}else{&images[spec.image]};
                let bindings=group(&device,&pack.get_bind_group_layout(0),&[source,&packed,&metadata]);
                Some((packed,staging,bindings,raw as usize))
            }else{None};
            let readbacks=program.readbacks.iter().map(|name|{let out=program.buffer_outputs.iter().find(|o|&o.id==name).unwrap();(name.clone(),buffer(device,"explicit/frame-capture",program.data[out.buffer].length*4,wgpu::BufferUsages::MAP_READ|wgpu::BufferUsages::COPY_DST))}).collect();
            slots.push(Slot {readbacks,submission:None,ray_base_bytes:program.validated_bytes()?,video_inputs:program.imports.iter().filter(|i|i.source.as_deref()==Some("hardware-video")).cloned().collect(),dynamic:frame_slot.is_some(),frame_prepared:frame_slot.is_some(),advance_passes:advance_passes.clone(),stage_range_lifetimes:None, images, _data:data, passes, display: display_slot, frame: None,export:export_slot,sequence:0,publication:None,generation:0,preview_revision:None });
        }
        // Flush load-time parameter uploads without waiting for pixels.
        queue.submit([]);
        if let Some(e) = scope.pop().await { return Err(format!("E_NATIVE_SHADER: {e}")); }
        Ok(Allocated{binary_upload_bytes,pipelines,mesh_pipelines,mesh_resolve,slots,display,data_seeds,pack,allocated_image_bytes,peeling,pipelines_created,pipelines_reused,display_reused,buffers_reused,attachments_reused})
    }
    fn trim_preview_frames(&mut self,limit:u64){
        while self.preview_frame_bytes>limit{
            self.preview_frame_bytes-=self.preview_frames.pop_front().unwrap().charge();
        }
    }
    fn preview_frame_limit(&self,active:u64)->u64{
        if self.preview_viewport.is_none(){return 0;}
        (self.program.max_bytes/8).min(self.program.max_bytes.saturating_sub(active)
            .saturating_sub(self.cache_bytes()).saturating_sub(self.stage_image_bytes))
    }
    fn trim_stage_images(&mut self,limit:u64){
        while self.stage_image_bytes>limit{
            let old=self.stage_images.pop_front().unwrap();
            self.stage_image_bytes-=stage_image_charge(&old.image);
        }
    }
    fn stage_image_limit(&self,active:u64)->u64{
        (self.program.max_bytes/8).min(self.program.max_bytes.saturating_sub(active).saturating_sub(self.cache_bytes()).saturating_sub(self.preview_frame_bytes))
    }
    fn cache_bytes(&self)->u64{self.cached_plans.iter().map(|p|p.bytes).sum()}
    fn trim_plan_cache(&mut self,limit:u64){
        while self.cache_bytes()>limit||self.cached_plans.len()>4{
            self.cached_plans.pop_front();
            self.plan_evictions+=1;
        }
    }
    fn park_active_plan(&mut self,next_bytes:u64)->bool{
        let Some((id,bytes))=self.active_plan.take() else{return false;};
        if self.slots.iter().any(|s|s.dynamic){return false;}
        let limit=(self.program.max_bytes/4).min(self.program.max_bytes.saturating_sub(next_bytes));
        if bytes>limit{return false;}
        self.trim_plan_cache(limit-bytes);
        let mut display=self.display.take();
        self.parked_surface=display.as_mut().and_then(|d|d.surface.take()).or(self.parked_surface.take());
        let mut slots=std::mem::take(&mut self.slots);
        for s in &mut slots{s.publication=None;}
        self.cached_plans.push_back(CachedPlan{
            id,bytes,program:self.program.clone(),slots,display,pipelines:std::mem::take(&mut self.pipelines),
            mesh_pipelines:std::mem::take(&mut self.mesh_pipelines),mesh_resolve:self.mesh_resolve.clone(),
            data_seeds:std::mem::take(&mut self.data_seeds),write_bindings:std::mem::take(&mut self.write_bindings),
            image_bytes:self.allocated_image_bytes,
        });
        self.trim_plan_cache(limit);
        true
    }
    pub fn activate_plan(&mut self,id:u64)->Result<bool,String>{
        if !self.idle()||self.closing{return Err("E_NATIVE_BUSY: activation requires completed frame slots".into());}
        let Some(index)=self.cached_plans.iter().position(|p|p.id==id) else{
            self.plan_misses+=1;
            return Ok(false);
        };
        let cached=self.cached_plans.remove(index).unwrap();
        self.park_active_plan(cached.bytes);
        self.trim_plan_cache((self.program.max_bytes/4).min(self.program.max_bytes.saturating_sub(cached.bytes)));
        self.trim_preview_frames(self.preview_frame_limit(cached.bytes));
        self.trim_stage_images(self.stage_image_limit(cached.bytes));
        let surface=self.display.as_mut().and_then(|d|d.surface.take()).or(self.parked_surface.take());
        self.program=cached.program;
        self.slots=cached.slots;
        self.display=cached.display;
        if let Some(display)=&mut self.display{display.surface=surface;}else{self.parked_surface=surface;}
        self.pipelines=cached.pipelines;
        self.mesh_pipelines=cached.mesh_pipelines;
        self.mesh_resolve=cached.mesh_resolve;
        self.data_seeds=cached.data_seeds;
        self.write_bindings=cached.write_bindings;
        self.allocated_image_bytes=cached.image_bytes;
        self.active_plan=Some((cached.id,cached.bytes));
        self.last_frame=None;
        self.continuation_consumed=false;
        // A warm plan still has the fresh-image semantics of reconfigure.
        let (mapping,_)=self.program.allocation_layout()?;
        let mut first=std::collections::HashSet::new();
        let unique=mapping.into_iter().enumerate().filter_map(|(i,a)|first.insert(a).then_some(i)).collect::<Vec<_>>();
        let mut encoder=self.device.create_command_encoder(&Default::default());
        for s in &mut self.slots{
            for &i in &unique{encoder.clear_buffer(&s.images[i],0,None);}
            s.publication=None;
            s.frame_prepared=false;
        }
        self.queue.submit([encoder.finish()]);
        self.plan_hits+=1;
        Ok(true)
    }
    pub async fn reconfigure(&mut self,mut program:Program,cache_id:Option<u64>)->Result<(),String>{
        if program.preview_reuse!=self.program.preview_reuse||program.preview_reuse.is_some()&&!cacheable_plan(&program){
            return Err("E_NATIVE_PREVIEW_CACHE: reconfiguration cannot widen a declarative preview owner".into());
        }
        self.resident.resolve(&mut program)?;let bytes=program.validated_bytes()?;let reserved=self.checkpoints.values().map(|c|c.bytes).sum::<u64>();if bytes.saturating_add(reserved).saturating_add(if program.state_continuation{self.media_retained_bytes}else{0})>program.max_bytes{return Err("E_NATIVE_STATE_BUDGET: reconfiguration must retain checkpoint storage".into());}self.check_session(&program.session)?;if self.persistent.keys().any(|id|!program.data.iter().any(|d|d.persistent.as_ref().is_some_and(|p|&p.id==id))){return Err("E_NATIVE_STATE_RECONFIGURE: persistent leases must remain admitted until owner closure".into());}
        if !self.idle(){return Err("E_NATIVE_BUSY: plan updates require completed frame slots".into());}
        if let Some(c)=&program.frame_continuation{if self.last_frame!=Some(c.frame)||self.program.slots!=1||c.images!=self.program.images.len()||c.data!=self.program.data.len()||program.images[..c.images]!=self.program.images[..]||program.data[..c.data]!=self.program.data[..]{return Err("E_NATIVE_FRAME_CONTINUATION: foreign frame, stale prefix or changed resource metadata".into());}}

        if self.program.media_export.is_some()&&program.media_export.is_none()&&!program.state_continuation{return Err("E_NATIVE_MEDIA_RECONFIGURE: active direct export cannot be removed".into());}
        let resource_directory=if program.state_continuation&&program.resource_lease.is_none(){self.resource_directory.clone()}else{program.resource_lease.as_ref().map(|b|std::fs::canonicalize(&b.directory).map_err(|e|format!("E_NATIVE_RESOURCE: {e}"))).transpose()?};if self.resource_directory.is_some()&&resource_directory!=self.resource_directory{return Err("E_NATIVE_RESOURCE: cannot replace admitted resource lease".into());}
        let data_directory=if program.state_continuation&&program.data_export.is_none(){self.data_export_directory.clone()}else{program.data_export.as_ref().map(|b|std::fs::canonicalize(&b.directory).map_err(|e|format!("E_NATIVE_DATA_IO: {e}"))).transpose()?};if self.data_export_directory.is_some()&&data_directory!=self.data_export_directory{return Err("E_NATIVE_DATA_PERMISSION: cannot replace the admitted export lease".into());}
        if self.encoder_spec.is_some()&&program.export.is_none()&&!program.state_continuation{return Err("E_NATIVE_ENCODE: plan update cannot remove an active encoder".into());}
        if let (Some((a,w,h)),Some(b))=(&self.encoder_spec,&program.export){if a.executable!=b.executable||a.output!=b.output||a.codec!=b.codec||a.format!=b.format||a.fps!=b.fps||*w!=program.images[b.image].width||*h!=program.images[b.image].height{return Err("E_NATIVE_ENCODE: plan update cannot change the active encoder or dimensions".into());}}
        if program.ray_query!=self.program.ray_query{return Err("E_NATIVE_RAY_PERMISSION: owner experimental policy is immutable".into());}self.rays.retain(&program)?;
        self.videos.retain_program(&self.device,&program)?;self.inference.retain(&self.device,&program)?;self.optix.retain(&self.device)?;
        let reuse=PipelineReuse{kernels:self.program.kernels.clone(),compute:self.pipelines.clone(),mesh:self.mesh_pipelines.clone(),resolve:self.mesh_resolve.clone(),pack:self.pack.clone(),peeling:self.peeling.clone()};
        let cache_id=cache_id.filter(|id|*id>0&&*id<=9_007_199_254_740_991&&cacheable_plan(&program)&&
            program.max_bytes==self.program.max_bytes&&reserved==0&&self.persistent.is_empty());
        if let Some(id)=cache_id{
            if self.active_plan.is_some_and(|(active,_)|active==id)||self.cached_plans.iter().any(|p|p.id==id){
                return Err("E_NATIVE_PLAN_CACHE: plan identity already admitted".into());
            }
        }
        let next_lease=program.data_export.as_ref().map(|d|&d.directory);
        let old_lease=self.program.data_export.as_ref().map(|d|&d.directory);
        // A window surface stays owner-local. Cached display bindings may only
        // share it at the same viewport and format.
        let compatible_cache=cache_id.is_some()&&next_lease==old_lease&&
            (self.preview_viewport.is_some()||self.program.display.is_none()&&program.display.is_none());
        if compatible_cache{self.park_active_plan(bytes);}
        else{self.active_plan=None;self.trim_plan_cache(0);}
        self.trim_plan_cache((program.max_bytes/4).min(program.max_bytes.saturating_sub(bytes)));
        let frame_limit=if cacheable_plan(&program)&&program.display.is_some(){
            (program.max_bytes/8).min(program.max_bytes.saturating_sub(bytes).saturating_sub(self.cache_bytes()))
        }else{0};
        self.trim_preview_frames(frame_limit);
        let stage_limit=if cacheable_plan(&program){
            (program.max_bytes/8).min(program.max_bytes.saturating_sub(bytes).saturating_sub(self.cache_bytes()).saturating_sub(self.preview_frame_bytes))
        }else{0};
        self.trim_stage_images(stage_limit);
        // Reuse only completed-slot storage of exactly the new size/usage.
        // Storage parked for another topology is never aliased.
        let (old_mapping,old_sizes)=self.program.allocation_layout()?;let (_,new_sizes)=program.allocation_layout()?;
        let slots_reuse=self.slots.iter().take(program.slots).map(|slot|{
            let usage=wgpu::BufferUsages::STORAGE|wgpu::BufferUsages::COPY_DST|if program.state_continuation||program.frame_continuation.is_some()||cfg!(feature="diagnostics")||cacheable_plan(&program)||!program.buffer_outputs.is_empty()||!program.imports.is_empty(){wgpu::BufferUsages::COPY_SRC}else{wgpu::BufferUsages::empty()};
            let allocations=new_sizes.iter().enumerate().map(|(i,size)|if old_sizes.get(i)==Some(size){old_mapping.iter().position(|&a|a==i).map(|n|slot.images[n].clone()).filter(|b|b.usage().contains(usage))}else{None}).collect();
            let compatible=|i:usize|self.program.passes.get(i).zip(program.passes.get(i)).is_some_and(|(a,b)|{let x=&self.program.images[a.output];let y=&program.images[b.output];x.width==y.width&&x.height==y.height});
            let meshes=slot.passes.iter().enumerate().map(|(i,p)|if compatible(i)&&program.passes[i].draw.is_some()&&program.kernels[program.passes[i].kernel].mesh_mode.as_deref()!=Some("depth-peel"){p.mesh.as_ref().map(|m|(m.target.clone(),m.depth.clone()))}else{None}).collect();
            let peels=slot.passes.iter().enumerate().map(|(i,p)|if compatible(i)&&program.kernels[program.passes[i].kernel].mesh_mode.as_deref()==Some("depth-peel"){p.peel.as_ref().map(|p|p.scratch())}else{None}).collect();
            let display=if same_display(&self.program,&program){slot.display.as_ref().map(|d|d.0.clone())}else{None};let immutable=program.data.iter().enumerate().map(|(i,d)|if (d.immutable||program.frame_continuation.as_ref().is_some_and(|c|i<c.data))&&self.program.data.get(i)==Some(d){slot._data.get(i).cloned()}else{None}).collect();SlotReuse{allocations,display,meshes,peels,immutable}
        }).collect();
        let reused_display=if same_display(&self.program,&program)||
            self.preview_viewport.is_some()&&same_display_pipeline(&self.program,&program){self.display.take()}else{None};
        let surface=self.display.as_mut().and_then(|d|d.surface.take()).or(self.parked_surface.take());
        let surface=if program.display.is_none(){self.parked_surface=surface;None}else{surface};
        self.slots.clear();self.pipelines.clear();self.mesh_pipelines.clear();self.data_seeds.clear();self.display=None;self.pack=None;
        let r=Self::allocate(&program,&self.device,&self.queue,&self.adapter,surface,self.preview_format,self.preview_viewport,&mut self.modules,&mut self.persistent,&mut self.resident,Some(reuse),reused_display,slots_reuse,None).await?;
        if self.encoder.is_none(){if let Some(e)=&program.export{let i=&program.images[e.image];self.encoder=Some(Encoder::new(e,i.width,i.height,self.done_tx.clone(),self.error_tx.clone())?);self.encoder_spec=Some((e.clone(),i.width,i.height));}}
        self.resource_upload_bytes+=program.imports.iter().filter(|i|i.source.as_deref()!=Some("hardware-video")).map(|i|program.images[i.image].bytes()*program.slots as u64).sum::<u64>();
        if let Some(e)=&program.media_export{let i=&program.images[e.image];self.media_retained_bytes=(u64::from(i.width)*u64::from(i.height)*35+8*1024*1024)*program.slots as u64+e.textures.iter().map(|t|u64::from(t.width)*u64::from(t.height)*if t.channels==1{4}else{16}).sum::<u64>();}
        self.buffers_reused+=r.buffers_reused;self.attachments_reused+=r.attachments_reused;self.peeling=r.peeling;self.pipelines_created+=r.pipelines_created;self.pipelines_reused+=r.pipelines_reused;self.display_reuses+=u64::from(r.display_reused);self.resource_directory=resource_directory;
        self.binary_upload_bytes+=r.binary_upload_bytes;self.data_export_directory=data_directory;self.write_bindings=state_write_bindings(&program)?;self.program=program;self.continuation_consumed=false;self.pipelines=r.pipelines;self.mesh_pipelines=r.mesh_pipelines;self.mesh_resolve=r.mesh_resolve;self.slots=r.slots;self.display=r.display;self.data_seeds=r.data_seeds;self.pack=r.pack;self.allocated_image_bytes=r.allocated_image_bytes;self.active_plan=cache_id.map(|id|(id,bytes));self.reconfigurations+=1;Ok(())
    }
    /// Pure preflight, including the original full-session budget. Never mutates a slot.
    pub fn frame_program(&self,slot:usize,parameters:&[Vec<u32>],bindings:Option<&crate::protocol::FrameBindings>)->Result<Option<Program>,String>{
        self.validate_submission(slot,parameters)?;
        if bindings.is_none(){return Ok(self.slots[slot].dynamic.then(||self.program.clone()));}
        let b=bindings.unwrap();if self.program.frame_continuation.is_some()||b.version!=1||!self.persistent.is_empty()||b.passes.len()!=self.program.passes.len(){return Err("E_NATIVE_FRAME_BINDINGS: incompatible version, state, publication or pass layout".into());}
        let mut p=self.program.clone();let video_count=p.imports.iter().filter(|i|matches!(i.source.as_deref(),Some("declared-video"|"hardware-video"))).count();if b.imports.len()!=video_count{return Err("E_NATIVE_FRAME_BINDINGS: every declared video import must be specified".into());}let mut video_seen=std::collections::HashSet::new();for patch in &b.imports{if !matches!(patch.source.as_deref(),Some("declared-video"|"hardware-video"))||patch.stream.is_none()||!video_seen.insert(patch.image){return Err("E_NATIVE_FRAME_BINDINGS: invalid video import identity".into());}if patch.source.as_deref()==Some("hardware-video"){p.import_lease(patch)?.video_path(&patch.file)?;}else{p.import_lease(patch)?.path(&patch.file)?;}let old=p.imports.iter_mut().find(|i|i.image==patch.image&&i.source==patch.source&&i.stream==patch.stream).ok_or("E_NATIVE_FRAME_BINDINGS: cannot replace admitted video resource identity")?;if patch.source.as_deref()==Some("hardware-video"){let mut a=old.video.clone().ok_or("E_NATIVE_VIDEO_PROTOCOL: missing admitted video")?;let mut b=patch.video.clone().ok_or("E_NATIVE_VIDEO_PROTOCOL: missing frame video")?;a.frame=0;a.pts=0;b.frame=0;b.pts=0;if a!=b||old.file!=patch.file{return Err("E_NATIVE_FRAME_BINDINGS: video source/colour cannot change".into());}old.video=patch.video.clone();}else{old.file=patch.file.clone();}}let mut seen=std::collections::HashSet::new();
        let mutable=p.data.iter().filter(|d|!d.immutable&&d.persistent.is_none()&&d.source_image.is_none()).count();
        if b.data.len()!=mutable{return Err("E_NATIVE_FRAME_BINDINGS: every mutable frame buffer must be specified".into());}
        for patch in &b.data{let d=p.data.get_mut(patch.index).ok_or("E_NATIVE_FRAME_BINDINGS: unknown buffer")?;if !seen.insert(patch.index)||d.immutable||d.persistent.is_some()||d.source_image.is_some(){return Err("E_NATIVE_FRAME_BINDINGS: immutable, persistent, image or duplicate buffer".into());}if self.program.buffer_outputs.iter().any(|o|o.buffer==patch.index)&&d.length!=patch.length{return Err("E_NATIVE_FRAME_BINDINGS: published buffer shape must remain fixed".into());}d.length=patch.length;d.initial=patch.initial.clone();}
        for (pass,patch) in p.passes.iter_mut().zip(&b.passes){if pass.groups.is_some()!=patch.groups.is_some()||pass.draw.is_some()!=patch.count.is_some(){return Err("E_NATIVE_FRAME_BINDINGS: dispatch/draw shape changed".into());}pass.header=patch.header.clone();pass.groups=patch.groups;if let Some(draw)=&mut pass.draw{draw.count=patch.count.unwrap();}}
        // Frame-local allocation does not replace the original shared seed cache.
        // Charge its larger size conservatively when the new frame shrinks.
        let old_seeds=self.program.data.iter().filter(|d|!d.immutable).map(|d|d.initial.len() as u64*4).sum::<u64>();let seeds=p.data.iter().filter(|d|!d.immutable).map(|d|d.initial.len() as u64*4).sum::<u64>();
        p.max_bytes=p.max_bytes.checked_sub(old_seeds.saturating_sub(seeds)).ok_or("E_NATIVE_BUDGET: frame seeds exceed session")?;
        p.validate()?;device_image_admission(&p,&self.device.limits(),self.display.as_ref().is_some_and(|d|d.surface.is_some()))?;
        Ok(Some(p))
    }
    pub async fn prepare_frame_slot(&mut self,slot:usize,mut p:Program,dynamic:bool,stage_ranges:bool)->Result<(),String>{
        if self.slots.get(slot).is_none_or(|s|s.frame.is_some()){return Err("E_NATIVE_SLOT_BUSY: only a completed frame slot can change bindings".into());}
        let live=if stage_ranges{stage_range_lifetimes(&p)?}else{None};
        let ray_base_bytes=p.validated_bytes()?;let (mapping,sizes)=self.program.allocation_layout()?;let old=&self.slots[slot];
        let reuse=SlotReuse{allocations:sizes.iter().enumerate().map(|(i,_)|mapping.iter().position(|&a|a==i).map(|n|old.images[n].clone())).collect(),display:old.display.as_ref().map(|d|d.0.clone()),meshes:old.passes.iter().map(|p|p.mesh.as_ref().map(|m|(m.target.clone(),m.depth.clone()))).collect(),peels:old.passes.iter().map(|p|p.peel.as_ref().map(|p|p.scratch())).collect(),immutable:self.program.data.iter().enumerate().map(|(i,d)|d.immutable.then(||old._data[i].clone())).collect()};
        let pipelines=PipelineReuse{kernels:self.program.kernels.clone(),compute:self.pipelines.clone(),mesh:self.mesh_pipelines.clone(),resolve:self.mesh_resolve.clone(),pack:self.pack.clone(),peeling:self.peeling.clone()};
        let display=self.display.as_ref().map(|d|Display{surface:None,controls:d.controls.clone(),transform:d.transform.clone(),render:d.render.clone(),_tables:d._tables.clone()});
        // Release the previous slot's mutable buffers BEFORE allocating replacements.
        // Other frame slots and their submitted command buffers remain untouched.
        self.slots[slot]=Slot{readbacks:BTreeMap::new(),submission:None,ray_base_bytes:0,video_inputs:vec![],dynamic:false,frame_prepared:false,advance_passes:None,stage_range_lifetimes:None,images:vec![],_data:vec![],passes:vec![],display:None,frame:None,export:None,sequence:0,publication:None,generation:0,preview_revision:None};
        p.slots=1;
        let r=match Self::allocate(&p,&self.device,&self.queue,&self.adapter,None,self.preview_format,self.preview_viewport,&mut self.modules,&mut self.persistent,&mut self.resident,Some(pipelines),display,vec![reuse],Some(slot)).await{Ok(r)=>r,Err(e)=>{self.closing=true;return Err(e);}};
        self.pipelines_created+=r.pipelines_created;self.pipelines_reused+=r.pipelines_reused;
        self.buffers_reused+=r.buffers_reused;self.attachments_reused+=r.attachments_reused;self.display_reuses+=u64::from(r.display_reused);
        self.binary_upload_bytes+=r.binary_upload_bytes;self.resource_upload_bytes+=p.imports.iter().filter(|i|i.source.as_deref()!=Some("hardware-video")).map(|i|p.images[i.image].bytes()).sum::<u64>();let mut updated=r.slots.into_iter().next().unwrap();updated.ray_base_bytes=ray_base_bytes;updated.dynamic=dynamic;updated.stage_range_lifetimes=live;self.slots[slot]=updated;self.frame_slot_updates+=1;Ok(())
    }
    /// Explicit idle boundary; copies stay on the existing GPU queue/device.
    pub fn state_checkpoint(&mut self,action:&str,name:&str)->Result<Value,String>{
        if self.closing||!self.idle(){return Err("E_NATIVE_STATE_BUSY: complete submitted frames before checkpoint operations".into());}
        if name.is_empty()||name.len()>128||!name.bytes().all(|c|c.is_ascii_alphanumeric()||b"._-/".contains(&c)){return Err("E_NATIVE_STATE_CHECKPOINT: invalid checkpoint identity".into());}
        if self.persistent.is_empty()&&action!="save-preview"&&action!="save-continuation"&&action!="release"&&action!="restore"{return Err("E_NATIVE_STATE_CHECKPOINT: owner has no persistent GPU state".into());}
        match action{
            "save"|"save-preview"|"save-continuation"=>{if self.checkpoints.contains_key(name){return Err("E_NATIVE_STATE_CHECKPOINT_EXISTS: release before replacing an immutable checkpoint".into());}if action!="save-continuation"&&self.state_cursors.len()!=self.persistent.len(){return Err("E_NATIVE_STATE_SEQUENCE: initialize all state before saving".into());}
                if action=="save-preview"&&(self.preview_viewport.is_none()||self.program.export.is_some()||self.program.media_export.is_some()){return Err("E_NATIVE_STATE_CHECKPOINT: preview snapshots require a window without an encoder".into());}
                let bytes=self.persistent.values().map(|s|s.buffer.size()).sum::<u64>();let reserved=self.checkpoints.values().map(|c|c.bytes).sum::<u64>();if self.program.validated_bytes()?.saturating_add(reserved).saturating_add(bytes).saturating_add(if self.program.state_continuation{self.media_retained_bytes}else{0})>self.program.max_bytes{return Err("E_NATIVE_STATE_BUDGET: checkpoint exceeds admitted session budget".into());}
                let mut encoder=self.device.create_command_encoder(&Default::default());let mut buffers=BTreeMap::new();for(id,state)in &self.persistent{let target=buffer(&self.device,"state/GPU-checkpoint",state.buffer.size(),wgpu::BufferUsages::COPY_SRC|wgpu::BufferUsages::COPY_DST);encoder.copy_buffer_to_buffer(&state.buffer,0,&target,0,state.buffer.size());buffers.insert(id.clone(),target);}self.queue.submit([encoder.finish()]);self.checkpoints.insert(name.into(),StateCheckpoint{export_submitted:self.export_submitted,continuation:action=="save-continuation",buffers,cursors:self.state_cursors.clone(),bytes});
            },
            "restore"=>{let c=self.checkpoints.get(name).ok_or("E_NATIVE_STATE_CHECKPOINT_MISSING: unknown owner-local checkpoint")?;if (self.encoder.is_some()||self.videos.has_encoder())&&(!c.continuation||self.export_submitted!=c.export_submitted){return Err("E_NATIVE_STATE_SEQUENCE: cannot rewind committed media frames".into());}if (!c.continuation&&c.buffers.len()!=self.persistent.len())||c.buffers.iter().any(|(id,b)|self.persistent.get(id).is_none_or(|s|s.buffer.size()!=b.size())){return Err("E_NATIVE_STATE_CHECKPOINT: persistent layout changed".into());}
                let mut encoder=self.device.create_command_encoder(&Default::default());if c.continuation{for(id,s)in &self.persistent{if !c.buffers.contains_key(id){encoder.clear_buffer(&s.buffer,0,None);}}}for(id,b)in &c.buffers{encoder.copy_buffer_to_buffer(b,0,&self.persistent[id].buffer,0,b.size());}self.queue.submit([encoder.finish()]);self.state_cursors=c.cursors.clone();for s in &mut self.slots{s.publication=None;}self.checkpoint_restores+=1;
            },
            "release"=>{if self.checkpoints.remove(name).is_none(){return Err("E_NATIVE_STATE_CHECKPOINT_MISSING: unknown owner-local checkpoint".into());}},
            _=>return Err("E_NATIVE_STATE_CHECKPOINT: unknown action".into()),
        }
        Ok(json!({"version":1,"name":name,"action":action,"cursors":self.state_cursors,"retainedBytes":self.checkpoints.values().map(|c|c.bytes).sum::<u64>(),"gpuOnly":true,"restores":self.checkpoint_restores}))
    }
    pub fn publication_id(&self,slot:usize)->u64{self.slots[slot].generation}
    pub fn has_publication(&self,slot:usize)->bool{self.slots[slot].publication.is_some()}
    pub fn check_session(&self, session: &str) -> Result<(), String> {
        if session != self.program.session { Err("E_NATIVE_SESSION: foreign/stale owner".into()) } else { Ok(()) }
    }
    pub fn validate_submission(&self,slot_id:usize,parameters:&[Vec<u32>])->Result<(),String>{
        if self.closing{return Err("E_NATIVE_CLOSED: owner closing".into());}
        let slot=self.slots.get(slot_id).ok_or("E_NATIVE_SLOT: invalid frame slot")?;
        if slot.frame.is_some(){return Err("E_NATIVE_SLOT_BUSY: frame slot still owned by GPU".into());}
        if parameters.len()!=slot.passes.len()||parameters.iter().zip(&self.program.passes).any(|(p,pass)|p.len()!=self.program.kernels[pass.kernel].parameter_words){return Err("E_NATIVE_PARAMETERS: exact parameter layout required".into());}
        self.state_progress(parameters)?;
        Ok(())
    }
    fn state_progress(&self,parameters:&[Vec<u32>])->Result<BTreeMap<String,(u32,u32)>,String>{
        let mut cursors=self.state_cursors.clone();let mut stepped=std::collections::HashSet::new();
        for (p,values) in self.program.passes.iter().zip(parameters){
            if p.state{if values[2]>1{return Err("E_NATIVE_STATE: invalid reset flag".into());}for &i in p.buffers.as_ref().unwrap(){let id=&self.program.data[i].persistent.as_ref().unwrap().id;let old=cursors.get(id);if values[2]==1{if values[1]!=0||old.is_some_and(|v|values[0]<=v.0){return Err("E_NATIVE_STATE_SEQUENCE: reset requires step zero and a fresh epoch".into());}}else if old.is_none_or(|v|values[0]!=v.0||v.1.checked_add(1)!=Some(values[1])){return Err("E_NATIVE_STATE_SEQUENCE: consecutive explicit steps required; reset/replay for seeking".into());}cursors.insert(id.clone(),(values[0],values[1]));stepped.insert(id.clone());}continue;}
            for (binding,&i) in p.buffers.iter().flatten().enumerate(){if let Some(state)=&self.program.data[i].persistent{if !cursors.contains_key(&state.id){return Err("E_NATIVE_STATE_SEQUENCE: reset state before first use".into());}let writes=if let Some(i)=p.inference{binding>=self.program.inferences[i].inputs.len()}else if p.ray_build.is_some(){false}else if p.ray_query.is_some(){(2..5).contains(&binding)}else{self.write_bindings[p.kernel][binding]};if writes&&!stepped.contains(&state.id){return Err("E_NATIVE_STATE_SEQUENCE: writable state requires an explicit step in this frame".into());}}}
            for &i in p.data.iter().chain(p.draw.iter().map(|d|&d.positions)).chain(p.draw.iter().filter_map(|d|d.indices.as_ref())).chain(p.draw.iter().filter_map(|d|d.uvs.as_ref())){if self.program.data[i].persistent.as_ref().is_some_and(|s|!cursors.contains_key(&s.id)){return Err("E_NATIVE_STATE_SEQUENCE: reset state before first use".into());}}
        }Ok(cursors)
    }
    pub fn preview_state(&mut self, revision:Option<u64>, duration:u64) {
        self.preview_revision = revision;
        self.preview_duration = duration;
    }
    pub fn submit(&mut self, frame: u64, slot_id: usize, parameters: Vec<Vec<u32>>, preview_revision:Option<u64>, preview_advance:bool, preview_timing:bool, stage_cache:&[crate::protocol::StageCacheRef],preview_cache_key:Option<&str>) -> Result<(), String> {
        if self.program.frame_continuation.as_ref().is_some_and(|c|c.frame!=frame||self.continuation_consumed){return Err("E_NATIVE_FRAME_CONTINUATION: borrow is single-submit and limited to its frame".into());}
        self.validate_submission(slot_id,&parameters)?;
        if preview_advance && (preview_revision.is_some() || self.program.export.is_some() || self.program.media_export.is_some()) {
            return Err("E_NATIVE_PREVIEW: a simulation advance cannot present or export".into());
        }
        let result=self.submit_inner(frame,slot_id,parameters,preview_revision,preview_advance,preview_timing,stage_cache,preview_cache_key);if result.is_err()&&!self.persistent.is_empty(){self.closing=true;}result
    }
    fn submit_inner(&mut self,frame:u64,slot_id:usize,parameters:Vec<Vec<u32>>,preview_revision:Option<u64>,preview_advance:bool,preview_timing:bool,stage_cache:&[crate::protocol::StageCacheRef],preview_cache_key:Option<&str>)->Result<(),String>{
        let next_state=self.state_progress(&parameters)?;
        if self.closing { return Err("E_NATIVE_CLOSED: owner closing".into()); }
        let idle=(!stage_cache.is_empty()||preview_cache_key.is_some())&&self.idle();
        let active=self.slots[slot_id].ray_base_bytes;
        let frame_limit=if preview_cache_key.is_some(){self.preview_frame_limit(active)}else{0};
        let mut cache_copy=None;
        if let (Some(key),Some(spec),Some(_))=(preview_cache_key,self.program.display.as_ref(),preview_revision){
            let info=&self.program.images[spec.image];
            let (bytes,metadata)=(info.bytes(),display_metadata(info));
            if !cacheable_plan(&self.program)||key.len()!=128||!key.bytes().all(|b|b.is_ascii_hexdigit()){
                return Err("E_NATIVE_PREVIEW_CACHE: expected an owner-local deterministic display key".into());
            }
            if self.preview_revision==preview_revision&&!self.preview_frames.iter().any(|entry|entry.key==key){
                let charge=bytes.max(4096)+256;
                if idle&&charge<=frame_limit{self.trim_preview_frames(frame_limit-charge);}
                if charge<=frame_limit.saturating_sub(self.preview_frame_bytes){
                    let uniform=self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor{label:Some("preview/cached-metadata"),
                        contents:&words(&metadata),usage:wgpu::BufferUsages::UNIFORM});
                    cache_copy=Some(CachedPreviewFrame{key:key.into(),frame,metadata:uniform,
                        buffer:buffer(&self.device,"preview/cached-display",bytes,wgpu::BufferUsages::STORAGE|wgpu::BufferUsages::COPY_DST)});
                }
            }
        }
        let stage_limit=if stage_cache.is_empty(){0}else{self.stage_image_limit(active)
            .min(self.program.max_bytes.saturating_sub(active).saturating_sub(self.cache_bytes())
                .saturating_sub(self.preview_frame_bytes).saturating_sub(cache_copy.as_ref().map_or(0,CachedPreviewFrame::charge)))};
        let slot = self.slots.get_mut(slot_id).ok_or("E_NATIVE_SLOT: invalid frame slot")?;
        if slot.frame.is_some() { return Err("E_NATIVE_SLOT_BUSY: frame slot still owned by GPU".into()); }
        if parameters.len() != slot.passes.len() || parameters.iter().zip(&self.program.passes).any(|(p, pass)| p.len() != self.program.kernels[pass.kernel].parameter_words) {
            return Err("E_NATIVE_PARAMETERS: exact parameter layout required".into());
        }
        let mut stage_starts=std::collections::HashMap::new();
        let mut stage_ends=std::collections::HashMap::new();
        let mut requested=std::collections::HashSet::new();
        if !stage_cache.is_empty()&&!cacheable_plan(&self.program){
            return Err("E_NATIVE_STAGE_CACHE: this program cannot admit cached Stage images".into());
        }
        let mut needed=0u64;
        if !slot.dynamic&&slot.stage_range_lifetimes.is_none()&&stage_cache.iter().any(|item|item.first.is_some()){
            slot.stage_range_lifetimes=stage_range_lifetimes(&self.program)?;
        }
        let mut ordered=stage_cache.iter().collect::<Vec<_>>();
        ordered.sort_unstable_by_key(|item|item.first.unwrap_or(item.pass));
        let mut previous_end=None;
        for item in ordered{
            let first=item.first.unwrap_or(item.pass);
            let pass=self.program.passes.get(item.pass).ok_or("E_NATIVE_STAGE_CACHE: unknown pass")?;
            if item.key.len()!=64||!item.key.bytes().all(|b|b.is_ascii_hexdigit())||first>item.pass||
                previous_end.is_some_and(|end|end>=first)||!requested.insert(&item.key){
                return Err("E_NATIVE_STAGE_CACHE: expected disjoint deterministic Stage ranges".into());
            }
            if item.first.is_some(){
                let live=slot.stage_range_lifetimes.as_ref().ok_or("E_NATIVE_STAGE_CACHE: range needs complete image writes and owned scratch")?;
                if pass.buffers.is_some(){return Err("E_NATIVE_STAGE_CACHE: range needs a final image".into());}
                for (offset,interior) in self.program.passes[first..=item.pass].iter().enumerate(){
                    if first+offset!=item.pass&&interior.buffers.is_none()&&live.image_last[interior.output]>item.pass{
                        return Err("E_NATIVE_STAGE_CACHE: range has an externally visible intermediate".into());
                    }
                    for &index in interior.buffers.as_deref().unwrap_or(&interior.data){
                        let data=&self.program.data[index];
                        let (born,last)=live.scratch[index];
                        if !data.immutable&&data.source_image.is_none()&&(born<first||last>item.pass){
                            return Err("E_NATIVE_STAGE_CACHE: range has externally visible scratch data".into());
                        }
                    }
                }
            }else if !stage_cache_plan(&self.program)||self.program.kernels[pass.kernel].kind.is_some()||pass.buffers.is_some()||!pass.data.is_empty(){
                return Err("E_NATIVE_STAGE_CACHE: expected a deterministic pixel pass".into());
            }
            previous_end=Some(item.pass);
            stage_starts.insert(first,(item.pass,&item.key));
            stage_ends.insert(item.pass,&item.key);
            if let Some(cached)=self.stage_images.iter().find(|x|x.key==item.key){
                if cached.image!=self.program.images[pass.output]{return Err("E_NATIVE_STAGE_CACHE: mismatched cached surface contract".into());}
            }else{needed=needed.saturating_add(stage_image_charge(&self.program.images[pass.output]));}
        }
        // An eviction is charged as released only at an idle submission boundary.
        if idle&&!stage_cache.is_empty(){
            while self.stage_image_bytes.saturating_add(needed)>stage_limit{
                let Some(index)=self.stage_images.iter().position(|image|!requested.contains(&image.key))else{break;};
                let removed=self.stage_images.remove(index).unwrap();
                self.stage_image_bytes-=stage_image_charge(&removed.image);
            }
        }
        let mut staged_images=Vec::new();
        let mut staged_bytes=0u64;
        // Pixels stay on the GPU. Preview telemetry reads only a timestamp pair.
        if !self.videos.has_encoder(){if let Some(spec)=&self.program.media_export{let info=&self.program.images[spec.image];self.videos.configure_encoder(&self.device,spec,info.width,info.height,self.program.slots)?;}}
        let timed=preview_timing&&preview_revision.is_some()&&self.preview_viewport.is_some()&&
            self.device.features().contains(wgpu::Features::TIMESTAMP_QUERY_INSIDE_ENCODERS)&&
            self.program.export.is_none()&&self.program.media_export.is_none()&&self.program.frame_continuation.is_none()&&
            slot.video_inputs.is_empty()&&slot.passes.iter().all(|p|p.module.is_none()&&p.inference.is_none()&&
                p.ray_build.as_ref().is_none_or(|(scene,_,_)|scene.backend!="optix"));
        let timer=timed.then(||self.preview_timers.entry(slot_id).or_insert_with(||PreviewTimer::new(&self.device)));
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("frameweave/native-frame") });
        if let Some(timer)=&timer{encoder.write_timestamp(&timer.queries,0);}
        if !slot.frame_prepared{for (i,b) in slot._data.iter().enumerate(){if self.program.frame_continuation.as_ref().is_some_and(|c|i<c.data)||self.program.data[i].immutable||self.program.data[i].source_image.is_some()||self.program.data[i].persistent.is_some(){continue;}encoder.clear_buffer(b,0,None);if let Some(seed)=&self.data_seeds[i]{encoder.copy_buffer_to_buffer(seed,0,b,0,seed.size());}}}slot.frame_prepared=false;
        for item in &slot.video_inputs{let info=&self.program.images[item.image];let root=self.resource_directory.as_ref().ok_or("E_NATIVE_VIDEO_LEASE: missing private source lease")?;encoder=match self.videos.execute(&self.device,&self.queue,root,item,info,slot_id,&slot.images[item.image],encoder){Ok(next)=>next,Err(error)=>{self.closing=true;return Err(error);}};}
        let advance_passes=if preview_advance&&stage_cache.is_empty(){slot.advance_passes.as_deref()}else{None};
        let mut skipped=0;
        let mut next_uncached=0;
        for (pass_index,(p, values)) in slot.passes.iter().zip(parameters).enumerate() {
            if advance_passes.is_some_and(|passes|!passes[pass_index]){
                skipped+=1;
                continue;
            }
            if pass_index<next_uncached{continue;}
            if let Some(&(end,key))=stage_starts.get(&pass_index){
                if let Some(index)=self.stage_images.iter().position(|x|&x.key==key){
                    let hit=self.stage_images.remove(index).unwrap();
                    let output=self.program.passes[end].output;
                    encoder.copy_buffer_to_buffer(&hit.buffer,0,&slot.images[output],0,hit.image.bytes());
                    self.stage_images.push_back(hit);
                    self.stage_hits+=1;
                    next_uncached=end+1;
                    self.stage_passes_reused+=(next_uncached-pass_index) as u64;
                    continue;
                }
                self.stage_misses+=1;
            }
            let output=self.program.passes[pass_index].output;
            if let Some((scene,pose,immutable))=&p.ray_build{if scene.backend=="optix"{let(packed,invalid)=match self.optix.sources(&self.device,slot_id,pass_index,scene,pose){Ok(v)=>v,Err(e)=>{self.closing=true;return Err(e);}};if let Err(e)=self.rays.gather_buffers(&self.device,&mut encoder,scene,&slot._data,&packed,&invalid){self.closing=true;return Err(e);}continue;}if let Err(error)=self.rays.build(&self.device,&mut encoder,&self.program,slot_id,pass_index,scene,pose,*immutable,&slot._data,slot.ray_base_bytes.max(self.program.validated_bytes()?),self.program.max_bytes.saturating_sub(self.optix.reserved_bytes())){self.closing=true;return Err(error);}continue;}
            if let Some((index,header))=&p.ray_query{if self.program.passes[*index].ray_build.as_ref().is_some_and(|s|s.backend=="optix"){let base=slot.ray_base_bytes.max(self.program.validated_bytes()?);let remaining=self.program.max_bytes.checked_sub(base).and_then(|n|n.checked_sub(self.rays.reserved_bytes())).ok_or("E_NATIVE_OPTIX_BUDGET: no remaining known allocation budget")?;encoder=match self.optix.query(&self.device,&self.queue,slot_id,*index,pass_index,&p.ray_buffers,header,&slot._data,encoder,remaining){Ok(v)=>v,Err(e)=>{self.closing=true;return Err(e);}};continue;}if let Err(error)=self.rays.query(&self.device,&mut encoder,slot_id,*index,&p.ray_buffers,header,&slot._data){self.closing=true;return Err(error);}continue;}
            if let Some((index,bindings))=&p.inference{let root=self.resource_directory.as_ref().ok_or("E_INFERENCE_MODEL_UNDECLARED: missing private model lease")?;encoder=match self.inference.execute(&self.device,&self.queue,root,&self.program.inferences[*index],*index,slot_id,&slot._data,bindings,encoder,self.program.max_bytes){Ok(next)=>next,Err(error)=>{self.closing=true;return Err(error);}};continue;}
            if let Some(indices)=&p.state{if values[2]==1{for &i in indices{encoder.clear_buffer(&slot._data[i],0,None);if let Some(seed)=&self.data_seeds[i]{encoder.copy_buffer_to_buffer(seed,0,&slot._data[i],0,seed.size());}}}continue;}
            if let Some(module)=&p.module{match self.modules.execute(&self.device,&self.queue,module,encoder,&values){Ok(next)=>encoder=next,Err(error)=>{self.closing=true;return Err(error);}}continue;}
            if !values.is_empty() { self.queue.write_buffer(&p.uniform, self.program.kernels[p.pipeline].header_words as u64 * 4, &words(&values)); }
            if let Some(peel)=&p.peel{peel.encode(&mut encoder,self.mesh_pipelines[p.pipeline].as_ref().unwrap());continue;}
            if let Some(mesh)=&p.mesh{
                {let mut draw=encoder.begin_render_pass(&wgpu::RenderPassDescriptor{label:Some("native/resident-mesh-draw"),color_attachments:&[Some(wgpu::RenderPassColorAttachment{view:&mesh.target,resolve_target:None,depth_slice:None,ops:wgpu::Operations{load:wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),store:wgpu::StoreOp::Store}})],depth_stencil_attachment:Some(wgpu::RenderPassDepthStencilAttachment{view:&mesh.depth,depth_ops:Some(wgpu::Operations{load:wgpu::LoadOp::Clear(1.),store:wgpu::StoreOp::Store}),stencil_ops:None}),timestamp_writes:None,occlusion_query_set:None,multiview_mask:None});
                    draw.set_pipeline(self.mesh_pipelines[p.pipeline].as_ref().unwrap());draw.set_bind_group(0,p.bindings.as_ref().unwrap(),&[]);if let Some(indices)=&mesh.indices{draw.set_index_buffer(indices.slice(..),wgpu::IndexFormat::Uint32);draw.draw_indexed(0..mesh.count,0,0..1);}else{draw.draw(0..mesh.count,0..1);}}
                let mut resolve=encoder.begin_compute_pass(&wgpu::ComputePassDescriptor{label:Some("native/mesh-to-resident-image"),timestamp_writes:None});resolve.set_pipeline(&self.mesh_resolve);resolve.set_bind_group(0,&mesh.resolve,&[]);resolve.dispatch_workgroups(p.groups[0],p.groups[1],1);continue;
            }
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: None });
            pass.set_pipeline(&self.pipelines[p.pipeline]); pass.set_bind_group(0, p.bindings.as_ref().unwrap(), &[]);
            pass.dispatch_workgroups(p.groups[0],p.groups[1],p.groups[2]);
            drop(pass);
            if let Some(&key)=stage_ends.get(&pass_index){
                let image=&self.program.images[output];
                let bytes=image.bytes();
                let charge=stage_image_charge(image);
                if self.stage_image_bytes.saturating_add(staged_bytes).saturating_add(charge)<=stage_limit{
                    let copy=buffer(&self.device,"stage/cache",bytes,wgpu::BufferUsages::COPY_SRC|wgpu::BufferUsages::COPY_DST);
                    encoder.copy_buffer_to_buffer(&slot.images[output],0,&copy,0,bytes);
                    staged_bytes+=charge;
                    staged_images.push(CachedStage{key:key.clone(),image:image.clone(),buffer:copy});
                }
            }
        }
        let mut presented = None;
        if let (Some(display), Some((pixels, transform, render)), false) = (&self.display, &slot.display, preview_advance) {
            let spec = self.program.display.as_ref().unwrap(); let info = &self.program.images[spec.image];
                    {
                        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("ACES2/SDR100"), timestamp_writes: None });
                        pass.set_pipeline(&display.transform); pass.set_bind_group(0, transform, &[]);
                        pass.dispatch_workgroups(info.width.div_ceil(8), info.height.div_ceil(8), 1);
                    }
            if let Some(entry)=&cache_copy{
                encoder.copy_buffer_to_buffer(pixels,0,&entry.buffer,0,entry.buffer.size());
            }
            if preview_revision.is_none() && self.preview_duration == 0 {
                presented = encode_presentation(display,render,&mut encoder,&self.queue,None)?;
            }
        }
        if let (Some(pack),Some((packed,staging,bindings,_)))=(&self.pack,&slot.export){
            let groups=crate::encode::pack_dispatch(packed.size()/4,self.device.limits().max_compute_workgroups_per_dimension)?;
            {let mut pass=encoder.begin_compute_pass(&wgpu::ComputePassDescriptor{label:Some("export/GPU-color-packing"),timestamp_writes:None});pass.set_pipeline(pack);pass.set_bind_group(0,bindings,&[]);pass.dispatch_workgroups(groups[0],groups[1],groups[2]);}
            encoder.copy_buffer_to_buffer(packed,0,staging,0,packed.size());
        }
        for (name,staging) in &slot.readbacks{
            let out=self.program.buffer_outputs.iter().find(|o|&o.id==name).unwrap();
            encoder.copy_buffer_to_buffer(&slot._data[out.buffer],0,staging,0,staging.size());
        }
        if let Some(timer)=timer{timer.finish(&mut encoder,f64::from(self.queue.get_timestamp_period()));}
        if let Some(e)=&self.program.media_export{let info=&self.program.images[e.image];if let Err(error)=self.videos.encode(&self.device,&self.queue,slot_id,self.export_submitted,&slot.images[e.image],info.width,info.height,encoder){self.closing=true;return Err(error);}}else{slot.submission=Some(self.queue.submit([encoder.finish()]));}
        if let Some(entry)=cache_copy{
            self.preview_frame_bytes+=entry.charge();
            self.preview_frames.push_back(entry);
        }
        self.stage_image_bytes+=staged_bytes;
        self.stage_images.extend(staged_images);
        self.state_cursors=next_state;
        if let Some(texture) = presented { self.queue.present(texture); }
        if skipped>0{self.preview_pruned_frames+=1;self.preview_pruned_passes+=skipped;}
        slot.frame = Some(frame);slot.publication=(skipped==0).then_some(frame);slot.preview_revision=preview_revision;
        if slot.export.is_some()||self.program.media_export.is_some(){slot.sequence=self.export_submitted;self.export_submitted+=1;}self.last_frame=Some(frame);self.continuation_consumed=true;self.submitted += 1;slot.generation=self.submitted;
        self.peak_in_flight=self.peak_in_flight.max(self.submitted-self.completed);
        if let Some((_,staging,_,bytes))=&slot.export{
            self.export_bytes+=*bytes as u64;let tx=self.mapped_tx.clone();staging.slice(..).map_async(wgpu::MapMode::Read,move|r|{let _=tx.send((slot_id,frame,r.map_err(|e|e.to_string())));});
        }else if self.program.media_export.is_none(){let tx = self.done_tx.clone();self.queue.on_submitted_work_done(move || { let _ = tx.send((slot_id, frame)); });}
        Ok(())
    }
    pub fn poll(&mut self) -> Result<Vec<(usize,u64,Option<u64>,Option<f64>)>, String> {
        // Poll is non-blocking; completion only gates SAFE reuse, not the next submission.
        self.device.poll(wgpu::PollType::Poll).map_err(|e| format!("E_NATIVE_DEVICE: {e}"))?;
        if let Ok(e) = self.errors.try_recv() { return Err(if e.starts_with("E_NATIVE_"){e}else{format!("E_NATIVE_DEVICE: {e}")}); }
        while let Ok((slot,frame,result))=self.mapped_rx.try_recv(){result.map_err(|e|format!("E_NATIVE_ENCODE: {e}"))?;let (_,staging,_,bytes)=self.slots[slot].export.as_ref().unwrap();self.pending_export.insert(self.slots[slot].sequence,Frame{slot,frame,buffer:staging.clone(),bytes:*bytes});}
        if let Some(encoder)=&mut self.encoder{
            if let Some(e)=encoder.failure(){return Err(e);}
            while let Some(frame)=self.pending_export.remove(&self.next_export){match encoder.send(frame){Ok(())=>{self.next_export+=1;},Err(mpsc::TrySendError::Full(frame))=>{self.pending_export.insert(self.next_export,frame);break;},Err(mpsc::TrySendError::Disconnected(frame))=>{self.pending_export.insert(self.next_export,frame);if let Some(e)=encoder.failure(){return Err(e);}break;}}}
        }
        for (slot,sequence) in self.videos.poll_encoder()?{if self.slots.get(slot).is_none_or(|s|s.sequence!=sequence){return Err("E_NATIVE_MEDIA_COMPLETION: stale sequence".into());}let frame=self.slots.get(slot).and_then(|s|s.frame).ok_or("E_NATIVE_MEDIA_COMPLETION: stale slot")?;let _=self.done_tx.send((slot,frame));}
        let mut ready = Vec::new();
        while let Ok((slot,frame)) = self.done_rx.try_recv() {
            if self.slots[slot].export.is_some()||self.program.media_export.is_some(){self.export_completed+=1;}
            let revision = self.slots[slot].preview_revision.take();
            let presented = if revision.is_some() && revision == self.preview_revision {
                self.present_preview(slot, frame)?.then_some(revision.unwrap())
            } else { None };
            let gpu_time=self.preview_timers.get_mut(&slot).and_then(|timer|timer.result.take()).and_then(|result|result.try_recv().ok()).flatten();
            if gpu_time.is_some(){self.preview_timing_samples+=1;self.last_preview_gpu_ms=gpu_time;}
            self.rays.completed(slot);self.optix.completed(slot);self.inference.completed(slot);self.slots[slot].frame = None; self.completed += 1; ready.push((slot,frame,presented,gpu_time));
        }
        Ok(ready)
    }
    pub async fn commit_preview_reload(&mut self, old:&mut Gpu, frame:u64, duration:u64,retain_preview:&[crate::protocol::PreviewRegion])
        -> Result<(u32,u32),String> {
        if self.closing || !self.idle() || self.last_frame!=Some(frame) {
            return Err("E_NATIVE_PREVIEW_RELOAD: replacement frame must be complete".into());
        }
        let mut end=0;
        for region in retain_preview{
            if region.start<end||region.end<=region.start||region.end>duration||
                region.signature.len()!=64||!region.signature.bytes().all(|b|b.is_ascii_hexdigit()){
                return Err("E_NATIVE_PREVIEW_CACHE: invalid retained preview intervals".into());
            }
            end=region.end;
        }
        let retained_bytes=if self.reused_preview_device{Some(self.program.validated_bytes()?)}else{None};
        let slot = self.slots.iter().position(|slot| slot.publication==Some(frame) && slot.generation==self.submitted && slot.display.is_some())
            .ok_or("E_NATIVE_PREVIEW_RELOAD: replacement display frame is unavailable")?;
        let spec = self.program.display.as_ref().ok_or("E_NATIVE_PREVIEW_RELOAD: replacement has no display")?;
        let info = &self.program.images[spec.image];
        let dimensions = self.preview_viewport.unwrap_or((info.width,info.height));
        validate_viewport(dimensions.0,dimensions.1,&self.device.limits())?;
        let old_surface = old.display.as_mut().and_then(|d| d.surface.as_mut()).or(old.parked_surface.as_mut())
            .ok_or("E_NATIVE_PREVIEW_RELOAD: no previous surface")?;
        let original = old_surface.get_configuration().ok_or("E_NATIVE_PREVIEW_RELOAD: surface is not configured")?;
        let mut config = original.clone();
        (config.width,config.height)=dimensions;
        config.desired_maximum_frame_latency=self.program.slots.min(2) as u32;
        device_image_admission(&self.program,&self.device.limits(),true)?;
        let scope = self.device.push_error_scope(wgpu::ErrorFilter::Validation);
        old_surface.configure(&self.device,&config);
        if let Some(error) = scope.pop().await {
            old_surface.configure(&old.device,&original);
            return Err(format!("E_NATIVE_PREVIEW_RELOAD: {error}"));
        }
        self.display.as_mut().unwrap().surface=old.display.as_mut().and_then(|d|d.surface.take()).or(old.parked_surface.take());
        self.preview_duration=duration;
        let result=self.present_preview(slot,frame);
        if !matches!(result, Ok(true)) {
            let surface=self.display.as_mut().unwrap().surface.take().unwrap();
            surface.configure(&old.device,&original);
            if let Some(display)=&mut old.display {display.surface=Some(surface);}else{old.parked_surface=Some(surface);}
            return Err(result.err().unwrap_or_else(||"E_NATIVE_PREVIEW_RELOAD: window is not ready for presentation".into()));
        }
        if let Some(active)=retained_bytes{
            self.preview_frames=std::mem::take(&mut old.preview_frames);
            self.preview_frames.retain(|entry|{
                let index=retain_preview.partition_point(|region|region.end<=entry.frame);
                retain_preview.get(index).is_some_and(|region|region.start<=entry.frame&&entry.key.starts_with(&region.signature))
            });
            self.preview_frame_bytes=self.preview_frames.iter().map(CachedPreviewFrame::charge).sum();
            self.trim_preview_frames(self.preview_frame_limit(active));
            let mut staged=std::mem::take(&mut old.stage_images);
            staged.retain(|entry|!self.stage_images.iter().any(|current|current.key==entry.key));
            self.stage_image_bytes+=staged.iter().map(|entry|stage_image_charge(&entry.image)).sum::<u64>();
            staged.append(&mut self.stage_images);
            self.stage_images=staged;
            self.trim_stage_images(self.stage_image_limit(active));
        }
        Ok(dimensions)
    }

    pub fn submit_cached_preview(&mut self,frame:u64,slot_id:usize,revision:u64,key:&str)->Result<bool,String>{
        if self.closing||self.preview_revision!=Some(revision){return Ok(false);}
        let slot=self.slots.get_mut(slot_id).ok_or("E_NATIVE_SLOT: invalid cached preview slot")?;
        if slot.frame.is_some(){return Err("E_NATIVE_SLOT_BUSY: cached preview requires an idle slot".into());}
        let Some(index)=self.preview_frames.iter().position(|entry|entry.frame==frame&&entry.key==key)else{
            self.preview_frame_misses+=1;
            return Ok(false);
        };
        let Some(display)=&self.display else{return Ok(false);};
        let entry=&self.preview_frames[index];
        let bindings=group(&self.device,&display.render.get_bind_group_layout(0),&[&entry.buffer,&entry.metadata,&display.controls]);
        let mut encoder=self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor{label:Some("preview/cached-present")});
        let progress=frame as f32/self.preview_duration.saturating_sub(1).max(1) as f32;
        let Some(texture)=encode_presentation(display,&bindings,&mut encoder,&self.queue,Some(progress))? else{return Ok(false);};
        self.queue.submit([encoder.finish()]);
        self.queue.present(texture);
        let entry=self.preview_frames.remove(index).unwrap();
        self.preview_frames.push_back(entry);
        slot.frame=Some(frame);slot.publication=None;slot.preview_revision=None;
        self.submitted+=1;
        self.peak_in_flight=self.peak_in_flight.max(self.submitted-self.completed);
        let tx=self.done_tx.clone();
        self.queue.on_submitted_work_done(move||{let _=tx.send((slot_id,frame));});
        self.preview_frame_hits+=1;
        Ok(true)
    }
    fn present_preview(&self, slot:usize, frame:u64) -> Result<bool,String> {
        let (Some(display), Some((_, _, render))) = (&self.display, &self.slots[slot].display) else { return Ok(false); };
        let fraction = frame as f32 / self.preview_duration.saturating_sub(1).max(1) as f32;
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label:Some("preview/present-current") });
        let Some(texture) = encode_presentation(display,render,&mut encoder,&self.queue,Some(fraction))? else { return Ok(false); };
        // The same queue orders this draw before any subsequent reuse of the slot.
        self.queue.submit([encoder.finish()]);
        self.queue.present(texture);
        Ok(true)
    }
    pub fn inference_capabilities(&mut self)->Result<Value,String>{self.inference.capabilities(&self.device)}
    pub fn idle(&self) -> bool { self.slots.iter().all(|s| s.frame.is_none()) }
    pub fn finish_export(&mut self)->Result<bool,String>{if self.videos.has_encoder(){return self.videos.finish_encoder();}match &mut self.encoder{Some(e)=>e.finish(),None=>Ok(true)}}
    pub fn stats(&self) -> Value {
        let l=self.device.limits();
        let mut capabilities=json!({"nativeImages":{"version":1,"admission":"device-and-session-budget","maxTextureDimension2D":l.max_texture_dimension_2d},"nativeMesh":{"version":1,"float32Blendable":self.device.features().contains(wgpu::Features::FLOAT32_BLENDABLE),"exactAdmission":"session-budget"},"version":1,"backend":"native-wgpu","execution":"recording","hardwareVerified":true,"pixelKernelAbis":[1,2],"computeKernelAbis":[1],"storageTypes":["f32","u32","i32"],"maxPendingPasses":self.program.max_bytes,"maxKernels":self.program.max_bytes,"capacityPolicy":"configured-metadata-and-device-budget","f16WorkingBytesPerPixel":16,"crossStageGpuHandles":false,"profiling":"disabled","limits":{"maxBufferSize":l.max_buffer_size,"maxStorageBufferBindingSize":l.max_storage_buffer_binding_size,"maxStorageBuffersPerShaderStage":l.max_storage_buffers_per_shader_stage,"maxUniformBufferBindingSize":l.max_uniform_buffer_binding_size,"maxComputeWorkgroupsPerDimension":l.max_compute_workgroups_per_dimension,"maxComputeInvocationsPerWorkgroup":l.max_compute_invocations_per_workgroup,"maxComputeWorkgroupSizeX":l.max_compute_workgroup_size_x,"maxComputeWorkgroupSizeY":l.max_compute_workgroup_size_y,"maxComputeWorkgroupSizeZ":l.max_compute_workgroup_size_z,"maxComputeWorkgroupStorageSize":l.max_compute_workgroup_storage_size}});
        capabilities["nativeResidentBuffers"]=json!({"version":1,"readOnly":true,"runtimeCreation":true});
        capabilities["nativeInference"]=json!({"version":1,"preallocatedOutputs":true,"stateContinuation":true,"imageContinuation":"same-frame-prefix-v1","outputAliasing":"forbidden","persistentOutput":"explicit-stateStep"});
        let mut result=json!({"backend":"native-wgpu","adapter":format!("{:?}",self.device.adapter_info()),"slots":self.slots.len(),
            "hardwareVideo":self.videos.stats(),"resourceImports":{"version":1,"binaryUploadBytes":self.binary_upload_bytes,"uploadBytes":self.resource_upload_bytes},"bufferExports":{"version":1,"readbacks":self.data_readbacks,"bytes":self.data_export_bytes},"stateCheckpoints":{"version":1,"count":self.checkpoints.len(),"bytes":self.checkpoints.values().map(|c|c.bytes).sum::<u64>(),"restores":self.checkpoint_restores,"cpuReadbacks":0},"persistentState":{"version":1,"buffers":self.persistent.len(),"cursors":self.state_cursors},"pipelineCache":{"version":1,"workingBuffersReused":self.buffers_reused,"meshAttachmentSetsReused":self.attachments_reused,"computeAndMeshCreated":self.pipelines_created,"computeAndMeshReused":self.pipelines_reused,"displayReuses":self.display_reuses,"retention":"current-program-only"},"frameBindings":{"version":1,"slotUpdates":self.frame_slot_updates,"allSlotsDrain":false},"protocolVersion":2,"devicesCreated":1,"programUpdates":self.reconfigurations,
            "externalImages":{"version":1,"available":self.interop.available,"enabled":self.interop.enabled,"reason":self.interop.reason},"nativeModules":self.modules.stats(),
            "capabilities":capabilities,
            "diagnosticsEnabled":cfg!(feature="diagnostics"),
            "submitted":self.submitted,"completed":self.completed,"inFlight":self.submitted-self.completed,
            "peakSubmittedInFlight":self.peak_in_flight,"allocatedImageBytes":self.allocated_image_bytes,
            "residentBuffers":{"version":1,"live":self.resident.entries.len(),"bytes":self.resident.entries.values().map(|v|v.definition.length*4).sum::<u64>(),"uploads":self.resident.uploads,"uploadBytes":self.resident.upload_bytes,"reuses":self.resident.reuses,"evictions":self.resident.evictions},
            "allocatedDataBytes":self.program.data.iter().enumerate().filter(|(_,d)|d.source_image.is_none()).map(|(i,d)|if d.immutable{d.length*4}else{self.slots.iter().filter_map(|s|s._data.get(i)).map(|b|b.size()).sum()}).sum::<u64>(),
            "imageReadbacks":if self.program.media_export.is_some(){0}else{self.export_submitted},"pixelTransferBytes":self.export_bytes,"frameHashes":0,"numericalValidationPasses":0,
            "export":{"enabled":self.encoder.is_some()||self.program.media_export.is_some(),"framesWritten":self.export_completed,"bytes":self.export_bytes,"pngTransport":false,"httpTransport":false,"cpuImageCopies":0,"hardwareEncode":self.program.media_export.is_some()||self.encoder_spec.as_ref().is_some_and(|(e,_,_)|matches!(e.codec.as_str(),"h264_nvenc"|"hevc_nvenc"|"av1_nvenc"))},
            "blockingGpuWaits":0,"diagnosticReadbacks":self.diagnostic_readbacks,"diagnosticReadbackBytes":self.diagnostic_bytes,
            "diagnosticBlockingWaits":self.diagnostic_readbacks,
            "workingImageBytes":self.program.images.iter().map(|i|i.bytes()).sum::<u64>()*self.slots.len() as u64});result["hardwareRayQuery"]=self.rays.stats();result["hardwareOptixRayQuery"]=self.optix.stats();result["capabilities"]["nativeRayQuery"]=json!({"version":1,"available":self.adapter.features().contains(wgpu::Features::EXPERIMENTAL_RAY_QUERY),"enabled":self.program.ray_query,"profile":"opaque-triangles-v1","experimental":true,"maxBlasPrimitives":l.max_blas_primitive_count,"maxTlasInstances":l.max_tlas_instance_count});result["inference"]=self.inference.stats();result["nativeEncoding"]=self.videos.encoder_stats();
        result["previewReplay"]=json!({"version":1,"optimizedFrames":self.preview_pruned_frames,"prunedImagePasses":self.preview_pruned_passes});
        result["previewFrameCache"]=json!({"version":1,"hits":self.preview_frame_hits,"misses":self.preview_frame_misses,
            "entries":self.preview_frames.len(),"chargedBytes":self.preview_frame_bytes,"deviceReusedOnReload":self.reused_preview_device});
        result["imageStorage"]=json!({"version":1,"packedF16Images":self.program.images.iter().filter(|i|i.storage.is_some()).count(),
            "physicalAllocationBytes":self.allocated_image_bytes});
        result["stageCache"]=json!({"hits":self.stage_hits,"misses":self.stage_misses,"retained":self.stage_images.len(),
            "skippedPasses":self.stage_passes_reused,"retainedBytes":self.stage_images.iter().map(|s|s.image.bytes()).sum::<u64>(),"chargedBytes":self.stage_image_bytes});
        result["planCache"]=json!({"hits":self.plan_hits,"misses":self.plan_misses,"evictions":self.plan_evictions,
            "retained":self.cached_plans.len(),"retainedBytes":self.cache_bytes()});
        if let Some((width,height))=self.preview_viewport{
            result["previewViewport"]=json!({"width":width,"height":height});
            result["previewTiming"]=json!({"supported":self.device.features().contains(wgpu::Features::TIMESTAMP_QUERY_INSIDE_ENCODERS),
                "samples":self.preview_timing_samples,"lastGpuMs":self.last_preview_gpu_ms,"timestampReadbackBytes":self.preview_timing_samples*16});
        }
        result
    }
    pub fn read_data(&mut self,frame:u64,slot:usize,publication:u64,name:&str,file:&str)->Result<u64,String>{
        let lease=self.program.data_export.as_ref().ok_or("E_NATIVE_DATA_PERMISSION: no explicit host export lease")?;
        let slot=self.slots.get(slot).ok_or("E_NATIVE_DATA_STALE: unavailable slot")?;
        if slot.publication!=Some(frame)||slot.generation!=publication{return Err("E_NATIVE_DATA_STALE: frame publication was replaced".into());}
        if slot.frame.is_some(){return Err("E_NATIVE_DATA_BUSY: complete the requested frame before export".into());}
        let out=self.program.buffer_outputs.iter().find(|o|o.id==name).ok_or("E_NATIVE_DATA_OUTPUT: buffer was not explicitly published")?;
        let data=&self.program.data[out.buffer];let source=&slot._data[out.buffer];let bytes=data.length*4;
        if data.persistent.as_ref().is_some_and(|s|!self.state_cursors.contains_key(&s.id)){return Err("E_NATIVE_STATE_SEQUENCE: unpublished initial state".into());}
        if !slot.readbacks.contains_key(name)&&data.persistent.is_some()&&!self.idle(){return Err("E_NATIVE_DATA_BUSY: uncaptured shared state needs a device-idle boundary".into());}
        let path=lease.path(file)?;if path.parent()!=self.data_export_directory.as_deref(){return Err("E_NATIVE_DATA_PERMISSION: export lease root changed".into());}let mut output=std::fs::OpenOptions::new().write(true).create_new(true).open(path).map_err(|e|format!("E_NATIVE_DATA_IO: {e}"))?;
        let (staging,submission)=if let Some(staging)=slot.readbacks.get(name){(staging.clone(),slot.submission.clone())}else{
            let staging=buffer(&self.device,"explicit/data-export",bytes,wgpu::BufferUsages::MAP_READ|wgpu::BufferUsages::COPY_DST);let mut encoder=self.device.create_command_encoder(&Default::default());encoder.copy_buffer_to_buffer(source,0,&staging,0,bytes);let submission=self.queue.submit([encoder.finish()]);(staging,Some(submission))
        };
        let(tx,rx)=mpsc::channel();staging.slice(..).map_async(wgpu::MapMode::Read,move|r|{let _=tx.send(r);});self.device.poll(wgpu::PollType::Wait{submission_index:submission,timeout:None}).map_err(|e|format!("E_NATIVE_DATA_IO: {e}"))?;rx.recv().map_err(|e|e.to_string())?.map_err(|e|e.to_string())?;let view=staging.slice(..).get_mapped_range().map_err(|e|e.to_string())?;let result=std::io::Write::write_all(&mut output,&view);drop(view);staging.unmap();result.map_err(|e|format!("E_NATIVE_DATA_IO: {e}"))?;self.data_readbacks+=1;self.data_export_bytes+=bytes;Ok(bytes)
    }
    #[cfg(feature = "diagnostics")]
    pub fn inspect(&mut self, slot:usize, image:usize) -> Result<Vec<f32>,String> {
        if !self.idle() { return Err("E_NATIVE_DIAGNOSTICS_BUSY: wait explicitly before test readback".into()); }
        let info=self.program.images.get(image).ok_or("E_NATIVE_DIAGNOSTICS_IMAGE")?;
        let bytes=info.bytes();
        let packed=info.storage.is_some();
        let image=self.slots.get(slot).and_then(|s|s.images.get(image)).ok_or("E_NATIVE_DIAGNOSTICS_IMAGE")?.clone();
        self.inspect_buffer(&image,bytes,packed)
    }
    #[cfg(feature="diagnostics")]
    pub fn inspect_media(&mut self,slot:usize)->Result<Vec<f32>,String>{if !self.idle(){return Err("E_NATIVE_DIAGNOSTICS_BUSY: complete all media submissions before inspection".into());}let result=self.videos.inspect_encoder(slot)?;self.diagnostic_readbacks+=1;self.diagnostic_bytes+=result.len()as u64*4;Ok(result)}
    #[cfg(feature = "diagnostics")]
    pub fn inspect_display(&mut self,slot:usize) -> Result<Vec<f32>,String> {
        if !self.idle() { return Err("E_NATIVE_DIAGNOSTICS_BUSY: wait explicitly before test readback".into()); }
        let image=self.slots.get(slot).and_then(|s|s.display.as_ref()).ok_or("E_NATIVE_DIAGNOSTICS_DISPLAY")?.0.clone();
        self.inspect_buffer(&image,image.size(),false)
    }
    #[cfg(feature = "diagnostics")]
    fn inspect_buffer(&mut self,image:&wgpu::Buffer,bytes:u64,packed:bool) -> Result<Vec<f32>,String> {
        self.diagnostic_readbacks+=1;self.diagnostic_bytes+=bytes;
        let staging = buffer(&self.device, "test-only/readback", bytes, wgpu::BufferUsages::MAP_READ|wgpu::BufferUsages::COPY_DST);
        let mut encoder = self.device.create_command_encoder(&Default::default());
        encoder.copy_buffer_to_buffer(image,0,&staging,0,bytes); self.queue.submit([encoder.finish()]);
        let (tx,rx)=mpsc::channel(); staging.slice(..).map_async(wgpu::MapMode::Read,move |r| {let _=tx.send(r);});
        self.device.poll(wgpu::PollType::wait_indefinitely()).map_err(|e|e.to_string())?;
        rx.recv().map_err(|e|e.to_string())?.map_err(|e|e.to_string())?;
        let view=staging.slice(..).get_mapped_range().map_err(|e|e.to_string())?;
        let pixels=if packed{
            view.chunks_exact(2).map(|b|{
                let bits=u32::from(u16::from_le_bytes([b[0],b[1]]));
                let sign=(bits&0x8000)<<16;
                let exp=(bits>>10)&31;
                let mantissa=bits&1023;
                f32::from_bits(sign|match exp{
                    0=>(mantissa as f32*(1.0/16_777_216.0)).to_bits(),
                    31=>0x7f800000|(mantissa<<13),
                    _=>((exp+112)<<23)|(mantissa<<13),
                })
            }).collect()
        }else{view.chunks_exact(4).map(|b|f32::from_le_bytes(b.try_into().unwrap())).collect()};
        drop(view);staging.unmap();Ok(pixels)
    }
}

fn validate_viewport(width:u32,height:u32,limits:&wgpu::Limits)->Result<(),String>{
    if width==0||height==0||width.max(height)>limits.max_texture_dimension_2d{
        return Err("E_NATIVE_DISPLAY: window viewport exceeds device limits".into());
    }
    Ok(())
}

fn display_metadata(image:&crate::protocol::Image)->[u32;4]{
    [image.width,image.height,u32::from(image.alpha=="premultiplied"),0]
}
fn encode_presentation(display:&Display, render:&wgpu::BindGroup, encoder:&mut wgpu::CommandEncoder, queue:&wgpu::Queue, progress:Option<f32>)
    -> Result<Option<wgpu::SurfaceTexture>,String> {
    let Some(surface) = &display.surface else { return Ok(None); };
    let texture = match surface.get_current_texture() {
        wgpu::CurrentSurfaceTexture::Success(texture) | wgpu::CurrentSurfaceTexture::Suboptimal(texture) => texture,
        wgpu::CurrentSurfaceTexture::Occluded | wgpu::CurrentSurfaceTexture::Timeout if progress.is_some() => return Ok(None),
        status => return Err(format!("E_NATIVE_DISPLAY: acquire {status:?}")),
    };
    let (width,height)=(texture.texture.width(),texture.texture.height());
    let layout=crate::preview_controls::Layout::new(width,height);
    queue.write_buffer(&display.controls,0,&words(&[u32::from(progress.is_some()),progress.unwrap_or(0.).to_bits(),
        width,height,layout.left,layout.cell,layout.toolbar,layout.strip]));
    let view = texture.texture.create_view(&Default::default());
    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label:Some("native/swapchain"),
            color_attachments:&[Some(wgpu::RenderPassColorAttachment { view:&view, resolve_target:None, depth_slice:None,
                ops:wgpu::Operations { load:wgpu::LoadOp::Clear(wgpu::Color::BLACK), store:wgpu::StoreOp::Store } })],
            depth_stencil_attachment:None, timestamp_writes:None, occlusion_query_set:None, multiview_mask:None,
        });
        pass.set_pipeline(&display.render);
        pass.set_bind_group(0, render, &[]);
        pass.draw(0..3, 0..1);
    }
    Ok(Some(texture))
}

const PRESENT: &str = concat!(include_str!("preview-controls.wgsl"), r#"
@group(0) @binding(0) var<storage,read> pixels:array<vec4f>;
@group(0) @binding(1) var<uniform> p:vec4u;
struct PreviewControls { presentation:vec4u, geometry:vec4u }
@group(0) @binding(2) var<uniform> controls:PreviewControls;
@vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
 let v=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));
 return vec4f(v[i],0.,1.);
}
fn displayPixel(at:vec2i)->vec3f {
 let xy=vec2u(clamp(at,vec2i(0),vec2i(p.xy)-1));
 let v=pixels[xy.y*p.x+xy.x];
 return select(v.rgb*v.a,v.rgb,p.z==1u);
}
@fragment fn fragment(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let viewport=controls.presentation.zw;
 var extent=vec2f(viewport);
 var at=pos.xy;
 if(controls.presentation.x!=0u){
    let toolbar=f32(viewport.y-controls.geometry.z);
    let strip=toolbar-f32(controls.geometry.w);
    if(pos.y>=toolbar){return previewToolbar(vec2f(pos.x,pos.y-toolbar),controls.geometry);}
    if(pos.y>=strip){
       let progress=bitcast<f32>(controls.presentation.y)*f32(viewport.x-1u);
       if(abs(pos.x-progress)<1.5){return vec4f(.8,.92,1.,1.);}
       return select(vec4f(.10,.11,.14,1.),vec4f(.20,.42,.72,1.),pos.x<=progress);
    }
    let available=vec2f(f32(viewport.x),strip);
    let scale=min(available.x/f32(p.x),available.y/f32(p.y));
    extent=vec2f(p.xy)*scale;
    at-=(available-extent)*.5;
    if(any(at<vec2f(0.)) || any(at>=extent)){return vec4f(0.,0.,0.,1.);}
 }
 if(all(extent==vec2f(p.xy))){return vec4f(displayPixel(vec2i(at)),1.);}
 let source=at*vec2f(p.xy)/extent-.5;
 let a=vec2i(floor(source));
 let f=fract(source);
 let top=mix(displayPixel(a),displayPixel(a+vec2i(1,0)),f.x);
 let bottom=mix(displayPixel(a+vec2i(0,1)),displayPixel(a+vec2i(1,1)),f.x);
 return vec4f(mix(top,bottom,f.y),1.);
}
"#);
fn mesh_resolve_shader()->String{format!("{}{}{}",r#"
@group(0) @binding(0) var color:texture_2d<f32>;
@group(0) @binding(1) var<storage,read_write> output:array<vec4f>;
struct ResolveMeta{dimensions:vec4u,input:vec4u,profile:vec4u}
@group(0) @binding(2) var<uniform> settings:ResolveMeta;
"#,include_str!("half.wgsl"),r#"@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) p:vec3u){let dimensions=settings.dimensions;if(p.x>=dimensions.x||p.y>=dimensions.y){return;}var v=textureLoad(color,vec2i(p.xy),0);if(settings.profile.w==2u&&dimensions.w==1u){if(v.a==0.){v=vec4f(0.);}else{v=vec4f(v.rgb/v.a,v.a);}}if(dimensions.z==1u){v=vec4f(half(v.r),half(v.g),half(v.b),half(v.a));}output[p.y*dimensions.x+p.x]=v;}
"#)}

#[cfg(test)]
mod preview_replay_tests {
    use super::preview_advance_passes;
    use crate::protocol::Program;
    use serde_json::json;

    #[test]
    fn preview_toolbar_shader_validates() {
        let module = naga::front::wgsl::parse_str(super::PRESENT).unwrap();
        naga::valid::Validator::new(naga::valid::ValidationFlags::all(), naga::valid::Capabilities::all())
            .validate(&module).unwrap();
    }

    fn plan()->Program{
        let image=json!({"width":8,"height":8,"format":"rgba32float","alpha":"opaque","color":{}});
        serde_json::from_value(json!({
            "version":2,"session":"test","slots":1,"maxBytes":1048576,
            "images":[image.clone(),image.clone(),image.clone(),image.clone(),image],
            "kernels":[
                {"code":"pixel","inputCount":1,"parameterWords":0,"headerWords":32,"replayImage":"whole-output-v1"},
                {"code":"compute","inputCount":2,"parameterWords":0,"headerWords":32,"kind":"compute"}
            ],
            "passes":[
                {"kernel":0,"inputs":[],"output":0,"header":[]},
                {"kernel":0,"inputs":[0],"output":1,"header":[]},
                {"kernel":1,"inputs":[],"output":0,"header":[],"buffers":[0,1]},
                {"kernel":1,"inputs":[],"output":0,"header":[],"buffers":[1,2]},
                {"kernel":0,"inputs":[1],"output":2,"header":[],"data":[2]},
                {"kernel":0,"inputs":[2],"output":3,"header":[]}
            ],
            "data":[
                {"length":256,"type":"f32","initial":[],"sourceImage":1},
                {"length":1,"type":"f32","initial":[]},
                {"length":1,"type":"f32","initial":[],"persistent":{"version":1,"id":"sim"}}
            ]
        })).unwrap()
    }

    #[test]
    fn preview_replay_retains_transitive_image_views_and_compute_writes(){
        assert_eq!(&*preview_advance_passes(&plan()).unwrap(),&[true,true,true,true,false,false]);
    }

    #[test]
    fn preview_replay_keeps_full_graph_for_partial_and_externally_observable_work(){
        let mut p=plan();
        p.kernels[0].replay_image=None;
        assert!(preview_advance_passes(&p).is_none());
        p.kernels[0].replay_image=Some("whole-output-v1".into());
        p.passes[0].groups=Some([1,1,1]);
        assert!(preview_advance_passes(&p).is_none());
        p.passes[0].groups=None;
        p.state_continuation=true;
        assert!(preview_advance_passes(&p).is_none());
    }
}
