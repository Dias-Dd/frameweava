mod capacity;
use std::cell::{Cell, RefCell};
use std::ffi::{CString, c_char, c_void};
use std::rc::Rc;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use dpi::PhysicalSize;
use image::RgbaImage;
use paint_api as servo_paint_api;
use serde::Deserialize;
use servo::{
    EventLoopWaker, JSValue, LoadStatus, Preferences, RenderingContext, Servo, ServoBuilder,
    WebView, WebViewBuilder, WebViewDelegate,
};
use servo_paint_api::rendering_context::Error as SurfmanError;
use servo_paint_api::{
    ExternalGpuImageDescriptor, ExternalGpuPixelFormat, ExternalGpuTextureImporter,
};
use url::Url;
use webrender_api::IdNamespace;
use webrender_api::units::DeviceIntRect;

static RENDERING_CONTEXT_READBACK_ATTEMPTS: AtomicU64 = AtomicU64::new(0);

#[link(name = "frameweave_servo_bridge", kind = "dylib")]
unsafe extern "C" {
    fn bridge_init() -> u32;
    fn bridge_create_shared_texture(
        width: u32,
        height: u32,
        format_code: u32,
        share_mode: u32,
        out_share_handle: *mut usize,
    ) -> u32;
    fn bridge_release_texture(tex_id: u32);
    fn bridge_create_servo_context(width: u32, height: u32, initial_target_tex_id: u32) -> u32;
    fn bridge_set_servo_target_texture(servo_ctx_id: u32, target_tex_id: u32) -> u32;
    fn bridge_make_current(servo_ctx_id: u32) -> u32;
    fn bridge_prepare_for_rendering(servo_ctx_id: u32);
    fn bridge_flush_gl();
    fn bridge_get_proc_address(name: *const c_char) -> *const c_void;
    fn bridge_lock_external_texture(
        painter_id: u32,
        external_id: u64,
        share_handle: usize,
        width: u32,
        height: u32,
        format_code: u32,
        out_imported_new: *mut u32,
    ) -> u32;
    fn bridge_unlock_external_texture(painter_id: u32, external_id: u64);
    fn bridge_release_external_texture(painter_id: u32, external_id: u64);

}

struct BridgeTextureImporter;

impl ExternalGpuTextureImporter for BridgeTextureImporter {
    fn lock_external_gpu_texture(
        &self,
        painter_id: servo_paint_api::PainterId,
        descriptor: &ExternalGpuImageDescriptor,
    ) -> (u32, bool) {
        let fmt_code = match descriptor.format {
            ExternalGpuPixelFormat::Bgra8Unorm => 0,
            ExternalGpuPixelFormat::Rgba16Float => 1,
        };
        let mut imported_new: u32 = 0;
        let raw_painter_id = IdNamespace::from(painter_id).0;
        let gl_tex = unsafe {
            bridge_lock_external_texture(
                raw_painter_id,
                descriptor.external_id,
                descriptor.d3d11_share_handle,
                descriptor.width,
                descriptor.height,
                fmt_code,
                &mut imported_new,
            )
        };
        (gl_tex, imported_new != 0)
    }

    fn unlock_external_gpu_texture(
        &self,
        painter_id: servo_paint_api::PainterId,
        external_id: u64,
    ) {
        let raw_painter_id = IdNamespace::from(painter_id).0;
        unsafe {
            bridge_unlock_external_texture(raw_painter_id, external_id);
        }
    }

    fn release_external_gpu_texture(
        &self,
        painter_id: servo_paint_api::PainterId,
        external_id: u64,
    ) {
        let raw_painter_id = IdNamespace::from(painter_id).0;
        unsafe {
            bridge_release_external_texture(raw_painter_id, external_id);
        }
    }
}

struct ImmediateRefreshDriver;

impl servo::RefreshDriver for ImmediateRefreshDriver {
    fn observe_next_frame(&self, new_start_frame_callback: Box<dyn Fn() + Send + 'static>) {
        new_start_frame_callback();
    }
}

