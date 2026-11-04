//! Private native data plane, not TVG / P4 ABI / CPU Surface.
use serde::Deserialize;

pub const VERSION: u32 = 2;
// Frame concurrency is admitted by the caller byte budget, not a fixed slot count.

#[derive(Debug, Deserialize,Clone)]
pub struct Request {
    pub id: u64,
    #[serde(flatten)]
    pub command: Command,
}

#[derive(Debug, Deserialize,Clone)]
#[serde(tag = "op", rename_all = "camelCase", deny_unknown_fields)]
pub enum Command {
    Init { program: Program },
    Submit { session: String, frame: u64, slot: usize, parameters: Vec<Vec<u32>>, #[serde(default,rename="frameBindings")] frame_bindings:Option<FrameBindings>, #[serde(default,rename="previewRevision")] preview_revision:Option<u64>, #[serde(default,rename="previewAdvance")] preview_advance:bool, #[serde(default,rename="previewTiming")] preview_timing:bool, #[serde(default,rename="stageCache")] stage_cache:Vec<StageCacheRef>, #[serde(default,rename="previewCacheKey")]preview_cache_key:Option<String> },
    SubmitCachedPreview {session:String,frame:u64,slot:usize,revision:u64,key:String},
    PreviewState { session:String, revision:u64, input:u64, duration:u64, label:String, active:bool },
    PreviewAudioStart {session:String,revision:u64,input:u64,rate:u32,start:u64,end:u64},
    PreviewAudioQueue {session:String,revision:u64,start:u64,frames:u32,#[serde(skip)] pcm:Vec<u8>},
    PreviewAudioStop {session:String,revision:u64},
    PreparePreviewReload {session:String, program:Program},
    CommitPreviewReload {session:String, frame:u64, revision:u64, input:u64, duration:u64,#[serde(default,rename="retainPreview")]retain_preview:Vec<PreviewRegion>},
    AbortPreviewReload {session:String},
    SubmitBatch { session: String, frames: Vec<FrameSubmission> },
    Reconfigure {program:Program,#[serde(default,rename="cacheId")]cache_id:Option<u64>},
    ActivatePlan {session:String, #[serde(rename="cacheId")]cache_id:u64},
    Stats { session: String },
    InferenceCapabilities {session:String},
    ReadData {session:String,frame:u64,slot:usize,publication:u64,name:String,file:String},
    StateCheckpoint {session:String,action:String,name:String},
    Close { session: String },
    #[cfg(feature = "diagnostics")]
    Inspect { session: String, slot: usize, image: usize },
    #[cfg(feature = "diagnostics")]
    InspectDisplay { session: String, slot: usize },
    #[cfg(feature = "diagnostics")]
    InspectMedia {session:String,slot:usize},
}

#[derive(Debug, Deserialize,Clone)]
#[serde(deny_unknown_fields)]
pub struct FrameSubmission { pub frame:u64, pub slot:usize, pub parameters:Vec<Vec<u32>>, #[serde(default,rename="frameBindings")]pub frame_bindings:Option<FrameBindings> }

#[derive(Debug,Deserialize,Clone)]
#[serde(deny_unknown_fields)]
pub struct StageCacheRef {pub pass:usize,pub key:String,#[serde(default)]pub first:Option<usize>}

#[derive(Debug,Deserialize,Clone)]
#[serde(deny_unknown_fields)]
pub struct PreviewRegion{pub start:u64,pub end:u64,pub signature:String}

#[derive(Debug, Deserialize,Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Program {
    #[serde(default)]pub frame_continuation:Option<FrameContinuation>,
    #[serde(default)]pub inferences:Vec<crate::inference_contract::Inference>,
    #[serde(default)]pub ray_query:bool,
    pub version: u32,
    pub session: String,
    pub slots: usize,
    pub max_bytes: u64,
    #[serde(default)]pub preview_reuse:Option<String>,
    #[serde(default)]pub state_continuation:bool,
    pub images: Vec<Image>,
    pub kernels: Vec<Kernel>,
    pub passes: Vec<Pass>,
    pub display: Option<Display>,
    #[serde(default)]
    pub image_allocations: Option<Vec<usize>>,
    #[serde(default)]
    pub data: Vec<Data>,
    #[serde(default)]
    pub export:Option<Export>,
    #[serde(default)]pub media_export:Option<MediaExport>,
    #[serde(default)] pub imports:Vec<ImageImport>,
    #[serde(default)] pub modules:Vec<NativeModule>,
    #[serde(default)]pub buffer_outputs:Vec<BufferOutput>,
    #[serde(default)]pub data_export:Option<Bridge>,
    #[serde(default)]pub resource_lease:Option<Bridge>,
}
#[derive(Debug,Deserialize,Clone)]#[serde(rename_all="camelCase",deny_unknown_fields)]pub struct FrameContinuation{pub version:u32,pub frame:u64,pub images:usize,pub data:usize}
#[derive(Debug,Deserialize,Clone)]#[serde(deny_unknown_fields)]pub struct BufferOutput{pub version:u32,pub id:String,pub buffer:usize,pub info:serde_json::Value}
#[derive(Debug,Deserialize,Clone,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct NativeModule {
 pub version:u32,pub id:String,pub module_version:String,pub profile:String,pub execution:String,
 pub width:u32,pub height:u32,pub input:bool,pub html:String,
 #[serde(default)]pub javascript:String,#[serde(default="module_timeout")]pub timeout_ms:u64,
 #[serde(default)]pub seed:u32,
}
fn module_timeout()->u64{3000}
impl NativeModule{
 pub fn validate(&self)->Result<(),String>{
  if self.version!=1||self.id!="frameweave.servo"||self.module_version!="0.1.0"||self.profile!="sdr-srgb8"||self.execution!="trusted-local"||
   self.width==0||self.height==0||u128::from(self.width)*u128::from(self.height)*16>u128::from(u64::MAX)||self.timeout_ms==0{return Err("E_NATIVE_MODULE: unsupported or unbounded reviewed-local Servo module".into());}Ok(())
 }
}
#[derive(Debug,Deserialize,Clone)]
#[serde(deny_unknown_fields)]
pub struct Bridge {pub version:u32,pub directory:String}
impl Bridge{
    pub fn video_path(&self,file:&str)->Result<std::path::PathBuf,String>{
        if self.version!=1||file.len()>96||![".mp4",".mov",".m4v"].iter().any(|e|file.ends_with(e))||file.contains("..")||!file.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'-'||c==b'.'){return Err("E_NATIVE_VIDEO_LEASE: expected a private MPEG-4 file".into());}
        let root=std::fs::canonicalize(&self.directory).map_err(|e|format!("E_NATIVE_VIDEO_LEASE: {e}"))?;let path=root.join(file);let metadata=std::fs::symlink_metadata(&path).map_err(|e|format!("E_NATIVE_VIDEO_LEASE: {e}"))?;
        if !root.is_dir()||!metadata.is_file()||metadata.file_type().is_symlink(){return Err("E_NATIVE_VIDEO_LEASE: expected a regular private file".into());}Ok(path)
    }
    pub fn path(&self,file:&str)->Result<std::path::PathBuf,String>{
        if self.version!=1||file.len()>96||!file.ends_with(".f32")||file.is_empty()||!file.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'-'||c==b'.')||file.contains(".."){return Err("E_NATIVE_BRIDGE: invalid private file lease".into());}
        let root=std::fs::canonicalize(&self.directory).map_err(|e|format!("E_NATIVE_BRIDGE_IO: {e}"))?;
        if !root.is_dir(){return Err("E_NATIVE_BRIDGE: lease root is not a directory".into());}
        let path=root.join(file);
        if let Ok(meta)=std::fs::symlink_metadata(&path){if !meta.is_file()||meta.file_type().is_symlink(){return Err("E_NATIVE_BRIDGE: expected a regular leased file".into());}}
        Ok(path)
    }
}
#[derive(Debug,Deserialize,Clone)]
#[serde(deny_unknown_fields)]
pub struct ImageImport {pub image:usize,pub file:String,#[serde(default)]pub source:Option<String>,#[serde(default)]pub stream:Option<String>,#[serde(default)]pub video:Option<VideoFrame>}
#[derive(Debug,Deserialize,Clone,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct VideoFrame{pub frame:u64,pub pts:i64,pub width:u32,pub height:u32,pub ten_bit:bool,pub transfer:u32,pub primaries:u32,pub matrix:[f32;12],pub reference_white:f32,pub peak_nits:f32,pub hlg_gamma:f32}

#[derive(Debug, Deserialize,Clone)]
#[serde(deny_unknown_fields)]
pub struct Export {pub executable:String,pub output:String,pub image:usize,pub fps:[u32;2],pub codec:String,pub format:String,pub display:bool}
#[derive(Debug,Deserialize,Clone,PartialEq)]#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct MediaExport{pub version:u32,pub image:usize,pub output:String,pub codec:String,pub fps:[u32;2],pub primaries:u32,pub transfer:u32,pub shader:String,pub textures:Vec<MediaLut>,pub working_color:serde_json::Value,pub matte:[f32;3],pub alpha:u32,pub hdr:Option<MediaHdr>,pub provenance:serde_json::Value}
#[derive(Debug,Deserialize,Clone,PartialEq)]#[serde(deny_unknown_fields)]pub struct MediaLut{pub width:u32,pub height:u32,pub channels:u32,pub linear:bool,pub values:Vec<f32>}
#[derive(Debug,Deserialize,Clone,PartialEq)]#[serde(rename_all="camelCase",deny_unknown_fields)]pub struct MediaHdr{pub chromaticities:[u16;8],pub max_nits:u32,pub min_nits:u32,#[serde(rename="maxCLL")]pub max_cll:u16,#[serde(rename="maxFALL")]pub max_fall:u16}

#[derive(Debug, Deserialize,Clone,PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Data {pub length:u64,pub r#type:String,pub initial:Vec<u32>,#[serde(default)] pub immutable:bool,#[serde(default)]pub resident:Option<Resident>,#[serde(default,rename="sourceImage")]pub source_image:Option<usize>,#[serde(default,rename="sourceResource")]pub source_resource:Option<crate::binary_resource::Import>,#[serde(default)]pub persistent:Option<Persistent>}
#[derive(Debug,Deserialize,Clone,PartialEq)]#[serde(deny_unknown_fields)]pub struct Resident{pub version:u32,pub id:String}
#[derive(Debug,Deserialize,Clone,PartialEq)]#[serde(deny_unknown_fields)]pub struct Persistent{pub version:u32,pub id:String}

#[derive(Debug, Deserialize,Clone,PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Image {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub alpha: String,
    #[serde(default)]pub storage: Option<String>,
    // Opaque serialized color identity is checked by TS before admission.
    pub color: serde_json::Value,
}
impl Image {
    pub fn bytes(&self) -> u64 { self.width as u64 * self.height as u64 * if self.storage.is_some(){8}else{16} }
}

#[derive(Debug, Deserialize,Clone,PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Kernel {
    pub code: String,
    pub input_count: usize,
    pub parameter_words: usize,
    pub header_words: usize,
    #[serde(default)]pub packed_mask: u32,
    #[serde(default)]pub replay_image: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub target_format:Option<String>,
    #[serde(default)]
    pub mesh_mode:Option<String>,
}
#[derive(Debug, Deserialize,Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Pass {
    pub kernel: usize,
    pub inputs: Vec<usize>,
    pub output: usize,
    pub header: Vec<u32>,
    #[serde(default)]
    pub data: Vec<usize>,
    #[serde(default)]
    pub buffers: Option<Vec<usize>>,
    #[serde(default)]
    pub groups: Option<[u32;3]>,
    #[serde(default)]
    pub draw:Option<Draw>,
    #[serde(default)]pub module:Option<usize>,
    #[serde(default)]pub state:bool,
    #[serde(default)]pub inference:Option<usize>,
    #[serde(default)]pub ray_build:Option<crate::ray_contract::Scene>,
    #[serde(default)]pub ray_query:Option<usize>,
}
#[derive(Debug, Deserialize,Clone)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Draw {pub positions:usize,pub indices:Option<usize>,pub uvs:Option<usize>,pub texture_version:Option<u32>,pub count:u32}
#[derive(Debug, Deserialize,Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Display {
    pub image: usize,
    pub shader: String,
    pub reach: Vec<u32>,
    pub cusp: Vec<u32>,
    pub profile: String,
}

