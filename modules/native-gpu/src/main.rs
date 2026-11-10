#![deny(unsafe_code)]
mod gpu;
mod ray_contract;
mod native_ray;
mod native_optix;
#[allow(unsafe_code)]mod ray_policy;
mod mesh_transparency;
mod protocol;
mod seed_transport;
#[allow(unsafe_code)] // WinMM only, with owner-local prepared buffers.
mod preview_audio;
mod preview_controls;
mod binary_resource;
mod encode;
mod native_module;
mod native_video;
mod native_inference;
#[cfg(windows)]#[allow(unsafe_code)]mod reviewed_runtime_windows;
mod inference_contract;
#[cfg(windows)]#[allow(unsafe_code)]mod external_tensor_windows;
#[cfg(windows)]
#[allow(unsafe_code)] // Audited, engine-owned Vulkan/Win32 handle adapter only.
mod external_windows;

use gpu::Gpu;
use protocol::{Command, Request, VERSION};
use serde_json::{json, Value};
use std::io::{self, BufRead, Read, Write};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};
use winit::application::ApplicationHandler;
use winit::event::{ElementState, MouseButton, WindowEvent};
use winit::keyboard::{KeyCode, PhysicalKey};
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::window::{Window, WindowId};

fn emit(value: Value) {
    let mut out = io::stdout().lock();
    let _ = writeln!(out, "{value}");
    let _ = out.flush();
}
fn ok(id:u64, result:Value) { emit(json!({"version":VERSION,"id":id,"ok":true,"result":result})); }
fn fail(id:u64, error:String) {
    let (code,message)=error.split_once(':').unwrap_or(("E_NATIVE_BACKEND",&error));
    emit(json!({"version":VERSION,"id":id,"ok":false,"error":{"code":code,"message":message.trim()}}));
}

