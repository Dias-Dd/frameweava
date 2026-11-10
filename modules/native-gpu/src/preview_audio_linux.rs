//! Default PulseAudio/PipeWire-Pulse output. The event loop owns all handles.
use libloading::Library;
use std::collections::VecDeque;
use std::ffi::{c_char, c_int, c_void};
use std::ptr::{null, null_mut};
use std::time::{Duration, Instant};

type Ptr = *mut c_void;
#[repr(C)]
struct SampleSpec { format: c_int, rate: u32, channels: u8 }
#[repr(C)]
struct BufferAttr { maxlength: u32, tlength: u32, prebuf: u32, minreq: u32, fragsize: u32 }

macro_rules! pulse_api {
    ($($name:ident : $ty:ty),+ $(,)?) => {
        struct Api { _library: Library, $($name: $ty),+ }
        impl Api {
            fn load() -> Result<Self, String> {
                // SAFETY: Load the operating system's PulseAudio client API only.
                let library = unsafe { Library::new("libpulse.so.0") }
                    .map_err(|e| format!("E_PREVIEW_AUDIO_DEVICE: PulseAudio client unavailable: {e}"))?;
                $(let $name = *unsafe { library.get::<$ty>(stringify!($name).as_bytes()) }
                    .map_err(|e| format!("E_PREVIEW_AUDIO_DEVICE: PulseAudio API unavailable: {e}"))?;)+
                Ok(Self { _library: library, $($name),+ })
            }
        }
    }
}

pulse_api! {
    pa_mainloop_new: unsafe extern "C" fn() -> Ptr,
    pa_mainloop_get_api: unsafe extern "C" fn(Ptr) -> Ptr,
    pa_mainloop_iterate: unsafe extern "C" fn(Ptr, c_int, *mut c_int) -> c_int,
    pa_mainloop_free: unsafe extern "C" fn(Ptr),
    pa_context_new: unsafe extern "C" fn(Ptr, *const c_char) -> Ptr,
    pa_context_connect: unsafe extern "C" fn(Ptr, *const c_char, c_int, Ptr) -> c_int,
    pa_context_get_state: unsafe extern "C" fn(Ptr) -> c_int,
    pa_context_disconnect: unsafe extern "C" fn(Ptr),
    pa_context_unref: unsafe extern "C" fn(Ptr),
    pa_stream_new: unsafe extern "C" fn(Ptr, *const c_char, *const SampleSpec, Ptr) -> Ptr,
    pa_stream_connect_playback: unsafe extern "C" fn(Ptr, *const c_char, *const BufferAttr, c_int, Ptr, Ptr) -> c_int,
    pa_stream_get_state: unsafe extern "C" fn(Ptr) -> c_int,
    pa_stream_write: unsafe extern "C" fn(Ptr, *const c_void, usize, Option<unsafe extern "C" fn(Ptr)>, i64, c_int) -> c_int,
    pa_stream_writable_size: unsafe extern "C" fn(Ptr) -> usize,
    pa_stream_cork: unsafe extern "C" fn(Ptr, c_int, Option<unsafe extern "C" fn(Ptr, c_int, Ptr)>, Ptr) -> Ptr,
    pa_stream_get_time: unsafe extern "C" fn(Ptr, *mut u64) -> c_int,
    pa_stream_disconnect: unsafe extern "C" fn(Ptr) -> c_int,
    pa_stream_unref: unsafe extern "C" fn(Ptr),
    pa_operation_unref: unsafe extern "C" fn(Ptr),
}

const CONTEXT_READY:c_int=4;
const STREAM_READY:c_int=2;
const CONTEXT_NOAUTOSPAWN:c_int=1;
const STREAM_START_CORKED:c_int=1;
const STREAM_INTERPOLATE_TIMING:c_int=2;
const STREAM_AUTO_TIMING_UPDATE:c_int=8;

fn fail(operation: &str) -> String { format!("E_PREVIEW_AUDIO_DEVICE: PulseAudio {operation}") }

