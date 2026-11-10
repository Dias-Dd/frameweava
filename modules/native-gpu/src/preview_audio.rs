//! Default-device preview output. PCM has already been mixed by AU-1.
use serde_json::{json,Value};
use std::time::{Duration,Instant};
pub const MAX_BLOCK_FRAMES:u32=9_600;

#[cfg(windows)]
mod device {
    use std::cell::UnsafeCell;
    use std::collections::VecDeque;
    use std::mem::size_of;
    use windows::core::PSTR;
    use windows::Win32::Media::{MMTIME,TIME_SAMPLES};
    use windows::Win32::Media::Audio::*;

    const HEADER_BYTES:u32=size_of::<WAVEHDR>() as u32;
    fn check(result:u32,operation:&str)->Result<(),String>{
        if result==0 {Ok(())}else{Err(format!("E_PREVIEW_AUDIO_DEVICE: {operation} failed (WinMM {result})"))}
    }

    struct Block {
        header:Box<UnsafeCell<WAVEHDR>>,
        _bytes:Box<[u8]>,
    }
    pub struct Device {
        handle:HWAVEOUT,
        blocks:VecDeque<Block>,
        last_position:u32,
        position:u64,
    }
    impl Device {
        pub fn open(rate:u32)->Result<Self,String>{
            let format=WAVEFORMATEX{wFormatTag:3,nChannels:2,nSamplesPerSec:rate,nAvgBytesPerSec:rate*8,
                nBlockAlign:8,wBitsPerSample:32,cbSize:0}; // WAVE_FORMAT_IEEE_FLOAT, interleaved stereo.
            let mut handle=HWAVEOUT::default();
            // This handle and its headers are owned exclusively by the event loop.
            unsafe{check(waveOutOpen(Some(&mut handle),WAVE_MAPPER,&format,None,None,MIDI_WAVE_OPEN_TYPE(0)),"open default output")?;}
            let device=Self{handle,blocks:VecDeque::new(),last_position:0,position:0};
            unsafe{check(waveOutPause(handle),"prime paused output")?;}
            Ok(device)
        }
        pub fn queue(&mut self,bytes:Vec<u8>)->Result<(),String>{
            let mut bytes=bytes.into_boxed_slice();
            let block=Block{header:Box::new(UnsafeCell::new(WAVEHDR{lpData:PSTR(bytes.as_mut_ptr()),
                dwBufferLength:bytes.len() as u32,..Default::default()})),_bytes:bytes};
            let header=block.header.get();
            // Keep both allocations stable until WinMM releases the prepared header.
            unsafe {
                check(waveOutPrepareHeader(self.handle,header,HEADER_BYTES),"prepare PCM block")?;
                let result=waveOutWrite(self.handle,header,HEADER_BYTES);
                self.blocks.push_back(block);
                check(result,"queue PCM block")
            }
        }
        pub fn play(&self)->Result<(),String>{unsafe{check(waveOutRestart(self.handle),"start output")}}
        pub fn position(&mut self)->Result<u64,String>{
            while let Some(block)=self.blocks.front(){
                // Asking the driver to unprepare also tests whether it released
                // the header. The host never reads a driver-owned flags field.
                let result=unsafe{waveOutUnprepareHeader(self.handle,block.header.get(),HEADER_BYTES)};
                if result==WAVERR_STILLPLAYING {break;}
                check(result,"release PCM block")?;
                self.blocks.pop_front();
            }
            let mut time=MMTIME{wType:TIME_SAMPLES,..Default::default()};
            unsafe{check(waveOutGetPosition(self.handle,&mut time,size_of::<MMTIME>() as u32),"read output clock")?;}
            if time.wType!=TIME_SAMPLES{return Err("E_PREVIEW_AUDIO_CLOCK: the default output does not report a sample clock".into());}
            let raw=unsafe{time.u.sample};
            self.position+=u64::from(raw.wrapping_sub(self.last_position));
            self.last_position=raw;
            Ok(self.position)
        }
    }
    impl Drop for Device {
        fn drop(&mut self){
            // Reset returns pending buffers to the host. Retain memory if a
            // broken driver still refuses to release a header after reset.
            unsafe{
                waveOutReset(self.handle);
                while let Some(block)=self.blocks.pop_front(){
                    if waveOutUnprepareHeader(self.handle,block.header.get(),HEADER_BYTES)!=0{std::mem::forget(block);}
                }
                waveOutClose(self.handle);
            }
        }
    }
}
#[cfg(target_os = "linux")]
#[path = "preview_audio_linux.rs"]
mod device;
#[cfg(not(any(windows, target_os = "linux")))]
mod device {
    pub struct Device;
    impl Device {
        pub fn open(_:u32)->Result<Self,String>{Err("E_PREVIEW_AUDIO_DEVICE: native audio output is currently available on Windows and Linux".into())}
        pub fn queue(&mut self,_:Vec<u8>)->Result<(),String>{unreachable!()}
        pub fn play(&self)->Result<(),String>{unreachable!()}
        pub fn position(&mut self)->Result<u64,String>{unreachable!()}
    }
}

pub struct Audio {
    device:device::Device,
    pub revision:u64,
    rate:u32,
    start:u64,
    end:u64,
    queued:u64,
    position:u64,
    playing:bool,
    next_poll:Instant,
}
impl Audio {
    pub fn open(revision:u64,rate:u32,start:u64,end:u64)->Result<Self,String>{
        if !matches!(rate,48_000|96_000)||end<=start||end>9_007_199_254_740_991 {
            return Err("E_PREVIEW_AUDIO_RANGE: expected a finite AU-1 sample range and rate".into());
        }
        Ok(Self{device:device::Device::open(rate)?,revision,rate,start,end,queued:start,position:start,playing:false,next_poll:Instant::now()})
    }
    pub fn queue(&mut self,start:u64,frames:u32,bytes:Vec<u8>)->Result<(),String>{
        let end=start.checked_add(u64::from(frames)).ok_or("E_PREVIEW_AUDIO_RANGE: PCM range overflow")?;
        if start!=self.queued || end>self.end || end-self.position>u64::from(self.rate)/5 ||
            frames==0 || frames>MAX_BLOCK_FRAMES || bytes.len()!=frames as usize*8 {
            return Err("E_PREVIEW_AUDIO_RANGE: PCM must be contiguous and fit the output queue".into());
        }
        self.device.queue(bytes)?;
        self.queued=end;
        if !self.playing && (self.queued==self.end || self.queued-self.start>=u64::from(self.rate)/25){
            self.device.play()?;
            self.playing=true;
        }
        Ok(())
    }
    pub fn poll(&mut self)->Result<Option<Value>,String>{
        let now=Instant::now();
        if !self.playing||self.position==self.end||now<self.next_poll{return Ok(None);}
        self.next_poll=now+Duration::from_millis(8);
        let position=self.start.saturating_add(self.device.position()?).min(self.queued);
        if position<=self.position{return Ok(None);}
        self.position=position;
        Ok(Some(json!({"revision":self.revision,"sample":position,"ended":position==self.end})))
    }
    pub fn needs_poll(&self)->bool{self.playing&&self.position<self.end}
}