struct Host {
    gpu: Option<Gpu>,
    previous_preview: Option<Gpu>,
    preview_failed: bool,
    window: Option<Arc<Window>>,
    close_id: Option<u64>,
    preview: PreviewWindow,
    preview_session: Option<String>,
    preview_audio: Option<preview_audio::Audio>,
    stopped: bool,
}
impl Host {
    fn request(&mut self, request:Request, event_loop:Option<&ActiveEventLoop>, windowed:bool) {
        let id=request.id;
        let result=(||->Result<Option<Value>,String> {
            match request.command {
                Command::Init {program} => {
                    if self.gpu.is_some(){return Err("E_NATIVE_INIT: session already initialized".into());}
                    program.validate()?;
                    if windowed {
                        let display=program.display.as_ref().ok_or("E_NATIVE_DISPLAY: window requires display specification")?;
                        let image=&program.images[display.image];
                        let window=event_loop.ok_or("E_NATIVE_DISPLAY: native event loop required")?.create_window(
                            Window::default_attributes().with_title("Frameweave Forge")
                            .with_resizable(false).with_inner_size(winit::dpi::PhysicalSize::new(image.width,image.height))
                        ).map_err(|e|format!("E_NATIVE_DISPLAY: {e}"))?;
                        self.window=Some(Arc::new(window));
                        self.preview_session=Some(program.session.clone());
                    }
                    self.gpu=Some(pollster::block_on(Gpu::new(program,self.window.clone(),event_loop.map(ActiveEventLoop::owned_display_handle)))?);
                    Ok(Some(self.gpu.as_ref().unwrap().stats()))
                }
                Command::PreviewAudioStart {session,revision,input,rate,start,end} => {
                    if self.preview_session.as_deref()!=Some(&session) {
                        return Err("E_NATIVE_PREVIEW: invalid preview window session".into());
                    }
                    if !self.preview.active||self.preview.revision!=revision||self.preview.input!=input {
                        return Ok(Some(json!({"accepted":false})));
                    }
                    self.preview_audio=None;
                    self.preview_audio=Some(preview_audio::Audio::open(revision,rate,start,end)?);
                    Ok(Some(json!({"accepted":true})))
                }
                Command::PreviewAudioQueue {session,revision,start,frames,pcm} => {
                    if self.preview_session.as_deref()!=Some(&session) {
                        return Err("E_NATIVE_PREVIEW: invalid preview window session".into());
                    }
                    let Some(audio)=self.preview_audio.as_mut().filter(|audio|audio.revision==revision) else {
                        return Ok(Some(json!({"accepted":false})));
                    };
                    if let Err(error)=audio.queue(start,frames,pcm){
                        self.preview_audio=None;
                        return Err(error);
                    }
                    Ok(Some(json!({"accepted":true})))
                }
                Command::PreviewAudioStop {session,revision} => {
                    if self.preview_session.as_deref()!=Some(&session) {
                        return Err("E_NATIVE_PREVIEW: invalid preview window session".into());
                    }
                    if self.preview_audio.as_ref().is_some_and(|audio|audio.revision==revision){self.preview_audio=None;}
                    Ok(Some(json!({})))
                }
                Command::PreparePreviewReload {session,program} => {
                    let gpu=self.gpu.as_ref().ok_or("E_NATIVE_INIT: initialize before replacement")?;
                    gpu.check_session(&session)?;
                    if self.window.is_none() || self.previous_preview.is_some() {
                        return Err("E_NATIVE_PREVIEW_RELOAD: expected a window with no pending replacement".into());
                    }
                    let replacement=pollster::block_on(gpu.prepare_preview_reload(program))?;
                    self.previous_preview=self.gpu.replace(replacement);
                    Ok(Some(json!({})))
                }
                Command::CommitPreviewReload {session,frame,revision,input,duration,retain_preview} => {
                    let gpu=self.gpu.as_mut().ok_or("E_NATIVE_INIT: initialize before replacement")?;
                    gpu.check_session(&session)?;
                    let previous=self.previous_preview.as_mut().ok_or("E_NATIVE_PREVIEW_RELOAD: no pending replacement")?;
                    if input!=self.preview.input || revision<self.preview.revision {
                        return Err("E_NATIVE_PREVIEW_RELOAD_STALE: window input changed while preparing the replacement".into());
                    }
                    if self.preview_failed || duration==0 || frame>=duration {
                        return Err("E_NATIVE_PREVIEW_RELOAD: replacement is invalid".into());
                    }
                    let (width,height)=pollster::block_on(gpu.commit_preview_reload(previous,frame,duration,&retain_preview))?;
                    self.previous_preview=None;
                    self.preview.revision=revision;
                    self.preview.duration=duration;
                    self.preview.sample=None;
                    self.preview.fps=0.;
                    gpu.preview_state(Some(revision),duration);
                    let window=self.window.as_ref().unwrap();
                    let size=winit::dpi::PhysicalSize::new(width,height);
                    if window.inner_size()!=size { let _=window.request_inner_size(size); }
                    self.preview.presented(window,frame);
                    emit(json!({"version":VERSION,"event":"previewPresented","frame":frame,"revision":revision}));
                    Ok(Some(json!({})))
                }
                Command::AbortPreviewReload {session} => {
                    let gpu=self.gpu.as_ref().ok_or("E_NATIVE_INIT: initialize before replacement")?;
                    gpu.check_session(&session)?;
                    let previous=self.previous_preview.take().ok_or("E_NATIVE_PREVIEW_RELOAD: no pending replacement")?;
                    previous.bind_device_errors();
                    self.gpu=Some(previous);
                    self.preview_failed=false;
                    Ok(Some(json!({})))
                }
                command => {
                    let gpu=self.gpu.as_mut().ok_or("E_NATIVE_INIT: initialize before commands")?;
                    if self.preview_failed && !matches!(command,Command::Close{..}|Command::PreviewState{..}) {
                        return Err("E_NATIVE_PREVIEW_RELOAD: replacement failed and must be discarded".into());
                    }
                    match command {
                        Command::Submit {session,frame,slot,parameters,frame_bindings,preview_revision,preview_advance,preview_timing,stage_cache,preview_cache_key} => {
                            gpu.check_session(&session)?;if let Some(p)=gpu.frame_program(slot,&parameters,frame_bindings.as_ref())?{pollster::block_on(gpu.prepare_frame_slot(slot,p,frame_bindings.is_some(),stage_cache.iter().any(|item|item.first.is_some())))?;}gpu.submit(frame,slot,parameters,preview_revision,preview_advance,preview_timing,&stage_cache,preview_cache_key.as_deref())?;
                            let mut response=json!({"frame":frame,"slot":slot,"completion":"submitted-not-completed"});
                            if gpu.has_publication(slot){response["publication"]=json!(gpu.publication_id(slot));}
                            Ok(Some(response))
                        }
                        Command::SubmitCachedPreview {session,frame,slot,revision,key} => {
                            gpu.check_session(&session)?;
                            if self.previous_preview.is_some()||revision!=self.preview.revision||frame>=self.preview.duration||self.window.is_none()||
                                !gpu.submit_cached_preview(frame,slot,revision,&key)?{
                                return Err("E_NATIVE_PREVIEW_CACHE_MISS: no current display frame in the cache".into());
                            }
                            self.preview.presented(self.window.as_ref().unwrap(),frame);
                            emit(json!({"version":VERSION,"event":"previewPresented","frame":frame,"revision":revision}));
                            Ok(Some(json!({"frame":frame,"slot":slot,"completion":"submitted-not-completed"})))
                        }
                        Command::SubmitBatch {session,frames} => {
                            gpu.check_session(&session)?;
                            if frames.is_empty()||frames.len()>gpu.program.slots{return Err("E_NATIVE_BATCH: batch exceeds frame capacity".into());}
                            let mut seen=std::collections::HashSet::new();
                            let mut plans=Vec::new();for f in &frames{if !seen.insert(f.slot){return Err("E_NATIVE_BATCH: repeated slot".into());}plans.push(gpu.frame_program(f.slot,&f.parameters,f.frame_bindings.as_ref())?);}
                            let count=frames.len();let slots=frames.iter().map(|f|f.slot).collect::<Vec<_>>();for (f,p) in frames.into_iter().zip(plans){if let Some(p)=p{pollster::block_on(gpu.prepare_frame_slot(f.slot,p,f.frame_bindings.is_some(),false))?;}gpu.submit(f.frame,f.slot,f.parameters,None,false,false,&[],None)?;}
                            Ok(Some(json!({"count":count,"completion":"submitted-not-completed","publications":slots.iter().map(|&s|gpu.publication_id(s)).collect::<Vec<_>>()})))
                        }
                        Command::PreviewState {session,revision,input,duration,label,active} => {
                            if self.preview_session.as_deref()!=Some(&session) || duration == 0 || label.len() > 512 || label.chars().any(char::is_control) {
                                return Err("E_NATIVE_PREVIEW: expected window, duration and short status text".into());
                            }
                            let accepted = input == self.preview.input && revision >= self.preview.revision;
                            if accepted {
                                if self.preview.revision!=revision || !active {self.preview_audio=None;}
                                self.preview.revision = revision;
                                self.preview.duration = duration;
                                self.preview.label = label;
                                self.preview.active = active;
                                self.preview.update_title(self.window.as_ref().unwrap());
                                self.previous_preview.as_mut().unwrap_or(gpu).preview_state(Some(revision), duration);
                            }
                            Ok(Some(json!({"accepted":accepted})))
                        }
                        Command::Reconfigure {program,cache_id}=>{
                            pollster::block_on(gpu.reconfigure(program,cache_id))?;
                            Ok(Some(if cache_id.is_some(){json!({"slots":gpu.program.slots})}else{gpu.stats()}))
                        }
                        Command::ActivatePlan {session,cache_id}=>{
                            gpu.check_session(&session)?;
                            Ok(Some(json!({"hit":gpu.activate_plan(cache_id)?})))
                        }
                        Command::StateCheckpoint {session,action,name}=>{gpu.check_session(&session)?;Ok(Some(gpu.state_checkpoint(&action,&name)?))}
                        Command::InferenceCapabilities {session}=>{gpu.check_session(&session)?;Ok(Some(gpu.inference_capabilities()?))}
                        Command::Stats {session} => {gpu.check_session(&session)?;Ok(Some(gpu.stats()))}
                        Command::ReadData {session,frame,slot,publication,name,file}=>{gpu.check_session(&session)?;Ok(Some(json!({"version":1,"bytes":gpu.read_data(frame,slot,publication,&name,&file)?,"format":"words32-le","ownership":"host-lease","lifetime":"export"})))}
                        Command::Close {session} => {
                            gpu.check_session(&session)?;gpu.closing=true;
                            if self.close_id.is_some(){return Err("E_NATIVE_CLOSED: close already pending".into());}
                            self.close_id=Some(id);Ok(None)
                        }
                        #[cfg(feature = "diagnostics")]
                        Command::Inspect {session,slot,image} => {gpu.check_session(&session)?;Ok(Some(json!({"pixels":gpu.inspect(slot,image)?})))}
                        #[cfg(feature = "diagnostics")]
                        Command::InspectDisplay {session,slot} => {gpu.check_session(&session)?;Ok(Some(json!({"pixels":gpu.inspect_display(slot)?})))}
                        #[cfg(feature = "diagnostics")]
                        Command::InspectMedia {session,slot}=>{gpu.check_session(&session)?;Ok(Some(json!({"pixels":gpu.inspect_media(slot)?})))}
                        Command::Init {..} | Command::PreviewAudioStart {..} | Command::PreviewAudioQueue {..} |
                        Command::PreviewAudioStop {..} | Command::PreparePreviewReload {..} |
                        Command::CommitPreviewReload {..} | Command::AbortPreviewReload {..} => unreachable!(),
                    }
                }
            }
        })();
        match result { Ok(Some(value))=>ok(id,value),Ok(None)=>{},Err(e)=>fail(id,e) }
    }
    fn poll(&mut self) {
        if let Some(audio)=&mut self.preview_audio {
            match audio.poll(){
                Ok(Some(clock))=>emit(json!({"version":VERSION,"event":"previewAudioClock","clock":clock})),
                Ok(None)=>{},
                Err(error)=>{
                    emit(json!({"version":VERSION,"event":"previewAudioFailed","revision":audio.revision,"error":error}));
                    self.preview_audio=None;
                }
            }
        }
        if self.preview_failed && self.close_id.is_none() {return;}
        if let Some(gpu)=&mut self.gpu {
            match gpu.poll() {
                Ok(ready)=>for (slot,frame,presented,gpu_time) in ready {
                    if let Some(revision) = presented {
                        self.preview.presented(self.window.as_ref().unwrap(), frame);
                        emit(json!({"version":VERSION,"event":"previewPresented","frame":frame,"revision":revision}));
                    }
                    let mut event=json!({"version":VERSION,"event":"completed","slot":slot,"frame":frame});
                    if let Some(time)=gpu_time{event["gpuTimeMs"]=json!(time);}
                    emit(event);
                },
                Err(error) if self.previous_preview.is_some() && self.close_id.is_none()=>{
                    self.preview_failed=true;
                    emit(json!({"version":VERSION,"event":"previewReloadFailed","error":error}));
                }
                Err(error)=>{emit(json!({"version":VERSION,"event":"failed","error":error}));self.stopped=true;}
            }
            if gpu.closing&&gpu.idle() {
                match gpu.finish_export(){Ok(true)=>{if let Some(id)=self.close_id.take(){ok(id,gpu.stats());}self.stopped=true;},Ok(false)=>{},Err(error)=>{if let Some(id)=self.close_id.take(){fail(id,error);}self.stopped=true;}}
            }
        }
    }
}
enum Input { Request(Request), SeededRequest(Request,mpsc::SyncSender<()>), Invalid(String), Eof }
fn reader(tx:mpsc::SyncSender<Input>, wake:Option<winit::event_loop::EventLoopProxy<()>>,control_limit:Option<u64>,seed_limit:Option<u64>) {
    std::thread::spawn(move || {
        let mut input=io::stdin().lock();
        let max_line=control_limit.unwrap_or(u64::MAX-1);
        loop {
            let mut bytes=Vec::new();
            match input.by_ref().take(max_line.saturating_add(1)).read_until(b'\n',&mut bytes) {
                Ok(0)=>{let _=tx.send(Input::Eof);if let Some(p)=&wake{let _=p.send_event(());}break;}
                Ok(_) if bytes.len() as u64>max_line=>{let _=tx.send(Input::Invalid("E_NATIVE_MESSAGE: control message exceeds configured byte budget".into()));break;}
                Ok(_)=>{
                    match seed_transport::read_request(&bytes,&mut input,seed_limit){
                     Ok((request,true))=>{
                      // Only one binary request may occupy host staging. Do not
                      // pre-read up to sixteen large bodies into the event queue.
                      let (done,wait)=mpsc::sync_channel(0);
                      if tx.send(Input::SeededRequest(request,done)).is_err(){break;}
                      if let Some(p)=&wake{let _=p.send_event(());}
                      if wait.recv().is_err(){break;}
                     },
                     Ok((request,false))=>{if tx.send(Input::Request(request)).is_err(){break;}if let Some(p)=&wake{let _=p.send_event(());}},
                     Err(error)=>{let _=tx.send(Input::Invalid(error));if let Some(p)=&wake{let _=p.send_event(());}break;},
                    }
                }
                Err(_)=>{let _=tx.send(Input::Eof);break;}
            }
        }
    });
}
#[derive(Default)]
struct PreviewWindow {
    active:bool,
    input:u64,
    revision:u64,
    duration:u64,
    label:String,
    cursor:Option<winit::dpi::PhysicalPosition<f64>>,
    dragging:bool,
    drag_frame:Option<u64>,
    pressed_button:Option<&'static str>,
    shown:Option<u64>,
    fps:f64,
    sample:Option<(Instant, u32)>,
}
impl PreviewWindow {
    fn frame_at_cursor(&self, window:&Window, in_strip:bool) -> Option<u64> {
        let position = self.cursor?;
        let size = window.inner_size();
        if self.duration == 0 || size.width == 0 || size.height == 0 { return None; }
        if in_strip && !preview_controls::Layout::new(size.width,size.height).in_strip(position.y,size.height) { return None; }
        let fraction = (position.x/f64::from(size.width.saturating_sub(1).max(1))).clamp(0.,1.);
        Some((fraction * self.duration.saturating_sub(1) as f64).round() as u64)
    }
    fn button_at_cursor(&self, window:&Window) -> Option<&'static str> {
        let position = self.cursor?;
        let size = window.inner_size();
        preview_controls::Layout::new(size.width,size.height).button(position.x,position.y,size.height)
    }
    fn update_title(&self, window:&Window) {
        let frame = self.shown.map(|f| (f+1).to_string()).unwrap_or_else(|| "–".into());
        window.set_title(&format!("Frameweave Forge | {frame}/{} | {} | {:.1} presented fps",self.duration,self.label,self.fps));
    }
    fn presented(&mut self, window:&Window, frame:u64) {
        self.shown = Some(frame);
        let now = Instant::now();
        let (start,count) = self.sample.get_or_insert((now,0));
        *count += 1;
        let elapsed = now.duration_since(*start);
        if *count == 1 || elapsed >= Duration::from_millis(250) {
            if *count > 1 {
                self.fps = (*count - 1) as f64 / elapsed.as_secs_f64();
                self.sample = None;
            }
            self.update_title(window);
        }
    }
}
struct App { host:Host, rx:mpsc::Receiver<Input> }
impl App {
    fn pump(&mut self,event_loop:&ActiveEventLoop) {
        for _ in 0..16 {
            match self.rx.try_recv() {
                Ok(Input::Request(r))=>self.host.request(r,Some(event_loop),true),
                Ok(Input::SeededRequest(r,done))=>{self.host.request(r,Some(event_loop),true);let _=done.send(());},
                Ok(Input::Invalid(e))=>fail(0,e),
                Ok(Input::Eof)|Err(mpsc::TryRecvError::Disconnected)=>{self.host.stopped=true;break;}
                Err(mpsc::TryRecvError::Empty)=>break,
            }
        }
        self.host.poll();
        if self.host.stopped {event_loop.exit();}
        else if !self.host.preview_failed && self.host.gpu.as_ref().is_some_and(|g|!g.idle()||g.closing){
            event_loop.set_control_flow(ControlFlow::WaitUntil(Instant::now()+Duration::from_millis(1)));
        }else if self.host.preview_audio.as_ref().is_some_and(preview_audio::Audio::needs_poll) {
            event_loop.set_control_flow(ControlFlow::WaitUntil(Instant::now()+Duration::from_millis(8)));
        }else{event_loop.set_control_flow(ControlFlow::Wait);}
    }
}
impl ApplicationHandler<()> for App {
    fn resumed(&mut self,event_loop:&ActiveEventLoop){self.pump(event_loop);}
    fn user_event(&mut self,event_loop:&ActiveEventLoop,_:()){self.pump(event_loop);}
    fn about_to_wait(&mut self,event_loop:&ActiveEventLoop){self.pump(event_loop);}
    fn window_event(&mut self,event_loop:&ActiveEventLoop,id:WindowId,event:WindowEvent) {
        if matches!(event,WindowEvent::CloseRequested){emit(json!({"version":VERSION,"event":"windowClosed"}));self.host.stopped=true;event_loop.exit();return;}
        let Some(window) = &self.host.window else { return; };
        let preview = &mut self.host.preview;
        if window.id()!=id || !preview.active { return; }
        let (action,frame) = match event {
            WindowEvent::KeyboardInput{event,..} if event.state==ElementState::Pressed => {
                let action = match event.physical_key {
                    PhysicalKey::Code(KeyCode::Space) if !event.repeat => "toggle",
                    PhysicalKey::Code(KeyCode::ArrowLeft) => "previous",
                    PhysicalKey::Code(KeyCode::ArrowRight) => "next",
                    PhysicalKey::Code(KeyCode::Home) => "first",
                    PhysicalKey::Code(KeyCode::End) => "last",
                    _ => return,
                };
                (action,None)
            }
            WindowEvent::CursorMoved{position,..} => {
                preview.cursor = Some(position);
                if !preview.dragging { return; }
                let target = preview.frame_at_cursor(window,false);
                if target == preview.drag_frame { return; }
                preview.drag_frame = target;
                ("seek",target)
            }
            WindowEvent::MouseInput{state:ElementState::Pressed,button:MouseButton::Left,..} => {
                preview.pressed_button = preview.button_at_cursor(window);
                if preview.pressed_button.is_some() { return; }
                let Some(target) = preview.frame_at_cursor(window,true) else { return; };
                preview.dragging = true;
                preview.drag_frame = Some(target);
                ("seek",Some(target))
            }
            WindowEvent::MouseInput{state:ElementState::Released,button:MouseButton::Left,..}
                if preview.dragging => {
                    preview.dragging = false;
                    ("scrubEnd",preview.drag_frame.take())
                }
            WindowEvent::MouseInput{state:ElementState::Released,button:MouseButton::Left,..} => {
                let Some(button) = preview.pressed_button.take() else { return; };
                if preview.button_at_cursor(window) != Some(button) { return; }
                (button,None)
            }
            WindowEvent::Focused(false) => {
                preview.pressed_button = None;
                if !preview.dragging { return; }
                preview.dragging = false;
                ("scrubEnd",preview.drag_frame.take())
            }
            _ => return,
        };
        preview.input += 1;
        self.host.preview_audio=None;
        if let Some(gpu) = self.host.previous_preview.as_mut().or(self.host.gpu.as_mut()) {gpu.preview_state(None,preview.duration);}
        emit(json!({"version":VERSION,"event":"previewInput","action":action,"input":preview.input,"frame":frame}));
    }
}
fn main() {
    let args=std::env::args().skip(1).collect::<Vec<_>>();
    let mut windowed=false;let mut control_limit=None;let mut seed_limit=None;let mut at=0;
    while at<args.len(){
     match args[at].as_str(){
      "--window" if !windowed=>{windowed=true;at+=1;},
      "--control-bytes"|"--seed-bytes"=>{
       let value=args.get(at+1).and_then(|v|v.parse::<u64>().ok()).filter(|&v|v>0&&v<u64::MAX);
       let Some(value)=value else{fail(0,"E_NATIVE_OPTIONS: transport budget needs a positive byte count".into());std::process::exit(2);};
       let option=if args[at]=="--control-bytes"{&mut control_limit}else{&mut seed_limit};
       if option.replace(value).is_some(){fail(0,"E_NATIVE_OPTIONS: duplicate transport budget".into());std::process::exit(2);}at+=2;
      },
      _=>{fail(0,"E_NATIVE_OPTIONS: expected --window or transport byte budgets".into());std::process::exit(2);},
     }
    }
    let (tx,rx)=mpsc::sync_channel(16);
    let host=Host {gpu:None,previous_preview:None,preview_failed:false,window:None,close_id:None,preview:PreviewWindow::default(),preview_session:None,preview_audio:None,stopped:false};
    if windowed {
        let event_loop=match EventLoop::<()>::with_user_event().build(){
            Ok(loop_)=>loop_,
            Err(error)=>{fail(0,format!("E_NATIVE_DISPLAY: {error}"));std::process::exit(2);}
        };
        reader(tx,Some(event_loop.create_proxy()),control_limit,seed_limit);
        event_loop.run_app(&mut App{host,rx}).expect("native window event loop");
    } else {
        reader(tx,None,control_limit,seed_limit);let mut host=host;
        while !host.stopped {
            let active=host.gpu.as_ref().is_some_and(|g|!g.idle()||g.closing);
            let next=if active{rx.recv_timeout(Duration::from_millis(1)).ok()}else{rx.recv().ok()};
            match next {
                Some(Input::Request(r))=>host.request(r,None,false),
                Some(Input::SeededRequest(r,done))=>{host.request(r,None,false);let _=done.send(());},
                Some(Input::Invalid(e))=>fail(0,e),
                Some(Input::Eof)=>break,
                None if !active=>break,
                None=>{},
            }
            host.poll();
        }
    }
}