struct AngleD3D11RenderingContext {
    servo_ctx_id: u32,
    size: Cell<PhysicalSize<u32>>,
    target_tex_id: Cell<u32>,
    gleam_gl: Rc<dyn gleam::gl::Gl>,
    glow_gl: Arc<glow::Context>,
    refresh_driver: Rc<dyn servo::RefreshDriver>,
}

impl AngleD3D11RenderingContext {
    fn new(width: u32, height: u32, initial_target_tex_id: u32) -> Rc<Self> {
        let servo_ctx_id =
            unsafe { bridge_create_servo_context(width, height, initial_target_tex_id) };
        assert!(
            servo_ctx_id != 0,
            "Failed to create ANGLE Servo GLES3 context"
        );

        let gleam_gl = unsafe {
            gleam::gl::GlesFns::load_with(|name| {
                let cstr = CString::new(name).unwrap();
                bridge_get_proc_address(cstr.as_ptr())
            })
        };
        let glow_gl = unsafe {
            Arc::new(glow::Context::from_loader_function(|name| {
                let cstr = CString::new(name).unwrap();
                bridge_get_proc_address(cstr.as_ptr())
            }))
        };

        Rc::new(Self {
            servo_ctx_id,
            size: Cell::new(PhysicalSize::new(width, height)),
            target_tex_id: Cell::new(initial_target_tex_id),
            gleam_gl,
            glow_gl,
            refresh_driver: Rc::new(ImmediateRefreshDriver),
        })
    }

    fn set_target_texture(&self, target_tex_id: u32, width: u32, height: u32) {
        self.target_tex_id.set(target_tex_id);
        self.size.set(PhysicalSize::new(width, height));
        unsafe {
            bridge_set_servo_target_texture(self.servo_ctx_id, target_tex_id);
        }
    }
}

impl RenderingContext for AngleD3D11RenderingContext {
    fn prepare_for_rendering(&self) {
        unsafe {
            bridge_prepare_for_rendering(self.servo_ctx_id);
        }
    }

    fn read_to_image(&self, _source_rectangle: DeviceIntRect) -> Option<RgbaImage> {
        // Strictly forbidden in the zero-copy GPU production pipeline!
        RENDERING_CONTEXT_READBACK_ATTEMPTS.fetch_add(1, Ordering::SeqCst);
        None
    }

    fn size(&self) -> PhysicalSize<u32> {
        self.size.get()
    }

    fn resize(&self, size: PhysicalSize<u32>) {
        self.size.set(size);
    }

    fn present(&self) {
        unsafe {
            bridge_flush_gl();
        }
    }

    fn make_current(&self) -> Result<(), SurfmanError> {
        unsafe {
            bridge_make_current(self.servo_ctx_id);
        }
        Ok(())
    }

    fn gleam_gl_api(&self) -> Rc<dyn gleam::gl::Gl> {
        self.gleam_gl.clone()
    }

    fn glow_gl_api(&self) -> Arc<glow::Context> {
        self.glow_gl.clone()
    }

    fn refresh_driver(&self) -> Option<Rc<dyn servo::RefreshDriver>> {
        Some(self.refresh_driver.clone())
    }
}

use servo::{NavigationRequest, WebResourceLoad, WebResourceResponse};
use std::collections::BTreeMap;
use std::sync::mpsc::{Receiver, SyncSender, sync_channel};

unsafe extern "C" {
    fn bridge_select_adapter(luid: u64) -> u32;
    fn bridge_texture_nt_handle(id: u32) -> usize;
    fn bridge_create_module_fence(handle: *mut usize) -> u32;
    fn bridge_module_wait(id: u32, value: u64) -> i32;
    fn bridge_module_signal(id: u32, value: u64) -> i32;
    fn bridge_release_module_fence(id: u32);
    fn bridge_destroy_servo_context(id: u32);
    fn bridge_live_resources() -> u64;
}
impl Drop for AngleD3D11RenderingContext {
    fn drop(&mut self) {
        unsafe {
            bridge_destroy_servo_context(self.servo_ctx_id);
        }
    }
}

