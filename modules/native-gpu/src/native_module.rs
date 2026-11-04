//! Fixed native implementation adapter; no author-supplied DLLs or GPU handles.
//! This is an optional pass in the existing GPU owner, not a second scheduler.
#[derive(Clone)]
pub struct Interop {
    pub available: bool,
    pub enabled: bool,
    pub luid: u64,
    pub reason: Option<String>,
}
pub async fn owner_device(
    adapter: &wgpu::Adapter,ray_query:bool,preview:bool,
) -> Result<(wgpu::Device, wgpu::Queue, Interop), String> {
    let ray=crate::ray_policy::required(adapter,ray_query)?;
    let features=adapter.features();
    let timestamps=wgpu::Features::TIMESTAMP_QUERY|wgpu::Features::TIMESTAMP_QUERY_INSIDE_ENCODERS;
    let timing=if preview&&features.contains(timestamps){timestamps}else{wgpu::Features::empty()};
    let mut status = Interop {
        available: false,
        enabled: false,
        luid: 0,
        reason: Some("Windows/Vulkan external images unavailable".into()),
    };
    #[cfg(windows)]
    {
        status.available = crate::external_windows::available(adapter);
        if status.available && std::env::var_os("FRAMEWEAVE_DISABLE_EXTERNAL_IMAGES").is_some() {
            status.reason = Some("External images explicitly disabled by operator".into());
        }
        if status.available && std::env::var_os("FRAMEWEAVE_DISABLE_EXTERNAL_IMAGES").is_none() {
            match crate::external_windows::open_device(adapter,ray|timing).await {
                Ok((device, queue, luid)) => {
                    return Ok((
                        device,
                        queue,
                        Interop {
                            available: true,
                            enabled: true,
                            luid,
                            reason: None,
                        },
                    ));
                }
                Err(error) => status.reason = Some(format!("External images disabled: {error}")),
            }
        }
    }
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor {
            label: Some("frameweave/native-owner"),
            required_features: ray | timing | (features & wgpu::Features::FLOAT32_BLENDABLE),
            experimental_features:crate::ray_policy::experimental(ray_query),
            required_limits: adapter.limits(),
            ..Default::default()
        })
        .await
        .map_err(|e| format!("E_GPU_UNAVAILABLE: {e}"))?;
    Ok((device, queue, status))
}
#[cfg(windows)]
#[allow(unsafe_code)] // FFI + handle import are confined to this implementation.
#[path = "native_module_windows.rs"]
mod platform;
#[cfg(windows)]
pub use platform::*;

#[cfg(not(windows))]
mod platform {
    use crate::protocol::NativeModule;
    pub struct Modules;
    pub struct ModulePass;
    impl Modules {
        pub fn new(_enabled: bool, _luid: u64) -> Self {
            Self
        }
        pub fn prepare(
            &mut self,
            _device: &wgpu::Device,
            _spec: &NativeModule,
            _key: (usize, usize),
            _input: Option<&wgpu::Buffer>,
            _output: &wgpu::Buffer,
            _alpha: u32,
        ) -> Result<ModulePass, String> {
            Err("E_NATIVE_MODULE_UNAVAILABLE: Servo GPU adapter requires Windows/Vulkan".into())
        }
        pub fn execute(
            &mut self,
            _device: &wgpu::Device,
            _queue: &wgpu::Queue,
            _pass: &ModulePass,
            _encoder: wgpu::CommandEncoder,
            _parameters: &[u32],
        ) -> Result<wgpu::CommandEncoder, String> {
            Err("E_NATIVE_MODULE_UNAVAILABLE: Servo GPU adapter requires Windows/Vulkan".into())
        }
        pub fn stats(&self) -> serde_json::Value {
            serde_json::json!({"version":1,"loaded":false,"instances":0})
        }
    }
}
#[cfg(not(windows))]
pub use platform::*;
