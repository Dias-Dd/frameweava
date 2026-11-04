//! Optional reviewed local hardware decoder on the existing device/queue.
#[cfg(windows)]
#[allow(unsafe_code)]
#[path="native_video_windows.rs"] mod platform;
#[cfg(windows)] pub use platform::*;
#[cfg(not(windows))]
pub struct Videos;
#[cfg(not(windows))]
impl Videos {
 pub fn new(_enabled:bool,_luid:u64)->Self{Self}
 pub fn execute(&mut self,_device:&wgpu::Device,_queue:&wgpu::Queue,_root:&std::path::Path,_item:&crate::protocol::ImageImport,_info:&crate::protocol::Image,_slot:usize,_output:&wgpu::Buffer,_encoder:wgpu::CommandEncoder)->Result<wgpu::CommandEncoder,String>{Err("E_NATIVE_VIDEO_PLATFORM: Windows hardware video profile unavailable".into())}
 pub fn retain_program(&mut self,_d:&wgpu::Device,_p:&crate::protocol::Program)->Result<(),String>{Ok(())}
 pub fn has_encoder(&self)->bool{false}
 pub fn stats(&self)->serde_json::Value{serde_json::json!({"version":1,"loaded":false})}
 pub fn configure_encoder(&mut self,_device:&wgpu::Device,_spec:&crate::protocol::MediaExport,_w:u32,_h:u32,_slots:usize)->Result<(),String>{Err("E_NATIVE_MEDIA_PLATFORM: direct media is Windows-only".into())}
 pub fn encode(&mut self,_device:&wgpu::Device,_queue:&wgpu::Queue,_slot:usize,_seq:u64,_image:&wgpu::Buffer,_w:u32,_h:u32,_encoder:wgpu::CommandEncoder)->Result<(),String>{Err("E_NATIVE_MEDIA_PLATFORM: direct media is Windows-only".into())}
 pub fn poll_encoder(&mut self)->Result<Vec<(usize,u64)>,String>{Ok(vec![])}
 pub fn finish_encoder(&mut self)->Result<bool,String>{Ok(true)}
 pub fn encoder_stats(&self)->serde_json::Value{serde_json::json!({"version":1,"enabled":false})}
 #[cfg(feature="diagnostics")]
 pub fn inspect_encoder(&self,_slot:usize)->Result<Vec<f32>,String>{Err("E_NATIVE_MEDIA_PLATFORM".into())}
}