pub struct Device {
    api: Api,
    loop_: Ptr,
    context: Ptr,
    stream: Ptr,
    rate: u32,
    samples: u64,
    submitted: u64,
    pending: VecDeque<Vec<u8>>,
    pending_offset: usize,
}
impl Device {
    pub fn open(rate:u32) -> Result<Self,String> {
        let api = Api::load()?;
        let loop_ = unsafe { (api.pa_mainloop_new)() };
        if loop_.is_null() { return Err(fail("mainloop allocation failed")); }
        let mut device=Self{api,loop_,context:null_mut(),stream:null_mut(),rate,samples:0,
            submitted:0,pending:VecDeque::new(),pending_offset:0};
        let a=&device.api;
        // SAFETY: Connection and stream APIs execute only on this mainloop owner.
        device.context=unsafe {(a.pa_context_new)((a.pa_mainloop_get_api)(loop_), c"Frameweave".as_ptr())};
        if device.context.is_null() || unsafe{(a.pa_context_connect)(device.context,null(),CONTEXT_NOAUTOSPAWN,null_mut())}!=0 {
            return Err(fail("default server connection failed"));
        }
        device.wait_ready(||unsafe{(a.pa_context_get_state)(device.context)},CONTEXT_READY)?;
        // AU-1 PCM is interleaved little-endian IEEE float stereo.
        let sample=SampleSpec{format:5,rate,channels:2};
        let buffer=BufferAttr{maxlength:rate*8/5,tlength:rate*8/5,prebuf:0,minreq:rate*8/100,fragsize:u32::MAX};
        device.stream=unsafe{(a.pa_stream_new)(device.context,c"Frameweave preview".as_ptr(),&sample,null_mut())};
        let flags=STREAM_START_CORKED|STREAM_INTERPOLATE_TIMING|STREAM_AUTO_TIMING_UPDATE;
        if device.stream.is_null()||unsafe{(a.pa_stream_connect_playback)(device.stream,null(),&buffer,flags,null_mut(),null_mut())}!=0 {
            return Err(fail("default playback stream creation failed"));
        }
        device.wait_ready(||unsafe{(a.pa_stream_get_state)(device.stream)},STREAM_READY)?;
        Ok(device)
    }
    fn pump(&self) -> Result<(),String> {
        for _ in 0..8 {
            let status=unsafe{(self.api.pa_mainloop_iterate)(self.loop_,0,null_mut())};
            if status<0 {return Err(fail("mainloop stopped"));}
            if status==0 {break;}
        }
        Ok(())
    }
    fn wait_ready(&self,state:impl Fn()->c_int,ready:c_int)->Result<(),String>{
        let deadline=Instant::now()+Duration::from_millis(800);
        loop{
            self.pump()?;
            let current=state();
            if current==ready{return Ok(());}
            if current>ready||Instant::now()>=deadline{return Err(fail("connection failed or timed out"));}
            std::thread::sleep(Duration::from_millis(1));
        }
    }
    fn check(&self) -> Result<(),String>{
        self.pump()?;
        if unsafe{(self.api.pa_stream_get_state)(self.stream)}!=STREAM_READY{return Err(fail("playback stream disconnected"));}
        Ok(())
    }
    pub fn queue(&mut self,bytes:Vec<u8>)->Result<(),String>{
        self.pending.push_back(bytes);
        self.submit_pending()
    }
    fn submit_pending(&mut self)->Result<(),String>{
        self.check()?;
        let mut writable=unsafe{(self.api.pa_stream_writable_size)(self.stream)};
        if writable==usize::MAX{return Err(fail("playback queue size unavailable"));}
        // Servers may negotiate a smaller buffer than AU-1's block size.
        // AU-1 bounds pending + submitted audio to 200ms and keeps it contiguous.
        while let Some(block)=self.pending.front(){
            let bytes=&block[self.pending_offset..];
            let length=bytes.len().min(writable/8*8);
            if length==0{break;}
            // PulseAudio copies the block before returning when free_cb is null.
            if unsafe{(self.api.pa_stream_write)(self.stream,bytes.as_ptr().cast(),length,None,0,0)}!=0{
                return Err(fail("PCM write failed"));
            }
            self.submitted+=(length/8) as u64;
            writable-=length;
            self.pending_offset+=length;
            if self.pending_offset==block.len(){
                self.pending.pop_front();
                self.pending_offset=0;
            }
        }
        Ok(())
    }
    pub fn play(&self)->Result<(),String>{
        self.check()?;
        let operation=unsafe{(self.api.pa_stream_cork)(self.stream,0,None,null_mut())};
        if operation.is_null(){return Err(fail("could not start playback"));}
        unsafe{(self.api.pa_operation_unref)(operation)};
        Ok(())
    }
    pub fn position(&mut self)->Result<u64,String>{
        self.submit_pending()?;
        let mut micros=0u64;
        if unsafe{(self.api.pa_stream_get_time)(self.stream,&mut micros)}==0{
            let position=(u128::from(micros)*u128::from(self.rate)/1_000_000) as u64;
            self.samples=self.samples.max(position.min(self.submitted));
        }
        Ok(self.samples)
    }
}
impl Drop for Device {
    fn drop(&mut self){
        unsafe{
            if !self.stream.is_null(){(self.api.pa_stream_disconnect)(self.stream);(self.api.pa_stream_unref)(self.stream);}
            if !self.context.is_null(){(self.api.pa_context_disconnect)(self.context);(self.api.pa_context_unref)(self.context);}
            (self.api.pa_mainloop_free)(self.loop_);
        }
    }
}