impl Program {
    pub fn import_lease(&self,item:&ImageImport)->Result<&Bridge,String>{if !matches!(item.source.as_deref(),Some("declared-resource"|"declared-video"|"hardware-video")){return Err("E_NATIVE_RESOURCE: unsupported image import source".into());}self.resource_lease.as_ref().ok_or("E_NATIVE_RESOURCE: missing declared resource lease".into())}
    pub fn allocation_layout(&self) -> Result<(Vec<usize>,Vec<u64>),String> {
        let map=self.image_allocations.clone().unwrap_or_else(||(0..self.images.len()).collect());
        if map.len()!=self.images.len()||map.iter().any(|&n|n>=self.images.len()){return Err("E_NATIVE_ALLOCATION: invalid image mapping".into());}
        if self.frame_continuation.is_some()&&map.iter().enumerate().any(|(i,&v)|i!=v){return Err("E_NATIVE_FRAME_CONTINUATION: borrowed images require identity allocation".into());}
        let (born,last)=self.image_lifetimes()?;
        let mut sizes=vec![0;map.iter().max().copied().unwrap_or(0)+1];
        for (i,&a) in map.iter().enumerate(){sizes[a]=sizes[a].max(self.images[i].bytes());for j in 0..i{if map[j]==a&&!(last[j]<born[i]||last[i]<born[j]){return Err("E_NATIVE_ALLOCATION: overlapping image lifetimes alias".into());}}}
        Ok((map,sizes))
    }
    pub fn image_lifetimes(&self)->Result<(Vec<usize>,Vec<usize>),String>{
        let mut born=vec![usize::MAX;self.images.len()];let mut last=vec![0;self.images.len()];
        for item in &self.imports{if item.image>=born.len(){return Err("E_NATIVE_BRIDGE: invalid imported image".into());}born[item.image]=0;}
        for (n,p) in self.passes.iter().enumerate(){if p.buffers.is_some(){continue;}if p.output>=born.len()||p.inputs.iter().any(|&i|i>=born.len()){return Err("E_NATIVE_PASS: invalid image reference".into());}born[p.output]=n;last[p.output]=n;for &i in &p.inputs{last[i]=n;}}
        for (n,p) in self.passes.iter().enumerate(){for &d in p.buffers.iter().flatten().chain(p.data.iter()).chain(p.draw.iter().map(|d|&d.positions)).chain(p.draw.iter().filter_map(|d|d.indices.as_ref())).chain(p.draw.iter().filter_map(|d|d.uvs.as_ref())){if let Some(i)=self.data.get(d).and_then(|v|v.source_image){if i>=last.len(){return Err("E_NATIVE_DATA: unknown image view".into());}last[i]=last[i].max(n);}}}
        for out in &self.buffer_outputs{if let Some(i)=self.data.get(out.buffer).and_then(|d|d.source_image){if i>=last.len(){return Err("E_NATIVE_DATA: unknown published image view".into());}last[i]=self.passes.len();}}
        if let Some(d)=&self.display {if d.image>=last.len(){return Err("E_NATIVE_DISPLAY: invalid output".into());}last[d.image]=self.passes.len();}
        if let Some(p)=self.passes.iter().rev().find(|p|p.buffers.is_none()){last[p.output]=self.passes.len();}
        Ok((born,last))
    }
    fn validate_metadata(&self)->Result<(),String>{
        let mut n=std::mem::size_of::<Self>() as u128;
        n+=self.images.len()as u128*std::mem::size_of::<Image>()as u128+self.slots as u128*64;
        for k in &self.kernels{n+=std::mem::size_of::<Kernel>()as u128+k.code.len()as u128;}
        for p in &self.passes{n+=std::mem::size_of::<Pass>()as u128+(p.inputs.len()+p.data.len()+p.buffers.as_ref().map_or(0,Vec::len))as u128*std::mem::size_of::<usize>()as u128+p.header.len()as u128*4;}
        n+=self.data.len()as u128*std::mem::size_of::<Data>()as u128+self.imports.len()as u128*std::mem::size_of::<ImageImport>()as u128+self.buffer_outputs.len()as u128*std::mem::size_of::<BufferOutput>()as u128;
        for m in &self.modules{n+=std::mem::size_of::<NativeModule>()as u128+m.html.len()as u128+m.javascript.len()as u128;}
        if let Some(d)=&self.display{n+=d.shader.len()as u128;}
        if let Some(e)=&self.media_export{n+=e.shader.len()as u128+e.textures.len()as u128*std::mem::size_of::<MediaLut>()as u128;}
        if n>u128::from(self.max_bytes){return Err(format!("E_NATIVE_METADATA_BUDGET: {n} metadata bytes exceeds configured {}",self.max_bytes));}Ok(())
    }
    pub fn validate(&self)->Result<(),String>{self.validated_bytes().map(|_|())}
    pub fn validated_bytes(&self)->Result<u64,String>{
        if self.version!=1&&self.version!=VERSION{return Err("E_NATIVE_PROTOCOL: expected native protocol 1/2".into());}
        if self.version==1&&(self.ray_query||!self.data.is_empty()||self.kernels.iter().any(|k|k.kind.is_some()||k.mesh_mode.is_some())||self.export.is_some()||self.media_export.is_some()||!self.inferences.is_empty()||!self.imports.is_empty()||!self.modules.is_empty()||self.data_export.is_some()||self.resource_lease.is_some()||!self.buffer_outputs.is_empty()){return Err("E_NATIVE_PROTOCOL: extended native programs require protocol 2".into());}
        if self.session.len() != 64 || !self.session.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err("E_NATIVE_SESSION: expected an owner-scoped random session identity".into());
        }
        if self.slots == 0 || self.images.is_empty() ||
            (self.kernels.is_empty() && (!self.passes.is_empty() || self.imports.is_empty())) ||
            self.max_bytes == 0 || self.max_bytes > 9_007_199_254_740_991 {
            return Err("E_NATIVE_BUDGET: invalid bounded program".into());
        }
        self.validate_metadata()?;
        if let Some(c)=&self.frame_continuation{if self.version!=2||self.slots!=1||c.version!=1||c.frame>9_007_199_254_740_991||c.images>self.images.len()||c.data>self.data.len(){return Err("E_NATIVE_FRAME_CONTINUATION: invalid same-frame prefix v1".into());}}
        if self.state_continuation&&(self.version!=2||self.slots!=1||self.display.is_some()||self.export.is_some()||self.media_export.is_some()||!self.buffer_outputs.is_empty()||self.passes.is_empty()||self.passes.iter().any(|p|p.draw.is_some()||p.module.is_some()||p.ray_build.is_some()||p.ray_query.is_some())){return Err("E_NATIVE_SEGMENT_PROFILE: only same-frame pixel/color/compute/state/inference work may suspend presentation and encoding".into());}
        let mut bytes = 0u128;