#[derive(Clone)]
struct Wake(SyncSender<()>);
impl EventLoopWaker for Wake {
    fn clone_box(&self) -> Box<dyn EventLoopWaker> {
        Box::new(self.clone())
    }
    fn wake(&self) {
        let _ = self.0.try_send(());
    }
}

#[derive(Clone)]
struct Delegate {
    ready: Rc<Cell<u64>>,
    loaded: Rc<Cell<bool>>,
    blocked: Rc<Cell<u64>>,
    document: String,
}
impl WebViewDelegate for Delegate {
    fn notify_new_frame_ready(&self, _: WebView) {
        self.ready.set(self.ready.get() + 1);
    }
    fn notify_load_status_changed(&self, view: WebView, status: LoadStatus) {
        if status == LoadStatus::Complete
            && view.url().as_ref().map(Url::as_str) == Some(self.document.as_str())
        {
            self.loaded.set(true);
        }
    }
    fn request_navigation(&self, _: WebView, request: NavigationRequest) {
        if request.url.as_str() == self.document {
            request.allow();
        } else {
            self.blocked.set(self.blocked.get() + 1);
            request.deny();
        }
    }
    fn load_web_resource(&self, _: WebView, load: WebResourceLoad) {
        if !matches!(load.request.url.scheme(), "data" | "gpu-resource") {
            self.blocked.set(self.blocked.get() + 1);
            let response = WebResourceResponse::new(load.request.url.clone());
            load.intercept(response).cancel();
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    version: u32,
    profile: String,
    width: u32,
    height: u32,
    html: String,
    #[serde(default)]
    javascript: String,
    input: bool,
    namespace: String,
    #[serde(default = "deadline")]
    timeout_ms: u64,
    clock_script: String,
    #[serde(default)]
    seed: u32,
}
fn deadline() -> u64 {
    3000
}
#[repr(C)]
pub struct ImageLease {
    pub version: u32,
    pub width: u32,
    pub height: u32,
    pub profile: u32,
    pub input_nt: usize,
    pub output_nt: usize,
    pub fence_nt: usize,
    pub instance: u64,
    pub initial_ready: u64,
}
struct Page {
    view: WebView,
    context: Rc<AngleD3D11RenderingContext>,
    delegate: Delegate,
    input: u32,
    output: u32,
    fence: u32,
    name: String,
    timeout: Duration,
    frames: u64,
    last_frame: u64,
}
struct PendingPage {
    input: u32,
    output: u32,
    fence: u32,
    context: Option<Rc<AngleD3D11RenderingContext>>,
    name: Option<String>,
    committed: bool,
}
impl Drop for PendingPage {
    fn drop(&mut self) {
        if self.committed {
            return;
        }
        if let Some(name) = &self.name {
            servo_paint_api::unregister_external_gpu_image(name);
        }
        self.context.take();
        unsafe {
            bridge_release_texture(self.input);
            bridge_release_texture(self.output);
            bridge_release_module_fence(self.fence);
        }
    }
}
struct Host {
    servo: Servo,
    wake: Receiver<()>,
    pages: BTreeMap<u64, Page>,
    next: u64,
    luid: u64,
}
thread_local! {static HOST:RefCell<Option<Host>>=const{RefCell::new(None)};static LAST_ERROR:RefCell<String>=const{RefCell::new(String::new())};}
fn wait(
    servo: &Servo,
    wake: &Receiver<()>,
    timeout: Duration,
    predicate: impl Fn() -> bool,
) -> Result<(), String> {
    let start = Instant::now();
    loop {
        servo.spin_event_loop();
        if predicate() {
            return Ok(());
        }
        if start.elapsed() >= timeout {
            return Err("E_SERVO_TIMEOUT: frame barrier timed out".into());
        }
        let _ = wake.recv_timeout((timeout - start.elapsed()).min(Duration::from_millis(2)));
    }
}
fn eval(
    servo: &Servo,
    wake: &Receiver<()>,
    view: &WebView,
    script: String,
    timeout: Duration,
) -> Result<Option<String>, String> {
    let result = Rc::new(RefCell::new(None));
    let done = result.clone();
    view.evaluate_javascript(script, move |r| {
        *done.borrow_mut() = Some(
            r.map(|v| {
                if let JSValue::String(s) = v {
                    Some(s)
                } else {
                    None
                }
            })
            .map_err(|e| format!("E_SERVO_JS: {e:?}")),
        );
    });
    wait(servo, wake, timeout, || result.borrow().is_some())?;
    let out = result.borrow_mut().take().unwrap();
    out
}
fn settle(
    servo: &Servo,
    wake: &Receiver<()>,
    view: &WebView,
    timeout: Duration,
) -> Result<(), String> {
    let result = Rc::new(RefCell::new(None));
    let done = result.clone();
    view.request_render_readiness(move |r| {
        *done.borrow_mut() = Some(r.map_err(|e| format!("E_SERVO_READINESS: {e:?}")));
    });
    wait(servo, wake, timeout, || {
        view.paint();
        result.borrow().is_some()
    })?;
    let result = result.borrow_mut().take().unwrap();
    result
}
fn initialize(luid: u64) -> Result<Host, String> {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    if unsafe { bridge_select_adapter(luid) } != 1
        || unsafe { bridge_init() } != 1
        // The first call selects the allocation adapter. Only after ANGLE is
        // initialized can its actual device LUID be compared with the owner.
        || unsafe { bridge_select_adapter(luid) } != 1
    {
        return Err("E_SERVO_DEVICE: D3D11/ANGLE adapter does not match the native GPU".into());
    }
    servo_paint_api::set_external_gpu_texture_importer(Arc::new(BridgeTextureImporter));
    let (tx, rx) = sync_channel(1);
    let mut prefs = Preferences::default();
    prefs.shell_background_color_rgba = [0., 0., 0., 0.];
    prefs.dom_web_animations_enabled = true;
    prefs.layout_animations_test_enabled = true;
    let servo = ServoBuilder::default()
        .preferences(prefs)
        .event_loop_waker(Box::new(Wake(tx)))
        .build();
    Ok(Host {
        servo,
        wake: rx,
        pages: BTreeMap::new(),
        next: 0,
        luid,
    })
}
impl Host {
    fn open(&mut self, c: Config) -> Result<ImageLease, String> {
        if c.version != 1
            || c.profile != "sdr-srgb8"
            || c.width == 0
            || c.height == 0
            || c.namespace.len() != 64
            || !c.namespace.bytes().all(|b| b.is_ascii_hexdigit())
            || c.timeout_ms == 0
        {
            return Err("E_SERVO_CONFIG: bounded version1 SDR configuration required".into());
        }
        capacity::page(c.width, c.height, self.pages.len())?;
        let timeout = Duration::from_millis(c.timeout_ms);
        let mut input_kmt = 0;
        let mut output_kmt = 0;
        let input = if c.input {
            unsafe { bridge_create_shared_texture(c.width, c.height, 0, 3, &mut input_kmt) }
        } else {
            0
        };
        let output =
            unsafe { bridge_create_shared_texture(c.width, c.height, 0, 3, &mut output_kmt) };
        let mut fence_nt = 0;
        let fence = unsafe { bridge_create_module_fence(&mut fence_nt) };
        let mut pending = PendingPage {
            input,
            output,
            fence,
            context: None,
            name: None,
            committed: false,
        };
        if output == 0 || output_kmt == 0 || fence == 0 || c.input && (input == 0 || input_kmt == 0)
        {
            return Err("E_SERVO_RESOURCE: shared images/fence could not be created".into());
        }
        let context = AngleD3D11RenderingContext::new(c.width, c.height, output);
        let name = format!("fw{}", c.namespace);
        pending.context = Some(context.clone());
        // Initialize with GPU clears on the same ANGLE queue that will sample them.
        // The initial fence below protects the first native overwrite/import too.
        context.prepare_for_rendering();
        context.gleam_gl.clear_color(0., 0., 0., 0.);
        context.gleam_gl.clear(gleam::gl::COLOR_BUFFER_BIT);
        if input != 0 {
            context.set_target_texture(input, c.width, c.height);
            context.prepare_for_rendering();
            context.gleam_gl.clear_color(0., 0., 0., 0.);
            context.gleam_gl.clear(gleam::gl::COLOR_BUFFER_BIT);
            context.set_target_texture(output, c.width, c.height);
        }
        if c.input {
            servo_paint_api::register_external_gpu_image(
                &name,
                input_kmt,
                c.width,
                c.height,
                ExternalGpuPixelFormat::Bgra8Unorm,
                false,
                false,
            );
            pending.name = Some(name.clone());
        }
        let policy = "default-src 'none'; style-src 'unsafe-inline'; img-src data: gpu-resource:; font-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'";
        let html = format!(
            "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"{policy}\"><style>html,body{{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}}</style>{}",
            c.html
                .replace("{{frameweave.input}}", &format!("gpu-resource://{name}"))
        );
        // Data URLs use percent encoding, not application/x-www-form-urlencoded:
        // a '+' is literal HTML here and must never replace a document space.
        let document = format!(
            "data:text/html;charset=utf-8,{}",
            url::form_urlencoded::byte_serialize(html.as_bytes())
                .collect::<String>()
                .replace('+', "%20")
        );
        let delegate = Delegate {
            ready: Rc::new(Cell::new(0)),
            loaded: Rc::new(Cell::new(false)),
            blocked: Rc::new(Cell::new(0)),
            document: document.clone(),
        };
        let view = WebViewBuilder::new(&self.servo, context.clone())
            .url(Url::parse(&document).map_err(|e| e.to_string())?)
            .delegate(Rc::new(delegate.clone()))
            .build();
        wait(&self.servo, &self.wake, timeout, || {
            delegate.loaded.get() && delegate.ready.get() > 0
        })?;
        let painter = view.id().into();
        wait(&self.servo, &self.wake, timeout, || {
            let p = servo_paint_api::native_frame_progress(painter);
            p.submitted == p.ready
        })?;
        settle(&self.servo, &self.wake, &view, timeout)?;
        context.present();
        let setup = format!(
            "({})({});{}; 'initialized'",
            c.clock_script, c.seed, c.javascript
        );
        eval(&self.servo, &self.wake, &view, setup, timeout)?;
        if unsafe { bridge_module_signal(fence, 1) } < 0 {
            return Err("E_SERVO_SYNC: initialization signal rejected".into());
        }
        self.next += 1;
        let id = self.next;
        let lease = ImageLease {
            version: 1,
            width: c.width,
            height: c.height,
            profile: 1,
            input_nt: unsafe { bridge_texture_nt_handle(input) },
            output_nt: unsafe { bridge_texture_nt_handle(output) },
            fence_nt,
            instance: id,
            initial_ready: 1,
        };
        self.pages.insert(
            id,
            Page {
                view,
                context,
                delegate,
                input,
                output,
                fence,
                name,
                timeout,
                frames: 0,
                last_frame: 0,
            },
        );
        pending.committed = true;
        Ok(lease)
    }
    fn render(
        &mut self,
        id: u64,
        context: &str,
        params: &str,
        wait_value: u64,
        signal_value: u64,
    ) -> Result<(), String> {
        let page = self
            .pages
            .get_mut(&id)
            .ok_or("E_SERVO_INSTANCE: stale instance")?;
        let ctx: serde_json::Value = serde_json::from_str(context).map_err(|e| e.to_string())?;
        let frame = ctx
            .get("globalFrame")
            .or_else(|| ctx.get("frame"))
            .and_then(|v| v.as_u64())
            .ok_or("E_SERVO_TIME: missing frame")?;
        if !ctx
            .get("time")
            .and_then(|v| v.as_f64())
            .is_some_and(|n| n.is_finite())
            || signal_value <= wait_value
        {
            return Err("E_SERVO_TIME: invalid time or synchronization sequence".into());
        }
        let _params: serde_json::Value = serde_json::from_str(params).map_err(|e| e.to_string())?;
        let painter = page.view.id().into();
        let before = servo_paint_api::native_frame_progress(painter);
        {
            let script = format!(
                "/*frameweave-native-frame-v1:{time}*/(()=>{{const c={context};window.__frameweaveClock.set(c);try{{const r=window.frameweaveRender?.(c,{params});if(r&&typeof r.then==='function')throw Error('E_SERVO_ASYNC_RENDER: synchronous frame callback required');for(const s of document.querySelectorAll('svg')){{s.pauseAnimations?.();s.setCurrentTime?.(c.time);}}}}finally{{window.__frameweaveClock.stop();}}}})()",
                time = ctx["time"]
            );
            let ack = eval(&self.servo, &self.wake, &page.view, script, page.timeout)?;
            if ack.as_deref() == Some("frameweave-native-frame/1:true") {
                wait(&self.servo, &self.wake, page.timeout, || {
                    // Canvas image changes generate a frame without a new
                    // display list. Wait for the actual frame transaction,
                    // then its readiness below, rather than a layout rebuild.
                    servo_paint_api::native_frame_progress(painter).submitted
                        > before.submitted
                })?;
            }
        }
        let before = servo_paint_api::native_frame_progress(painter);
        if page.input != 0 {
            if !servo_paint_api::mark_external_gpu_image_dirty(&page.name) {
                return Err("E_SERVO_RESOURCE: input publication missing".into());
            }
            wait(&self.servo, &self.wake, page.timeout, || {
                servo_paint_api::native_frame_progress(painter).external_updates
                    > before.external_updates
            })?;
        }
        wait(&self.servo, &self.wake, page.timeout, || {
            let p = servo_paint_api::native_frame_progress(painter);
            p.submitted == p.ready
        })?;
        if unsafe { bridge_module_wait(page.fence, wait_value) } < 0 {
            return Err("E_SERVO_SYNC: GPU input wait rejected".into());
        }
        settle(&self.servo, &self.wake, &page.view, page.timeout)?;
        page.context.present();
        if unsafe { bridge_module_signal(page.fence, signal_value) } < 0 {
            return Err("E_SERVO_SYNC: GPU output signal rejected".into());
        }
        page.frames += 1;
        page.last_frame = frame;
        Ok(())
    }
    fn close(&mut self, id: u64) -> Result<(), String> {
        let page = self
            .pages
            .remove(&id)
            .ok_or("E_SERVO_INSTANCE: stale instance")?;
        if page.input != 0 {
            servo_paint_api::unregister_external_gpu_image(&page.name);
            self.servo.spin_event_loop();
        }
        let Page {
            view,
            context,
            input,
            output,
            fence,
            ..
        } = page;
        drop(view);
        self.servo.spin_event_loop();
        drop(context);
        unsafe {
            bridge_release_texture(input);
            bridge_release_texture(output);
            bridge_release_module_fence(fence);
        }
        Ok(())
    }
}
fn ffi<T>(body: impl FnOnce() -> Result<T, String>, failure: T) -> T {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(body)) {
        Ok(Ok(v)) => v,
        Ok(Err(e)) => {
            LAST_ERROR.with(|s| *s.borrow_mut() = e);
            failure
        }
        Err(_) => {
            LAST_ERROR.with(|s| *s.borrow_mut() = "E_SERVO_PANIC: native module failed".into());
            failure
        }
    }
}
unsafe fn text<'a>(data: *const u8, len: usize) -> Result<&'a str, String> {
    if data.is_null() || len > isize::MAX as usize {
        return Err("E_SERVO_BYTES: invalid bounded control input".into());
    }
    std::str::from_utf8(unsafe { std::slice::from_raw_parts(data, len) }).map_err(|e| e.to_string())
}
#[unsafe(no_mangle)]
pub extern "C" fn fw_servo_abi() -> u32 {
    1
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fw_servo_open(
    luid: u64,
    data: *const u8,
    len: usize,
    out: *mut ImageLease,
) -> u64 {
    ffi(
        || {
            if out.is_null() {
                return Err("E_SERVO_BYTES: missing output descriptor".into());
            }
            capacity::config(len)?;
            let config: Config = serde_json::from_str(unsafe { text(data, len) }?)
                .map_err(|e| e.to_string())?;
            HOST.with(|cell| {
                let mut state = cell.borrow_mut();
                if state.is_none() {
                    *state = Some(initialize(luid)?);
                }
                let host = state.as_mut().unwrap();
                if host.luid != luid {
                    return Err("E_SERVO_DEVICE: owner adapter cannot change".into());
                }
                let lease = host.open(config)?;
                let id = lease.instance;
                unsafe {
                    out.write(lease);
                }
                Ok(id)
            })
        },
        0,
    )
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fw_servo_render(
    id: u64,
    context: *const u8,
    context_len: usize,
    params: *const u8,
    params_len: usize,
    wait_value: u64,
    signal_value: u64,
) -> i32 {
    ffi(
        || {
            capacity::control(context_len, params_len)?;
            let context = unsafe { text(context, context_len) }?;
            let params = unsafe { text(params, params_len) }?;
            HOST.with(|s| {
                s.borrow_mut()
                    .as_mut()
                    .ok_or("E_SERVO_INSTANCE: host closed")?
                    .render(id, context, params, wait_value, signal_value)
            })?;
            Ok(0)
        },
        -1,
    )
}
#[unsafe(no_mangle)]
pub extern "C" fn fw_servo_close(id: u64) -> i32 {
    ffi(
        || {
            HOST.with(|s| {
                s.borrow_mut()
                    .as_mut()
                    .ok_or("E_SERVO_INSTANCE: host closed")?
                    .close(id)
            })?;
            Ok(0)
        },
        -1,
    )
}
#[unsafe(no_mangle)]
pub extern "C" fn fw_servo_shutdown() -> i32 {
    ffi(
        || {
            HOST.with(|s| {
                let mut state = s.borrow_mut();
                if let Some(h) = state.as_mut() {
                    let ids: Vec<_> = h.pages.keys().copied().collect();
                    for id in ids {
                        h.close(id)?;
                    }
                }
                let host = state.take();
                drop(state);
                drop(host);
                Ok::<_, String>(())
            })?;
            Ok(0)
        },
        -1,
    )
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fw_servo_error(out: *mut u8, capacity: usize) -> usize {
    LAST_ERROR.with(|s| {
        let s = s.borrow();
        let n = s.len().min(capacity);
        if !out.is_null() {
            unsafe {
                std::ptr::copy_nonoverlapping(s.as_ptr(), out, n);
            }
        }
        n
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fw_servo_stats(out: *mut u8, capacity: usize) -> usize {
    ffi(
        || {
            let json=HOST.with(|s|{let h=s.borrow();serde_json::json!({"version":1,"capacityProfile":"operator-budget-v1","instances":h.as_ref().map(|h|h.pages.len()).unwrap_or(0),"frames":h.as_ref().map(|h|h.pages.values().map(|p|p.frames).sum::<u64>()).unwrap_or(0),"networkBlocked":h.as_ref().map(|h|h.pages.values().map(|p|p.delegate.blocked.get()).sum::<u64>()).unwrap_or(0),"renderingContextReadbackAttempts":RENDERING_CONTEXT_READBACK_ATTEMPTS.load(Ordering::SeqCst),"logicalBridgeResources":unsafe{bridge_live_resources()},"telemetry":servo_paint_api::get_external_gpu_telemetry_snapshot()})}).to_string();
            if json.len() > capacity || out.is_null() {
                return Err("E_SERVO_BYTES: stats output capacity".into());
            }
            unsafe {
                std::ptr::copy_nonoverlapping(json.as_ptr(), out, json.len());
            }
            Ok(json.len())
        },
        0,
    )
}
