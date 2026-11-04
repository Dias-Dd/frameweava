//! GPU inference is an optional pass owned by the existing device/queue.
#[cfg(not(windows))]use crate::inference_contract::Inference;
#[cfg(windows)]#[allow(unsafe_code)]#[path="native_inference_windows.rs"]mod platform;
#[cfg(windows)]pub use platform::InferenceRuntime;
#[cfg(not(windows))]pub struct InferenceRuntime;
#[cfg(not(windows))]impl InferenceRuntime{
 pub fn new(_enabled:bool,_luid:u64)->Self{Self}
 pub fn execute(&mut self,_device:&wgpu::Device,_queue:&wgpu::Queue,_root:&std::path::Path,_spec:&Inference,_index:usize,_slot:usize,_data:&[wgpu::Buffer],_bindings:&[usize],_encoder:wgpu::CommandEncoder,_budget:u64)->Result<wgpu::CommandEncoder,String>{Err("E_INFERENCE_PLATFORM: resident ORT adapter for this platform is not installed/qualified; no CPU fallback".into())}
 pub fn retain(&mut self,_device:&wgpu::Device,_program:&crate::protocol::Program)->Result<(),String>{Ok(())}
 pub fn capabilities(&mut self,_device:&wgpu::Device)->Result<serde_json::Value,String>{Err("E_INFERENCE_PLATFORM: resident platform adapter is not installed/qualified".into())}
 pub fn completed(&mut self,_slot:usize){}
 pub fn stats(&self)->serde_json::Value{serde_json::json!({"version":1,"status":"unavailable","runtimeVerified":false,"reason":"No qualified resident platform adapter in this build"})}
}