        for module in &self.modules{module.validate()?;bytes+=u128::from(module.width)*u128::from(module.height)*4*(1+u128::from(module.input))*self.slots as u128;}

        for image in &self.images {
            if image.width == 0 || image.height == 0 || image.width as u64 * image.height as u64 > u32::MAX as u64 / 4 ||
                !["rgba16float", "rgba32float"].contains(&image.format.as_str()) ||
                image.storage.as_ref().is_some_and(|s|s!="packed-f16-v1"||image.format!="rgba16float") ||
                !["straight", "premultiplied", "opaque"].contains(&image.alpha.as_str()) {
                return Err("E_NATIVE_IMAGE: invalid professional image metadata".into());
            }
        }
        let packed=|i:usize| self.images.get(i).is_some_and(|i|i.storage.is_some());
        if self.frame_continuation.is_some()&&self.images.iter().any(|i|i.storage.is_some())||
            self.data.iter().any(|d|d.source_image.is_some_and(packed))||
            self.imports.iter().any(|d|packed(d.image))||
            self.display.as_ref().is_some_and(|d|packed(d.image))||
            self.export.as_ref().is_some_and(|d|packed(d.image))||
            self.media_export.as_ref().is_some_and(|d|packed(d.image))||
            self.passes.iter().rev().find(|p|p.buffers.is_none()).is_some_and(|p|packed(p.output)){
            return Err("E_NATIVE_IMAGE_STORAGE: packed images are internal pixel intermediates".into());
        }
        for b in [&self.data_export,&self.resource_lease].into_iter().flatten(){if b.version!=1||b.directory.is_empty()||b.directory.len()>4096||!std::path::Path::new(&b.directory).is_absolute(){return Err("E_NATIVE_DATA_PERMISSION: invalid private file lease".into());}}
        if self.data_export.is_some(){bytes+=self.buffer_outputs.iter().filter_map(|o|self.data.get(o.buffer)).map(|d|u128::from(d.length)*4).max().unwrap_or(0);}
        bytes += self.allocation_layout()?.1.iter().map(|&n|u128::from(n)).sum::<u128>() * self.slots as u128;

