//! Optional fixed OptiX query pass, scheduled only by the existing native owner.
#[cfg(windows)]#[allow(unsafe_code)]#[path="native_optix_windows.rs"]mod platform;
#[cfg(windows)]pub use platform::Optix;
#[cfg(not(windows))]pub struct Optix;
#[cfg(not(windows))]impl Optix{
 pub fn new(_:bool,_:u64)->Self{Self}
 pub fn sources(&mut self,_:&wgpu::Device,_:usize,_:usize,_:&crate::ray_contract::Scene,_:&[u32])->Result<(wgpu::Buffer,wgpu::Buffer),String>{Err("E_NATIVE_OPTIX_PLATFORM: qualified Windows CUDA interop required".into())}
 pub fn query(&mut self,_:&wgpu::Device,_:&wgpu::Queue,_:usize,_:usize,_:usize,_:&[usize],_:&[u32],_:&[wgpu::Buffer],_:wgpu::CommandEncoder,_:u64)->Result<wgpu::CommandEncoder,String>{Err("E_NATIVE_OPTIX_PLATFORM: qualified Windows CUDA interop required".into())}
 pub fn retain(&mut self,_:&wgpu::Device)->Result<(),String>{Ok(())}
 pub fn completed(&mut self,_:usize){}
 pub fn reserved_bytes(&self)->u64{0}
 pub fn stats(&self)->serde_json::Value{serde_json::json!({"version":1,"status":"unavailable","runtimeVerified":false,"reason":"Qualified OptiX platform adapter not installed"})}
}
