//! Bounded exact transparency inside the existing owner. No host queries or
//! frame readback: ping-pong depth/primitive IDs peel in per-pixel depth order;
//! GPU-written indirect commands stop work after an empty layer.
use crate::gpu::{buffer,compute};
use crate::protocol::{Image,words};
use wgpu::util::DeviceExt;

#[derive(Clone)]
pub struct PeelPipelines{initialize:wgpu::ComputePipeline,accumulate:wgpu::ComputePipeline,finish:wgpu::ComputePipeline}
impl PeelPipelines{
    pub fn new(device:&wgpu::Device)->Self{
        Self{initialize:compute(device,&format!("{}{}{}",FINAL_BINDINGS,"@group(0) @binding(2) var<storage,read_write> transmittance:array<f32>;",INITIALIZE),"main"),accumulate:compute(device,ACCUMULATE,"main"),finish:compute(device,&format!("{}{}{}",FINAL_BINDINGS,include_str!("half.wgsl"),FINAL_BODY),"main")}
    }
}
struct Layer{draw:wgpu::BindGroup,resolve:wgpu::BindGroup,_uniform:wgpu::Buffer}
pub struct PeelScratch{colors:[wgpu::TextureView;2],depths:[wgpu::TextureView;2],ids:[wgpu::TextureView;2],commands:[wgpu::Buffer;2],alive:wgpu::Buffer,transmittance:wgpu::Buffer}
pub struct PeelPass{
    colors:[wgpu::TextureView;2],depths:[wgpu::TextureView;2],ids:[wgpu::TextureView;2],
    commands:[wgpu::Buffer;2],seed:wgpu::Buffer,alive:wgpu::Buffer,_output:wgpu::Buffer,_transmittance:wgpu::Buffer,
    layers:[Layer;3],layer_count:u32,initialize_group:wgpu::BindGroup,finish_group:wgpu::BindGroup,initialize:wgpu::ComputePipeline,accumulate:wgpu::ComputePipeline,finish:wgpu::ComputePipeline,
    _indices:wgpu::Buffer,groups:[u32;2],
}
impl PeelPass{
    #[allow(clippy::too_many_arguments)]
    pub fn new(device:&wgpu::Device,pipeline:&wgpu::RenderPipeline,p:&PeelPipelines,image:&Image,positions:&wgpu::Buffer,uv:Option<&wgpu::Buffer>,texture:Option<&wgpu::Buffer>,settings:&wgpu::Buffer,indices:Option<&wgpu::Buffer>,count:u32,output:&wgpu::Buffer,reuse:Option<PeelScratch>)->Self{
        let make=|label,format|device.create_texture(&wgpu::TextureDescriptor{label:Some(label),size:wgpu::Extent3d{width:image.width,height:image.height,depth_or_array_layers:1},mip_level_count:1,sample_count:1,dimension:wgpu::TextureDimension::D2,format,usage:wgpu::TextureUsages::RENDER_ATTACHMENT|wgpu::TextureUsages::TEXTURE_BINDING,view_formats:&[]}).create_view(&Default::default());
        let scratch=reuse.unwrap_or_else(||{let colors=std::array::from_fn(|_|make("mesh/peel-color",wgpu::TextureFormat::Rgba32Float));
        let depths=std::array::from_fn(|_|make("mesh/peel-depth",wgpu::TextureFormat::Depth32Float));
        let ids=std::array::from_fn(|_|make("mesh/peel-id",wgpu::TextureFormat::R32Uint));
        let commands=std::array::from_fn(|_|buffer(device,"mesh/indirect",28,wgpu::BufferUsages::STORAGE|wgpu::BufferUsages::INDIRECT|wgpu::BufferUsages::COPY_DST));

        let alive=buffer(device,"mesh/active-layer",4,wgpu::BufferUsages::STORAGE|wgpu::BufferUsages::COPY_DST);
        let transmittance=buffer(device,"mesh/transmittance",image.width as u64*image.height as u64*4,wgpu::BufferUsages::STORAGE);
        PeelScratch{colors,depths,ids,commands,alive,transmittance}});
        let PeelScratch{colors,depths,ids,commands,alive,transmittance}=scratch;
        let seed=device.create_buffer_init(&wgpu::util::BufferInitDescriptor{label:Some("mesh/indirect-seed"),contents:&words(&[count,1,0,0,image.width.div_ceil(8),image.height.div_ceil(8),1]),usage:wgpu::BufferUsages::COPY_SRC});
        let index=indices.cloned().unwrap_or_else(||device.create_buffer_init(&wgpu::util::BufferInitDescriptor{label:Some("mesh/identity-indices"),contents:&words(&(0..count).collect::<Vec<_>>()),usage:wgpu::BufferUsages::STORAGE}));
        let base=if uv.is_some(){4}else{2};
        // Only first/even/odd bindings differ. Reuse these three records for
        // every geometric layer instead of allocating one record per triangle.
        let layers=std::array::from_fn(|variant|{
            let current=variant%2;let previous=1-current;
            let uniform=device.create_buffer_init(&wgpu::util::BufferInitDescriptor{label:Some("mesh/peel-layer"),contents:&words(&[u32::from(variant!=0),count,image.width,image.height]),usage:wgpu::BufferUsages::UNIFORM});
            let b=|binding,resource|wgpu::BindGroupEntry{binding,resource};
            let mut entries=vec![b(0,positions.as_entire_binding())];
            if let Some(uv)=uv{entries.push(b(1,uv.as_entire_binding()));entries.push(b(2,texture.unwrap().as_entire_binding()));}
            entries.extend([b(base-1,settings.as_entire_binding()),b(base,index.as_entire_binding()),b(base+1,wgpu::BindingResource::TextureView(&depths[previous])),b(base+2,wgpu::BindingResource::TextureView(&ids[previous])),b(base+3,alive.as_entire_binding()),b(base+4,uniform.as_entire_binding()),b(base+5,transmittance.as_entire_binding())]);
            let draw=device.create_bind_group(&wgpu::BindGroupDescriptor{label:Some("mesh/peel-draw"),layout:&pipeline.get_bind_group_layout(0),entries:&entries});
            let resolve=device.create_bind_group(&wgpu::BindGroupDescriptor{label:Some("mesh/peel-accumulate"),layout:&p.accumulate.get_bind_group_layout(0),entries:&[b(0,wgpu::BindingResource::TextureView(&colors[current])),b(1,output.as_entire_binding()),b(2,commands[previous].as_entire_binding()),b(3,alive.as_entire_binding()),b(4,uniform.as_entire_binding()),b(5,transmittance.as_entire_binding())]});
            Layer{draw,resolve,_uniform:uniform}
        });
        let finish_group=device.create_bind_group(&wgpu::BindGroupDescriptor{label:Some("mesh/peel-publication"),layout:&p.finish.get_bind_group_layout(0),entries:&[wgpu::BindGroupEntry{binding:0,resource:output.as_entire_binding()},wgpu::BindGroupEntry{binding:1,resource:settings.as_entire_binding()}]});
        let initialize_group=device.create_bind_group(&wgpu::BindGroupDescriptor{label:Some("mesh/peel-transmittance"),layout:&p.initialize.get_bind_group_layout(0),entries:&[wgpu::BindGroupEntry{binding:0,resource:output.as_entire_binding()},wgpu::BindGroupEntry{binding:1,resource:settings.as_entire_binding()},wgpu::BindGroupEntry{binding:2,resource:transmittance.as_entire_binding()}]});
        Self{colors,depths,ids,commands,seed,alive,_output:output.clone(),_transmittance:transmittance,layers,layer_count:count/3,initialize_group,finish_group,initialize:p.initialize.clone(),accumulate:p.accumulate.clone(),finish:p.finish.clone(),_indices:index,groups:[image.width.div_ceil(8),image.height.div_ceil(8)]}
    }
    pub fn scratch(&self)->PeelScratch{PeelScratch{colors:self.colors.clone(),depths:self.depths.clone(),ids:self.ids.clone(),commands:self.commands.clone(),alive:self.alive.clone(),transmittance:self._transmittance.clone()}}
    pub fn encode(&self,encoder:&mut wgpu::CommandEncoder,pipeline:&wgpu::RenderPipeline){
        {let mut pass=encoder.begin_compute_pass(&wgpu::ComputePassDescriptor{label:Some("mesh/initial-transmittance"),timestamp_writes:None});pass.set_pipeline(&self.initialize);pass.set_bind_group(0,&self.initialize_group,&[]);pass.dispatch_workgroups(self.groups[0],self.groups[1],1);}encoder.copy_buffer_to_buffer(&self.seed,0,&self.commands[0],0,28);
        for i in 0..self.layer_count{
            let current=i as usize%2;let next=1-current;let layer=&self.layers[if i==0{0}else if current==1{1}else{2}];
            encoder.clear_buffer(&self.commands[next],0,None);encoder.clear_buffer(&self.alive,0,None);
            {let mut pass=encoder.begin_render_pass(&wgpu::RenderPassDescriptor{label:Some("mesh/exact-depth-layer"),color_attachments:&[Some(wgpu::RenderPassColorAttachment{view:&self.colors[current],resolve_target:None,depth_slice:None,ops:wgpu::Operations{load:wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),store:wgpu::StoreOp::Store}}),Some(wgpu::RenderPassColorAttachment{view:&self.ids[current],resolve_target:None,depth_slice:None,ops:wgpu::Operations{load:wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),store:wgpu::StoreOp::Store}})],depth_stencil_attachment:Some(wgpu::RenderPassDepthStencilAttachment{view:&self.depths[current],depth_ops:Some(wgpu::Operations{load:wgpu::LoadOp::Clear(1.),store:wgpu::StoreOp::Store}),stencil_ops:None}),timestamp_writes:None,occlusion_query_set:None,multiview_mask:None});
             pass.set_pipeline(pipeline);pass.set_bind_group(0,&layer.draw,&[]);pass.draw_indirect(&self.commands[current],0);}
            {let mut pass=encoder.begin_compute_pass(&wgpu::ComputePassDescriptor{label:Some("mesh/PM-front-to-back"),timestamp_writes:None});pass.set_pipeline(&self.accumulate);pass.set_bind_group(0,&layer.resolve,&[]);pass.dispatch_workgroups_indirect(&self.commands[current],16);}
        }
        let mut pass=encoder.begin_compute_pass(&wgpu::ComputePassDescriptor{label:Some("mesh/transparent-publication"),timestamp_writes:None});pass.set_pipeline(&self.finish);pass.set_bind_group(0,&self.finish_group,&[]);pass.dispatch_workgroups(self.groups[0],self.groups[1],1);
    }
}
const ACCUMULATE:&str=r#"
@group(0) @binding(0) var color:texture_2d<f32>;
@group(0) @binding(1) var<storage,read_write> accumulated:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> next:array<u32>;
@group(0) @binding(3) var<storage,read> alive:u32;
@group(0) @binding(4) var<uniform> layer:vec4u;
@group(0) @binding(5) var<storage,read_write> transmittance:array<f32>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) p:vec3u){
 if(p.x>=layer.z||p.y>=layer.w){return;}
 if(p.x==0u&&p.y==0u&&alive!=0u){next[0]=layer.y;next[1]=1u;next[2]=0u;next[3]=0u;next[4]=(layer.z+7u)/8u;next[5]=(layer.w+7u)/8u;next[6]=1u;}
 // Store remaining transmittance independently: deriving it from rounded Alpha
 // loses HDR contributions behind almost-opaque layers.
 let i=p.y*layer.z+p.x;let a=accumulated[i];let b=textureLoad(color,vec2i(p.xy),0);let t=transmittance[i];accumulated[i]=a+b*t;transmittance[i]=t*(1.-b.a);
}"#;
const FINAL_BINDINGS:&str=r#"
@group(0) @binding(0) var<storage,read_write> output:array<vec4f>;
struct Meta{header:array<vec4u,8>}
@group(0) @binding(1) var<uniform> settings:Meta;
"#;
const FINAL_BODY:&str=r#"
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) p:vec3u){let d=settings.header[0];if(p.x>=d.x||p.y>=d.y){return;}
 let i=p.y*d.x+p.x;var v=output[i];if(d.w==1u){if(v.a==0.){v=vec4f(0.);}else{v=vec4f(v.rgb/v.a,v.a);}}
 if(d.z==1u){v=vec4f(half(v.r),half(v.g),half(v.b),half(v.a));}output[i]=v;
}"#;
const INITIALIZE:&str=r#"
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) p:vec3u){let d=settings.header[0];if(p.x<d.x&&p.y<d.y){let i=p.y*d.x+p.x;output[i]=vec4f(0.);transmittance[i]=1.;}}
"#;