        let mut ids=std::collections::HashSet::new();for o in &self.buffer_outputs{let d=self.data.get(o.buffer).ok_or("E_NATIVE_DATA_OUTPUT: unknown published buffer")?;if o.version!=1||o.id.is_empty()||o.id.len()>512||!ids.insert(&o.id)||o.info["type"]!=d.r#type||o.info["length"].as_u64()!=Some(d.length)||o.info["byteLength"].as_u64()!=Some(d.length*4){return Err("E_NATIVE_DATA_OUTPUT: invalid publication v1".into());}}
        let mut resident=std::collections::HashSet::new();for d in &self.data{if let Some(r)=&d.resident{if r.version!=1||r.id.is_empty()||!resident.insert(&r.id)||!d.immutable||d.persistent.is_some()||d.source_image.is_some()||d.source_resource.is_some()||(!d.initial.is_empty()&&d.initial.len()as u64!=d.length){return Err("E_NATIVE_RESIDENT_PROTOCOL: complete immutable resident definition required".into());}}}
        let mut states=std::collections::HashSet::new();for d in &self.data{if let Some(s)=&d.persistent{if s.version!=1||s.id.is_empty()||s.id.len()>512||d.immutable||d.source_image.is_some()||!states.insert(&s.id){return Err("E_NATIVE_STATE: invalid persistent state v1 definition".into());}}}if !states.is_empty()&&self.slots!=1{return Err("E_NATIVE_STATE_CONCURRENCY: ordered state requires one frame slot".into());}
        for d in &self.data{if let Some(s)=&d.source_resource{s.validate(d,self)?;}if d.length==0||d.length>0x3fffffff||!matches!(d.r#type.as_str(),"f32"|"u32"|"i32")||d.initial.len()as u64>d.length{return Err("E_NATIVE_DATA: invalid bounded typed buffer".into());}if let Some(i)=d.source_image{if d.r#type!="f32"||d.immutable||!d.initial.is_empty()||self.images.get(i).is_none_or(|i|i.bytes()!=d.length*4){return Err("E_NATIVE_DATA: invalid read-only F32 image view".into());}}else{bytes+=if d.immutable{u128::from(d.length)*4}else{u128::from(d.length)*4*self.slots as u128+d.initial.len()as u128*4};}}
        for kernel in &self.kernels {
            if kernel.replay_image.as_ref().is_some_and(|mode|mode!="whole-output-v1"||!matches!(kernel.kind.as_deref(),None|Some("raster"|"mesh"|"color"))){
                return Err("E_NATIVE_REPLAY_PROFILE: unsupported image replay semantics".into());
            }
            if kernel.code.is_empty() ||  kernel.mesh_mode.is_some()&&kernel.kind.as_deref()!=Some("mesh") ||
                kernel.input_count > u32::MAX as usize || kernel.parameter_words > u32::MAX as usize || kernel.header_words < 16&&kernel.kind.as_deref()!=Some("raster") || kernel.header_words>u32::MAX as usize || kernel.header_words%4!=0 || kernel.kind.as_deref().is_some_and(|k|k!="compute"&&k!="mesh"&&k!="raster"&&k!="module"&&k!="state"&&k!="color"&&k!="inference"&&k!="ray-build"&&k!="ray-query") {
                return Err("E_NATIVE_KERNEL: invalid pixel-v1 kernel layout".into());
            }
        }
        let mut published = vec![false; self.images.len()];if let Some(c)=&self.frame_continuation{published[..c.images].fill(true);}
        for item in &self.imports{
            if item.image>=published.len()||published[item.image]||!matches!(item.source.as_deref(),Some("declared-resource"|"declared-video"|"hardware-video")){return Err("E_NATIVE_RESOURCE: duplicate or invalid working image import".into());}
            if matches!(item.source.as_deref(),Some("declared-video"|"hardware-video"))&&item.stream.as_ref().is_none_or(|s|s.is_empty()||s.len()>4096)||item.source.as_deref()==Some("declared-resource")&&item.stream.is_some(){return Err("E_NATIVE_RESOURCE: invalid declared video identity".into());}
            if item.source.as_deref()==Some("hardware-video"){
                bytes+=u128::from(self.images[item.image].bytes())*self.slots as u128;self.import_lease(item)?.video_path(&item.file)?;let v=item.video.as_ref().ok_or("E_NATIVE_VIDEO_PROTOCOL: missing source descriptor")?;
                if v.width==0||v.height==0||v.frame>i64::MAX as u64||v.pts<0||!(1..=3).contains(&v.transfer)||!(1..=2).contains(&v.primaries)||v.matrix.iter().any(|n|!n.is_finite())||!v.reference_white.is_finite()||v.reference_white<=0.||!v.peak_nits.is_finite()||v.peak_nits<=0.||!v.hlg_gamma.is_finite()||v.hlg_gamma<1.||self.images[item.image].alpha!="opaque"{return Err("E_NATIVE_VIDEO_PROTOCOL: invalid bounded float video descriptor".into());}
            }else{if item.video.is_some(){return Err("E_NATIVE_VIDEO_PROTOCOL: unexpected video descriptor".into());}self.import_lease(item)?.path(&item.file)?;}
                        if let Some(v)=&item.video{bytes+=u128::from(v.width).div_ceil(128)*128*u128::from(v.height).div_ceil(128)*128*if v.ten_bit{3}else{2};}
            published[item.image]=true;
        }
        let active_models=self.passes.iter().filter_map(|p|p.inference).chain(self.inferences.iter().enumerate().filter_map(|(i,m)|(!m.file.is_empty()).then_some(i))).collect::<std::collections::HashSet<_>>();
        for index in active_models{let m=self.inferences.get(index).ok_or("E_INFERENCE_IDENTITY: unknown model")?;let shared=m.validate()?;if self.resource_lease.is_none(){return Err("E_INFERENCE_MODEL_UNDECLARED: missing resource lease".into());}bytes+=u128::from(m.model.bytes)+u128::from(shared)*self.slots as u128;}
        for (pass_index,pass) in self.passes.iter().enumerate() {
            let kernel = self.kernels.get(pass.kernel).ok_or("E_NATIVE_KERNEL: missing kernel")?;
            let mask=if pass.buffers.is_none(){
                pass.inputs.iter().take(4).enumerate().fold(u32::from(packed(pass.output)),|mask,(j,&i)|mask|(u32::from(packed(i))<<(j+1)))
            }else{0};
            if mask!=kernel.packed_mask||mask!=0&&(pass.inputs.len()>4||!matches!(kernel.kind.as_deref(),None|Some("color"))||pass.draw.is_some()||pass.module.is_some()||pass.inference.is_some()||pass.state||pass.ray_build.is_some()||pass.ray_query.is_some()){
                return Err("E_NATIVE_IMAGE_STORAGE: packed binding layout differs from the pixel specialization".into());
            }
            if pass.ray_build.is_some()||pass.ray_query.is_some(){
                if !self.ray_query{return Err("E_NATIVE_RAY_PERMISSION: operator must opt in to experimental ray query".into());}if kernel.input_count!=0||kernel.parameter_words!=0||kernel.header_words!=16||pass.header.len()!=16||pass.state||pass.module.is_some()||pass.inference.is_some()||pass.draw.is_some()||pass.groups.is_some()||!pass.inputs.is_empty()||!pass.data.is_empty(){return Err("E_NATIVE_RAY_SCHEMA: invalid fixed ray pass".into());}
                if let Some(scene)=&pass.ray_build{if pass.ray_query.is_some()||kernel.kind.as_deref()!=Some("ray-build"){return Err("E_NATIVE_RAY_SCHEMA: scene build kind mismatch".into());}scene.validate(self)?;let refs=scene.geometries.iter().flat_map(|g|std::iter::once(g.positions).chain(g.indices)).collect::<Vec<_>>();if pass.buffers.as_ref()!=Some(&refs)||refs.iter().any(|&i|self.data[i].source_image.is_some_and(|n|!published[n])){return Err("E_NATIVE_RAY_GEOMETRY: unpublished/foreign geometry input".into());}bytes+=u128::from(scene.private_bytes()?)*self.slots as u128;}
                else if let Some(index)=pass.ray_query{if index>=pass_index||self.passes.get(index).and_then(|p|p.ray_build.as_ref()).is_none()||kernel.kind.as_deref()!=Some("ray-query"){return Err("E_NATIVE_RAY_SEQUENCE: build scene before query".into());}let b=pass.buffers.as_ref().ok_or("E_NATIVE_RAY_INPUT: missing buffers")?;let count=pass.header[0]as u64;let lo=f32::from_bits(pass.header[1]);let hi=f32::from_bits(pass.header[2]);if b.len()!=5||count==0||!lo.is_finite()||!hi.is_finite()||lo<0.||hi<=lo||pass.header[3]>255{return Err("E_NATIVE_RAY_INPUT: invalid count/range/mask".into());}let mut outputs=std::collections::HashSet::new();for(i,&index)in b.iter().enumerate(){let d=self.data.get(index).ok_or("E_NATIVE_RAY_INPUT: unknown data")?;if d.r#type!=if i==2{"u32"}else{"f32"}||d.length<count*if i<2{3}else{4}||d.source_image.is_some_and(|n|!published[n])||i>=2&&(d.immutable||d.persistent.is_some()||d.source_image.is_some()||!outputs.insert(index)||b[..2].contains(&index)){return Err("E_NATIVE_RAY_INPUT: dtype/length/ownership mismatch".into());}}}
                bytes+=(80+if pass.ray_query.is_some(){16}else{0})*self.slots as u128;continue;
            }
            if matches!(kernel.kind.as_deref(),Some("ray-build"|"ray-query")){return Err("E_NATIVE_RAY_SCHEMA: missing fixed ray binding".into());}
            if let Some(index)=pass.inference{
                let m=&self.inferences[index];let b=pass.buffers.as_ref().ok_or("E_INFERENCE_BINDING: missing tensor buffers")?;
                if kernel.kind.as_deref()!=Some("inference")||kernel.input_count!=0||kernel.parameter_words!=0||kernel.header_words!=16||pass.header.len()!=16||pass.state||pass.module.is_some()||pass.draw.is_some()||pass.groups.is_some()||!pass.inputs.is_empty()||!pass.data.is_empty()||b.len()!=m.inputs.len()+m.outputs.len(){return Err("E_INFERENCE_BINDING: invalid model pass v1".into());}
                let mut outputs=std::collections::HashSet::new();for(i,t)in m.inputs.iter().chain(&m.outputs).enumerate(){let d=self.data.get(b[i]).ok_or("E_INFERENCE_BINDING: unknown tensor buffer")?;if d.r#type!="f32"||d.length*4!=t.bytes()?||i<m.inputs.len()&&d.source_image.is_some_and(|n|!published[n])||i>=m.inputs.len()&&(d.immutable||d.source_image.is_some()||d.source_resource.is_some()||!outputs.insert(b[i])||b[..m.inputs.len()].contains(&b[i])){return Err("E_INFERENCE_BINDING: tensor dtype/shape/ownership or publication mismatch".into());}}
                bytes+=80*self.slots as u128;continue;
            }
            if kernel.kind.as_deref()==Some("inference"){return Err("E_INFERENCE_BINDING: inference kernel missing model binding".into());}
            if pass.state{let b=pass.buffers.as_ref().ok_or("E_NATIVE_STATE: missing state leases")?;if kernel.kind.as_deref()!=Some("state")||kernel.parameter_words!=3||kernel.header_words!=16||b.is_empty()||b.len()!=kernel.input_count||b.iter().any(|&d|self.data.get(d).is_none_or(|d|d.persistent.is_none()))||b.iter().collect::<std::collections::HashSet<_>>().len()!=b.len()||pass.header.len()!=16||!pass.inputs.is_empty()||!pass.data.is_empty()||pass.draw.is_some()||pass.module.is_some(){return Err("E_NATIVE_STATE: invalid state control v1".into());}bytes+=80*self.slots as u128;continue;}
            if let Some(buffers)=&pass.buffers{
                if kernel.kind.as_deref()!=Some("compute")||buffers.len()!=kernel.input_count||buffers.iter().any(|&i|i>=self.data.len())||pass.header.len()!=kernel.header_words||pass.groups.is_none_or(|g|g.iter().any(|&v|v==0)){return Err("E_NATIVE_COMPUTE: invalid compute bindings/dispatch".into());}
                for (binding,&d) in buffers.iter().enumerate(){if self.data[d].source_resource.is_some(){crate::binary_resource::readonly(kernel,binding as u32)?;}if self.data[d].resident.is_some(){crate::binary_resource::readonly(kernel,binding as u32).map_err(|_|"E_NATIVE_RESIDENT_READ_ONLY: writable resident binding")?;}if let Some(i)=self.data[d].source_image{if !published[i]{return Err("E_NATIVE_DATA: image view used before publication".into());}let module=naga::front::wgsl::parse_str(&kernel.code).map_err(|_|"E_NATIVE_SHADER: invalid image-view compute shader")?;if !module.global_variables.iter().any(|(_,v)|v.binding.as_ref().is_some_and(|b|b.group==0&&b.binding==binding as u32)&&matches!(v.space,naga::AddressSpace::Storage{access} if !access.contains(naga::StorageAccess::STORE))){return Err("E_NATIVE_DATA: image view requires a read-only storage binding".into());}}}
                bytes+=(kernel.header_words as u128+(kernel.parameter_words as u128).max(1).div_ceil(4)*4)*4*self.slots as u128;continue;
            }
            if let Some(index)=pass.module{
                let module=self.modules.get(index).ok_or("E_NATIVE_MODULE: missing fixed module")?;
                let output=self.images.get(pass.output).ok_or("E_NATIVE_MODULE: missing module output")?;
                let color=serde_json::json!({"primaries":"rec709","whitePoint":"D65","transfer":"linear","reference":"scene","range":"full","referenceWhiteNits":100});
                if kernel.kind.as_deref()!=Some("module")||pass.draw.is_some()||!pass.data.is_empty()||kernel.parameter_words<1||kernel.header_words!=32||kernel.input_count!=usize::from(module.input)||
                    output.width!=module.width||output.height!=module.height||output.format!="rgba32float"||output.alpha!="premultiplied"||output.color!=color||
                    pass.inputs.iter().any(|&i|self.images.get(i).is_none_or(|v|v.width!=module.width||v.height!=module.height)) {return Err("E_NATIVE_MODULE: incompatible fixed SDR8 module bindings".into());}
            }else if let Some(draw)=&pass.draw{
                if kernel.kind.as_deref()!=Some("mesh")||pass.output>=self.images.len()||kernel.target_format.as_ref()!=Some(&self.images[pass.output].format)||kernel.parameter_words!=20||draw.positions>=self.data.len()||draw.count<3||draw.count%3!=0||draw.indices.is_some_and(|i|i>=self.data.len())||self.data[draw.positions].r#type!="f32"||draw.indices.is_none()&&draw.count as u64*3>self.data[draw.positions].length||draw.indices.is_some_and(|i|self.data[i].r#type!="u32"||draw.count as u64>self.data[i].length){return Err("E_NATIVE_MESH: invalid resident triangle draw".into());}
                let mode=match kernel.mesh_mode.as_deref(){None=>0,Some("cutout")=>1,Some("source-over")=>2,Some("depth-peel")=>3,_=>return Err("E_NATIVE_MESH: unsupported raster profile".into())};
                if pass.header.len()!=32||pass.header[11]!=mode||mode>0&&self.images[pass.output].alpha=="opaque"||mode==1&&{let a=f32::from_bits(pass.header[13]);!a.is_finite()||!(0.0..=1.0).contains(&a)}{return Err("E_NATIVE_MESH: invalid raster v1 layout".into());}
                if draw.uvs.is_some(){
                    let uv=draw.uvs.and_then(|i|self.data.get(i)).ok_or("E_NATIVE_MESH: missing UV buffer")?;
                    let needed=if draw.indices.is_some(){self.data[draw.positions].length/3}else{draw.count as u64};
                    if draw.texture_version!=Some(1)||kernel.input_count!=1||uv.r#type!="f32"||uv.length%2!=0||uv.length/2<needed||pass.header.len()!=32||pass.header[7]>1||pass.header[8]>3||pass.header[9]>3||pass.header[10]!=1||self.images[pass.output].alpha=="opaque"{return Err("E_NATIVE_MESH: invalid texture/UV v1 layout".into());}
                }else if draw.texture_version.is_some()||kernel.input_count!=0{return Err("E_NATIVE_MESH: incomplete texture/UV v1 layout".into());}
                if self.data[draw.positions].source_resource.is_some(){crate::binary_resource::readonly(kernel,0)?;}if let Some(i)=draw.uvs{if self.data[i].source_resource.is_some(){crate::binary_resource::readonly(kernel,1)?;}}if mode==3{if let Some(i)=draw.indices{if self.data[i].source_resource.is_some(){crate::binary_resource::readonly(kernel,if draw.uvs.is_some(){4}else{2})?;}}}
                for d in std::iter::once(draw.positions).chain(draw.indices).chain(draw.uvs){if self.data[d].source_image.is_some_and(|i|!published[i]){return Err("E_NATIVE_DATA: mesh image view used before publication".into());}}
                let image=&self.images[pass.output];bytes+=(image.width as u128*image.height as u128*if mode==3{52}else{20}+if mode==3{136+if draw.indices.is_none(){draw.count as u128*4}else{0}}else{0})*self.slots as u128;
            }else if kernel.kind.as_deref()==Some("color"){
                if kernel.input_count!=1||kernel.parameter_words!=20||kernel.header_words!=32||pass.inputs.len()!=1||!pass.data.is_empty()||pass.output>=self.images.len()||pass.inputs[0]>=self.images.len(){return Err("E_NATIVE_COLOR: invalid color conversion v1 layout".into());}
                let source=&self.images[pass.inputs[0]];let target=&self.images[pass.output];
                if source.width!=target.width||source.height!=target.height||source.alpha!=target.alpha||[source,target].iter().any(|i|!scene_linear_color(&i.color)){return Err("E_NATIVE_COLOR: explicit matching scene-linear surfaces required".into());}
            }else if kernel.kind.as_deref().is_some_and(|k|k!="raster"){return Err("E_NATIVE_DATA: invalid pixel kernel kind".into());}
            if pass.data.iter().any(|&i|i>=self.data.len()){return Err("E_NATIVE_DATA: invalid pixel data bindings".into());}
            for (j,&d)in pass.data.iter().enumerate(){if self.data[d].source_resource.is_some(){crate::binary_resource::readonly(kernel,(pass.inputs.len()+j)as u32)?;}}
            if pass.data.iter().any(|&d|self.data[d].source_image.is_some_and(|i|!published[i])){return Err("E_NATIVE_DATA: image view used before publication".into());}
            if pass.inputs.len() != kernel.input_count || pass.output >= published.len() ||
                published[pass.output] || pass.inputs.iter().any(|&i| i >= published.len() || !published[i]) ||
                pass.inputs.contains(&pass.output) || pass.header.len() != kernel.header_words {
                return Err("E_NATIVE_PASS: inputs must be previously published, output single-assignment".into());
            }
            let image = &self.images[pass.output];
            let alpha = match image.alpha.as_str() { "straight" => 1, "premultiplied" => 0, _ => 2 };
            if kernel.kind.as_deref()==Some("raster"){
                if kernel.header_words!=0||kernel.parameter_words!=44||kernel.input_count!=3{return Err("E_NATIVE_RASTER: invalid compensated compositor layout".into());}
            }else if pass.header[0..4] != [image.width, image.height, u32::from(image.format == "rgba16float"), alpha] {
                return Err("E_NATIVE_PASS: output header differs from image metadata".into());
            }
            for (j, &i) in pass.inputs.iter().enumerate() {
                let input = &self.images[i];
                let alpha = match input.alpha.as_str() { "straight" => 1, "premultiplied" => 0, _ => 2 };
                if kernel.kind.as_deref()!=Some("raster")&&pass.header[4*(j+1)..4*(j+1)+3] != [input.width, input.height, alpha] ||
                    kernel.kind.as_deref()!=Some("color")&&input.color != image.color {
                    return Err("E_NATIVE_PASS: input metadata/color identity mismatch".into());
                }
            }
            published[pass.output] = true;
            bytes += (kernel.header_words as u128+(kernel.parameter_words as u128).max(1).div_ceil(4)*4)*4*self.slots as u128;
        }
        if let Some(display) = &self.display {
            if display.image >= published.len() || !published[display.image] ||

                !(display.profile=="aces2-sdr100-v1"&&display.reach.len()==363&&display.cusp.len()==1452||display.profile=="linear709-sdr-v1"&&display.reach.is_empty()&&display.cusp.is_empty()) {
                return Err("E_NATIVE_DISPLAY: invalid fixed display profile".into());
            }
            bytes += u128::from(self.images[display.image].bytes()) * self.slots as u128 + 4*(display.reach.len()+display.cusp.len()) as u128 + 16*self.slots as u128;
        }
        if let Some(e)=&self.export{
            if e.image>=published.len()||!published[e.image]||e.executable.is_empty()||e.output.is_empty()||e.fps.contains(&0)||!matches!(e.codec.as_str(),"h264_nvenc"|"hevc_nvenc"|"av1_nvenc"|"libx264"|"libx265"|"libaom-av1"|"png"|"exr")||!matches!(e.format.as_str(),"nv12"|"rgba"|"gbrapf32le")||e.display&&self.display.as_ref().is_none_or(|d|d.image!=e.image){return Err("E_NATIVE_ENCODE: invalid explicit export".into());}
            let image=&self.images[e.image];if e.format=="nv12"&&(image.width%2!=0||image.height%2!=0){return Err("E_NATIVE_ENCODE: NV12 needs even dimensions".into());}
            let raw=image.width as u64*image.height as u64*match e.format.as_str(){"nv12"=>6,"rgba"=>16,_=>64}/4;
            bytes+=u128::from(raw).div_ceil(4)*8*self.slots as u128;
        }
        if let Some(e)=&self.media_export{
            if self.export.is_some()||e.version!=1||e.image>=published.len()||!published[e.image]||!matches!(e.codec.as_str(),"hevc_nvenc"|"av1_nvenc")||e.output.is_empty()||e.output.contains('\0')||e.fps.contains(&0)||e.primaries!=2||!matches!(e.transfer,16|18)||e.alpha>2||e.shader.len()>u32::MAX as usize||e.textures.len()>u32::MAX as usize||e.matte.iter().any(|x|!x.is_finite())||e.hdr.is_some()!=(e.transfer==16){return Err("E_NATIVE_MEDIA_PROFILE: invalid explicit GPU delivery".into());}
            let image=&self.images[e.image];if image.color!=e.working_color{return Err("E_NATIVE_MEDIA_COLOR: working encoding differs from the GPU profile".into());}if image.width%2!=0||image.height%2!=0{return Err("E_NATIVE_MEDIA_SIZE: 4:2:0 needs even dimensions".into());}
            let mut lut=0u128;for t in &e.textures{if t.width==0||t.height==0||!matches!(t.channels,1|3)||t.values.len()as u128!=u128::from(t.width)*u128::from(t.height)*u128::from(t.channels)||t.values.iter().any(|x|!x.is_finite()){return Err("E_NATIVE_MEDIA_LUT: invalid bounded immutable OCIO data".into());}lut+=u128::from(t.width)*u128::from(t.height)*if t.channels==1{4}else{16};}
            bytes+=u128::from(image.width)*u128::from(image.height)*35*self.slots as u128+8*1024*1024*self.slots as u128+lut;
        }
        if bytes > u128::from(self.max_bytes) { return Err(format!("E_NATIVE_BUDGET: {bytes} bytes exceeds {}", self.max_bytes)); }
        Ok(bytes as u64)
    }
}

fn scene_linear_color(c:&serde_json::Value)->bool{
    let p=c["primaries"].as_str();matches!(p,Some("rec709"|"rec2020"|"display-p3"|"acescg"))&&c["whitePoint"]==if p==Some("acescg"){"D60"}else{"D65"}&&c["transfer"]=="linear"&&c["reference"]=="scene"&&c["range"]=="full"&&c["referenceWhiteNits"].as_f64().is_some_and(|n|n.is_finite()&&n>0.)
}

pub fn words(bytes: &[u32]) -> Vec<u8> {
    bytes.iter().flat_map(|v| v.to_le_bytes()).collect()
}

/// Versioned private frame delta: no shader, resource, capability or state mutation.
#[derive(Debug,Deserialize,Clone)]#[serde(deny_unknown_fields)]
pub struct FrameBindings{pub version:u32,#[serde(default)]pub imports:Vec<ImageImport>,pub data:Vec<FrameData>,pub passes:Vec<FramePass>}
#[derive(Debug,Deserialize,Clone)]#[serde(deny_unknown_fields)]
pub struct FrameData{pub index:usize,pub length:u64,pub initial:Vec<u32>}
#[derive(Debug,Deserialize,Clone)]#[serde(deny_unknown_fields)]
pub struct FramePass{pub header:Vec<u32>,pub groups:Option<[u32;3]>,pub count:Option<u32>}
