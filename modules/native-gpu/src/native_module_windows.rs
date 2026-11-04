use crate::{external_windows as external, protocol::NativeModule};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{File, OpenOptions},
    io::Read,
    os::windows::fs::OpenOptionsExt,
};
use wgpu::util::DeviceExt;

#[derive(Default)]
#[repr(C)]
struct Lease {
    version: u32,
    width: u32,
    height: u32,
    profile: u32,
    input: usize,
    output: usize,
    fence: usize,
    id: u64,
    initial: u64,
}
type Open = unsafe extern "C" fn(u64, *const u8, usize, *mut Lease) -> u64;
type Render = unsafe extern "C" fn(u64, *const u8, usize, *const u8, usize, u64, u64) -> i32;
type Close = unsafe extern "C" fn(u64) -> i32;
type Shutdown = unsafe extern "C" fn() -> i32;
type Error = unsafe extern "C" fn(*mut u8, usize) -> usize;
type Stats = unsafe extern "C" fn(*mut u8, usize) -> usize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    version: u32,
    abi: u32,
    files: BTreeMap<String, String>,
    trusted_local: bool,
}
struct Library {
    library: std::mem::ManuallyDrop<libloading::Library>,
    _locked: Vec<File>,
    clock: String,
    open: Open,
    render: Render,
    close: Close,
    shutdown: Shutdown,
    error: Error,
    stats: Stats,
}
impl Library {
    fn load() -> Result<Self, String> {
        unsafe {
            // Operator-selected development bundle, never a path from the module packet.
            let root=std::fs::canonicalize(std::env::var_os("FRAMEWEAVE_SERVO_RUNTIME").ok_or("E_NATIVE_MODULE_MISSING: explicitly build/configure the reviewed local Servo runtime")?).map_err(|e|format!("E_NATIVE_MODULE_MISSING: {e}"))?;
            let receipt: Receipt = serde_json::from_slice(
                &std::fs::read(root.join("servo-runtime.json"))
                    .map_err(|e| format!("E_NATIVE_MODULE_INTEGRITY: {e}"))?,
            )
            .map_err(|e| format!("E_NATIVE_MODULE_INTEGRITY: {e}"))?;
            let names = [
                "frameweave_servo.dll",
                "frameweave_servo_bridge.dll",
                "libEGL.dll",
                "libGLESv2.dll",
                "clock.js",
            ];
            if receipt.version != 1
                || receipt.abi != 1
                || !receipt.trusted_local
                || receipt.files.len() != names.len()
                || names.iter().any(|n| !receipt.files.contains_key(*n))
            {
                return Err(
                    "E_NATIVE_MODULE_INTEGRITY: exact reviewed-local runtime receipt required"
                        .into(),
                );
            }
            for entry in
                std::fs::read_dir(&root).map_err(|e| format!("E_NATIVE_MODULE_INTEGRITY: {e}"))?
            {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if name.to_ascii_lowercase().ends_with(".dll") && !names.contains(&name.as_ref()) {
                    return Err("E_NATIVE_MODULE_INTEGRITY: undeclared local DLL dependency".into());
                }
            }
            let mut locked = vec![];
            let mut clock = String::new();
            for name in names {
                let path = root.join(name);
                let metadata = std::fs::symlink_metadata(&path)
                    .map_err(|e| format!("E_NATIVE_MODULE_INTEGRITY: {e}"))?;
                if !metadata.is_file()
                    || metadata.file_type().is_symlink()
                {
                    return Err("E_NATIVE_MODULE_INTEGRITY: invalid bounded runtime file".into());
                }
                // Deny concurrent write/delete for the entire loaded DLL lifetime.
                let mut file = OpenOptions::new()
                    .read(true)
                    .share_mode(1)
                    .open(&path)
                    .map_err(|e| format!("E_NATIVE_MODULE_INTEGRITY: {e}"))?;
                let mut hasher = Sha256::new();
                let mut chunk = [0u8; 65536];
                loop {
                    let n = file.read(&mut chunk).map_err(|e| e.to_string())?;
                    if n == 0 {
                        break;
                    }
                    hasher.update(&chunk[..n]);
                    if name == "clock.js" {
                        clock
                            .push_str(std::str::from_utf8(&chunk[..n]).map_err(|e| e.to_string())?);
                    }
                }
                if format!("{:x}", hasher.finalize()) != receipt.files[name] {
                    return Err(format!(
                        "E_NATIVE_MODULE_INTEGRITY: changed runtime file {name}"
                    ));
                }
                locked.push(file);
            }
            let library: libloading::Library = libloading::os::windows::Library::load_with_flags(
                root.join("frameweave_servo.dll"),
                0x100 | 0x800,
            )
            .map_err(|e| format!("E_NATIVE_MODULE_LOAD: {e}"))?
            .into();
            let abi: unsafe extern "C" fn() -> u32 =
                *library.get(b"fw_servo_abi").map_err(|e| e.to_string())?;
            if abi() != 1 {
                return Err("E_NATIVE_MODULE_ABI: expected Servo ABI1".into());
            }
            Ok(Self {
                open: *library.get(b"fw_servo_open").map_err(|e| e.to_string())?,
                render: *library.get(b"fw_servo_render").map_err(|e| e.to_string())?,
                close: *library.get(b"fw_servo_close").map_err(|e| e.to_string())?,
                shutdown: *library
                    .get(b"fw_servo_shutdown")
                    .map_err(|e| e.to_string())?,
                error: *library.get(b"fw_servo_error").map_err(|e| e.to_string())?,
                stats: *library.get(b"fw_servo_stats").map_err(|e| e.to_string())?,
                clock,
                _locked: locked,
                library: std::mem::ManuallyDrop::new(library),
            })
        }
    }
    fn check(&self, value: i32) -> Result<(), String> {
        if value < 0 {
            let mut b = [0u8; 8192];
            let n = unsafe { (self.error)(b.as_mut_ptr(), b.len()) }.min(b.len());
            Err(format!(
                "E_NATIVE_MODULE: {}",
                String::from_utf8_lossy(&b[..n])
            ))
        } else {
            Ok(())
        }
    }
    fn snapshot(&self) -> serde_json::Value {
        let mut bytes = [0u8; 32768];
        let n = unsafe { (self.stats)(bytes.as_mut_ptr(), bytes.len()) };
        if n == 0 || n > bytes.len() {
            return serde_json::json!({"unavailable":true});
        }
        serde_json::from_slice(&bytes[..n])
            .unwrap_or_else(|_| serde_json::json!({"unavailable":true}))
    }
}
impl Drop for Library {
    fn drop(&mut self) {
        unsafe {
            let status = (self.shutdown)();
            let snapshot = self.snapshot();
            eprintln!(
                "{}",
                serde_json::json!({"event":"servoClosed","version":1,"status":status,"runtime":snapshot})
            );
            if status == 0 && snapshot["logicalBridgeResources"].as_u64() == Some(0) {
                std::mem::ManuallyDrop::drop(&mut self.library);
            }
        }
    }
}
struct Page {
    spec: NativeModule,
    id: u64,
    input: Option<wgpu::Texture>,
    output: wgpu::Texture,
    fence: ash::vk::Semaphore,
    next: u64,
}
pub struct ModulePass {
    key: (usize, usize),
    to: Option<wgpu::BindGroup>,
    from: wgpu::BindGroup,
    _uniform: wgpu::Buffer,
}
pub struct Modules {
    enabled: bool,
    luid: u64,
    library: Option<Library>,
    pages: BTreeMap<(usize, usize), Page>,
    to: Option<wgpu::RenderPipeline>,
    from: Option<wgpu::ComputePipeline>,
    device: Option<wgpu::Device>,
    calls: u64,
    input_conversions: u64,
    output_conversions: u64,
}
impl Modules {
    pub fn new(enabled: bool, luid: u64) -> Self {
        Self {
            enabled,
            luid,
            library: None,
            pages: BTreeMap::new(),
            to: None,
            from: None,
            device: None,
            calls: 0,
            input_conversions: 0,
            output_conversions: 0,
        }
    }
    pub fn prepare(
        &mut self,
        device: &wgpu::Device,
        spec: &NativeModule,
        key: (usize, usize),
        input: Option<&wgpu::Buffer>,
        output: &wgpu::Buffer,
        alpha: u32,
    ) -> Result<ModulePass, String> {
        unsafe {
            if !self.enabled {
                return Err("E_NATIVE_MODULE_UNAVAILABLE: owner has no enabled Windows/Vulkan external-image and GPU-fence capability".into());
            }
            spec.validate()?;
            let limit=device.limits().max_texture_dimension_2d;
            if spec.width>limit || spec.height>limit {return Err(format!("E_NATIVE_MODULE_DIMENSION: Servo texture exceeds actual device limit {limit}"));}
            if self.library.is_none() {
                self.library = Some(Library::load()?);
                self.device = Some(device.clone());
            }
            let library = self.library.as_ref().unwrap();
            if let Some(page) = self.pages.get(&key) {
                if page.spec != *spec {
                    return Err("E_NATIVE_MODULE_RECONFIGURE: rebuild the Stage/session to replace persistent module code".into());
                }
            } else {
                let mut namespace = [0u8; 32];
                getrandom::fill(&mut namespace)
                    .map_err(|e| format!("E_NATIVE_MODULE_RESOURCE: {e}"))?;
                let namespace = namespace
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect::<String>();
                let config=serde_json::json!({"version":1,"profile":spec.profile,"width":spec.width,"height":spec.height,"html":spec.html,"javascript":spec.javascript,"input":spec.input,"namespace":namespace,"timeoutMs":spec.timeout_ms,"clockScript":library.clock,"seed":spec.seed}).to_string();
                let mut lease = Lease::default();
                let id = (library.open)(self.luid, config.as_ptr(), config.len(), &mut lease);
                if id == 0 {
                    library.check(-1)?;
                }
                if lease.version != 1
                    || lease.width != spec.width
                    || lease.height != spec.height
                    || lease.profile != 1
                    || lease.id != id
                    || lease.initial != 1
                {
                    return Err("E_NATIVE_MODULE_ABI: invalid owned external-image lease".into());
                }
                let input = if spec.input {
                    Some(
                        external::import_bgra8(device, lease.input, spec.width, spec.height)
                            .map_err(|e| format!("E_NATIVE_MODULE_RESOURCE: {e}"))?,
                    )
                } else {
                    None
                };
                let output = external::import_bgra8(device, lease.output, spec.width, spec.height)
                    .map_err(|e| format!("E_NATIVE_MODULE_RESOURCE: {e}"))?;
                let fence = external::import_fence(device, lease.fence)
                    .map_err(|e| format!("E_NATIVE_MODULE_RESOURCE: {e}"))?;
                self.pages.insert(
                    key,
                    Page {
                        spec: spec.clone(),
                        id,
                        input,
                        output,
                        fence,
                        next: lease.initial,
                    },
                );
            }
            if self.to.is_none() {
                let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("servo/explicit-SDR-boundary"),
                    source: wgpu::ShaderSource::Wgsl(
                        include_str!("../../servo/native/interop.wgsl").into(),
                    ),
                });
                self.to = Some(
                    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                        label: None,
                        layout: None,
                        vertex: wgpu::VertexState {
                            module: &module,
                            entry_point: Some("vertex"),
                            compilation_options: Default::default(),
                            buffers: &[],
                        },
                        primitive: Default::default(),
                        depth_stencil: None,
                        multisample: Default::default(),
                        fragment: Some(wgpu::FragmentState {
                            module: &module,
                            entry_point: Some("to_servo"),
                            compilation_options: Default::default(),
                            targets: &[Some(wgpu::ColorTargetState {
                                format: wgpu::TextureFormat::Bgra8Unorm,
                                blend: None,
                                write_mask: wgpu::ColorWrites::ALL,
                            })],
                        }),
                        multiview_mask: None,
                        cache: None,
                    }),
                );
                let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("servo/to-linear-PM-F32"),
                    source: wgpu::ShaderSource::Wgsl(
                        include_str!("../../servo/native/from-servo.wgsl").into(),
                    ),
                });
                self.from = Some(device.create_compute_pipeline(
                    &wgpu::ComputePipelineDescriptor {
                        label: None,
                        layout: None,
                        module: &module,
                        entry_point: Some("from_servo"),
                        compilation_options: Default::default(),
                        cache: None,
                    },
                ));
            }
            let bytes = [spec.width, spec.height, alpha, 0]
                .into_iter()
                .flat_map(u32::to_le_bytes)
                .collect::<Vec<_>>();
            let uniform = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("servo/owned-dimensions"),
                contents: &bytes,
                usage: wgpu::BufferUsages::UNIFORM,
            });
            let page = &self.pages[&key];
            let to = input.map(|image| {
                device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: None,
                    layout: &self.to.as_ref().unwrap().get_bind_group_layout(0),
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: image.as_entire_binding(),
                        },
                        wgpu::BindGroupEntry {
                            binding: 1,
                            resource: uniform.as_entire_binding(),
                        },
                    ],
                })
            });
            let view = page.output.create_view(&Default::default());
            let from = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: None,
                layout: &self.from.as_ref().unwrap().get_bind_group_layout(0),
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: output.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: uniform.as_entire_binding(),
                    },
                ],
            });
            Ok(ModulePass {
                key,
                to,
                from,
                _uniform: uniform,
            })
        }
    }
    pub fn execute(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        pass: &ModulePass,
        mut encoder: wgpu::CommandEncoder,
        parameters: &[u32],
    ) -> Result<wgpu::CommandEncoder, String> {
        unsafe {
            if parameters.is_empty() || parameters[0] as u64 > parameters.len().saturating_sub(1) as u64 * 4 {
                return Err("E_NATIVE_MODULE_CONTROL: invalid version1 control bytes".into());
            }
            let bytes = crate::protocol::words(&parameters[1..]);
            let value: serde_json::Value = serde_json::from_slice(&bytes[..parameters[0] as usize])
                .map_err(|e| format!("E_NATIVE_MODULE_CONTROL: {e}"))?;
            if !value.is_object()
                || value.as_object().unwrap().len() != 2
                || !value["context"].is_object()
                || !value["parameters"].is_object()
            {
                return Err("E_NATIVE_MODULE_CONTROL: context/parameters required".into());
            }
            let context = value["context"].to_string();
            let params = value["parameters"].to_string();
            let page = self
                .pages
                .get_mut(&pass.key)
                .ok_or("E_NATIVE_MODULE_RESOURCE: stale module pass")?;
            let input_value = page
                .next
                .checked_add(1)
                .ok_or("E_NATIVE_MODULE_SYNC: fence exhausted")?;
            let output_value = input_value
                .checked_add(1)
                .ok_or("E_NATIVE_MODULE_SYNC: fence exhausted")?;
            let mut acquire = None;
            let mut release = None;
            if let (Some(input), Some(group)) = (&page.input, &pass.to) {
                let view = input.create_view(&Default::default());
                {
                    let mut render = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                        label: Some("servo/native-to-SDR8"),
                        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                            view: &view,
                            depth_slice: None,
                            resolve_target: None,
                            ops: wgpu::Operations {
                                load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                                store: wgpu::StoreOp::Store,
                            },
                        })],
                        ..Default::default()
                    });
                    render.set_pipeline(self.to.as_ref().unwrap());
                    render.set_bind_group(0, group, &[]);
                    render.draw(0..3, 0..1);
                }
                external::general(&mut encoder, input);
                acquire = Some(external::ownership(device, input, true));
                release = Some(external::ownership(device, input, false));
                self.input_conversions += 1;
            }
            external::wait(queue, page.fence, page.next);
            external::signal(queue, page.fence, input_value);
            queue.submit(
                acquire
                    .into_iter()
                    .chain(std::iter::once(encoder.finish()))
                    .chain(release),
            );
            let library = self.library.as_ref().unwrap();
            library.check((library.render)(
                page.id,
                context.as_ptr(),
                context.len(),
                params.as_ptr(),
                params.len(),
                input_value,
                output_value,
            ))?;
            let mut encoder = device.create_command_encoder(&Default::default());
            {
                let mut decode = encoder.begin_compute_pass(&Default::default());
                decode.set_pipeline(self.from.as_ref().unwrap());
                decode.set_bind_group(0, &pass.from, &[]);
                decode.dispatch_workgroups(
                    page.spec.width.div_ceil(8),
                    page.spec.height.div_ceil(8),
                    1,
                );
            }
            external::general(&mut encoder, &page.output);
            let acquire = external::ownership(device, &page.output, true);
            let release = external::ownership(device, &page.output, false);
            external::wait(queue, page.fence, output_value);
            queue.submit([acquire, encoder.finish(), release]);
            page.next = output_value;
            self.calls += 1;
            self.output_conversions += 1;
            Ok(device.create_command_encoder(&Default::default()))
        }
    }
    pub fn stats(&self) -> serde_json::Value {
        serde_json::json!({"version":1,"loaded":self.library.is_some(),"instances":self.pages.len(),"calls":self.calls,"inputGpuConversions":self.input_conversions,"outputGpuConversions":self.output_conversions,"productionPixelReadbacks":0,"blockingGpuFenceWaits":0,"runtimeFileHashes":if self.library.is_some(){5}else{0},"nativeDevicesCreated":0,"additionalD3D11Devices":if self.library.is_some(){2}else{0},"contentProfile":"reviewed-local-only","surfaceProfile":"explicit-sdr-srgb8","webRenderCachePrecision":"bgra8","runtime":self.library.as_ref().map(|l|l.snapshot())})
    }
}
impl Drop for Modules {
    fn drop(&mut self) {
        unsafe {
            // End-of-owner cleanup only, never a frame validation/synchronization wait.
            if let Some(device) = &self.device {
                let _ = device.poll(wgpu::PollType::wait_indefinitely());
            }
            if let Some(device) = &self.device {
                for (_, page) in std::mem::take(&mut self.pages) {
                    external::destroy_fence(device, page.fence);
                    drop(page.input);
                    drop(page.output);
                    if let Some(library) = &self.library {
                        let _ = (library.close)(page.id);
                    }
                }
            }
            // Library shutdown joins Servo threads before executable code can be unloaded.
            self.library.take();
        }
    }
}
