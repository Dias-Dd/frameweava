//! Explicit final-output materialization only. Preview never enters this path.
use std::io::{Read,Write};
use std::process::{Command,Stdio};
use std::sync::{mpsc,Arc,Mutex};
use crate::protocol::Export;

pub struct Frame {pub slot:usize,pub frame:u64,pub buffer:wgpu::Buffer,pub bytes:usize}
pub struct Encoder {tx:Option<mpsc::SyncSender<Frame>>,result:mpsc::Receiver<Result<(),String>>,finished:Option<Result<(),String>>}
impl Encoder {
 pub fn new(spec:&Export,width:u32,height:u32,done:mpsc::Sender<(usize,u64)>,errors:mpsc::Sender<String>)->Result<Self,String>{
  let mut args=vec!["-hide_banner".into(),"-loglevel".into(),"error".into(),"-nostdin".into(),"-y".into(),"-f".into(),"rawvideo".into(),"-pixel_format".into(),spec.format.clone(),"-video_size".into(),format!("{width}x{height}"),"-framerate".into(),format!("{}/{}",spec.fps[0],spec.fps[1]),"-i".into(),"pipe:0".into(),"-an".into(),"-c:v".into(),spec.codec.clone()];
  match spec.codec.as_str(){
   "h264_nvenc"=>args.extend(["-preset","p4","-rc","vbr","-cq","18","-b:v","0","-pix_fmt","yuv420p","-color_range","tv","-colorspace","bt709","-color_trc","iec61966-2-1","-color_primaries","bt709","-movflags","+faststart"].map(String::from)),
   "hevc_nvenc"|"av1_nvenc"=>args.extend(["-preset","p4","-rc","vbr","-cq","18","-b:v","0","-pix_fmt","yuv420p","-color_range","tv","-colorspace","bt709","-color_trc","iec61966-2-1","-color_primaries","bt709","-movflags","+faststart"].map(String::from)),
   "libx265"=>args.extend(["-preset","ultrafast","-crf","18","-x265-params","pools=1:frame-threads=1:log-level=error","-pix_fmt","yuv420p","-color_range","tv","-colorspace","bt709","-color_trc","iec61966-2-1","-color_primaries","bt709","-tag:v","hvc1","-movflags","+faststart"].map(String::from)),
   "libaom-av1"=>args.extend(["-cpu-used","8","-crf","18","-b:v","0","-row-mt","1","-threads","2","-pix_fmt","yuv420p","-color_range","tv","-colorspace","bt709","-color_trc","iec61966-2-1","-color_primaries","bt709","-movflags","+faststart"].map(String::from)),
   "libx264"=>args.extend(["-preset","fast","-crf","18","-pix_fmt","yuv420p","-color_range","tv","-colorspace","bt709","-color_trc","iec61966-2-1","-color_primaries","bt709","-movflags","+faststart"].map(String::from)),
   "png"=>args.extend(["-frames:v","1","-update","1"].map(String::from)),
   "exr"=>args.extend(["-frames:v","1","-update","1","-format","float"].map(String::from)),
   _=>return Err("E_NATIVE_ENCODE: unsupported explicit encoder".into()),
  }
  args.push(spec.output.clone());
  let mut command=Command::new(&spec.executable);command.args(args).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped());
  #[cfg(windows)] {use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
  let mut child=command.spawn().map_err(|e|format!("E_NATIVE_ENCODE: {e}"))?;
  let mut input=child.stdin.take().ok_or("E_NATIVE_ENCODE: missing encoder input")?;
  let mut stderr=child.stderr.take().ok_or("E_NATIVE_ENCODE: missing encoder diagnostics")?;
  let log=Arc::new(Mutex::new(Vec::new()));let thread_log=log.clone();
  let log_reader=std::thread::spawn(move||{let mut chunk=[0;2048];while let Ok(n)=stderr.read(&mut chunk){if n==0{break;}if let Ok(mut l)=thread_log.lock(){l.extend_from_slice(&chunk[..n]);if l.len()>16384{let remove=l.len()-16384;l.drain(..remove);}}}});
  let (tx,rx)=mpsc::sync_channel::<Frame>(2);let (result_tx,result)=mpsc::channel();
  std::thread::spawn(move||{
   let r=(||->Result<(),String>{
    for item in rx{
     let view=item.buffer.slice(..).get_mapped_range().map_err(|e|format!("E_NATIVE_ENCODE: {e}"))?;
     let write=input.write_all(&view[..item.bytes]);drop(view);item.buffer.unmap();
     write.map_err(|e|format!("E_NATIVE_ENCODE: {e}"))?;let _=done.send((item.slot,item.frame));
    }
    drop(input);let status=child.wait().map_err(|e|format!("E_NATIVE_ENCODE: {e}"))?;
    if !status.success(){return Err(format!("E_NATIVE_ENCODE: {status}"));}Ok(())
   })();
   if r.is_err(){let _=child.kill();let _=child.wait();}let _=log_reader.join();
   let r=r.map_err(|e|format!("{e}: {}",String::from_utf8_lossy(&log.lock().unwrap())));
   if let Err(e)=&r{let _=errors.send(e.clone());}let _=result_tx.send(r);
  });
  Ok(Self{tx:Some(tx),result,finished:None})
 }
 pub fn send(&self,frame:Frame)->Result<(),mpsc::TrySendError<Frame>>{self.tx.as_ref().unwrap().try_send(frame)}
 pub fn failure(&mut self)->Option<String>{
  if self.finished.is_none(){if let Ok(r)=self.result.try_recv(){self.finished=Some(r);}}
  self.finished.as_ref().and_then(|r|r.as_ref().err().cloned())
 }
 pub fn finish(&mut self)->Result<bool,String>{
  self.tx.take();if self.finished.is_none(){if let Ok(r)=self.result.try_recv(){self.finished=Some(r);}}
  match &self.finished{Some(Ok(()))=>Ok(true),Some(Err(e))=>Err(e.clone()),None=>Ok(false)}
 }
}

/// Flatten a bounded two-dimensional dispatch into the existing byte/plane
/// order. F32 export needs four invocations per pixel (129600 groups at 1080p),
/// which cannot fit in WebGPU's guaranteed 65535 groups on a single axis.
pub fn pack_dispatch(words:u64,limit:u32)->Result<[u32;3],String>{
 if words==0||limit==0{return Err("E_NATIVE_ENCODE: invalid packing dispatch".into());}
 let groups=words.div_ceil(64);let x=groups.min(u64::from(limit));let y=groups.div_ceil(x);
 if y>u64::from(limit){return Err("E_NATIVE_ENCODE: packing exceeds two-dimensional dispatch limits".into());}
 Ok([x as u32,y as u32,1])
}

#[cfg(test)]mod tests{
 use super::pack_dispatch;
 #[test]fn pack_dispatch_covers_sdr_and_large_float_frames(){
  assert_eq!(pack_dispatch(1,65535).unwrap(),[1,1,1]);
  assert_eq!(pack_dispatch(1920*1080,65535).unwrap(),[32400,1,1]);
  assert_eq!(pack_dispatch(1920*1080*4,65535).unwrap(),[65535,2,1]);
  assert_eq!(pack_dispatch(3840*2160*4,65535).unwrap(),[65535,8,1]);
  for words in [1,63,64,65,65535*64,65535*64+1,3840*2160*4,16_777_216*4]{
   let [x,y,z]=pack_dispatch(words,65535).unwrap();assert!(x<=65535&&y<=65535&&z==1);
   assert!(u64::from(x)*u64::from(y)*64>=words);
  }
  assert!(pack_dispatch(0,65535).is_err());assert!(pack_dispatch(1,0).is_err());assert!(pack_dispatch(65,1).is_err());
 }
}

pub const PACK:&str=r#"
@group(0) @binding(0) var<storage,read> image:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> output:array<u32>;
@group(0) @binding(2) var<uniform> p:vec4u;
fn rgb(i:u32)->vec3f {let v=image[i];return clamp(select(v.rgb*v.a,v.rgb,p.z==1u),vec3f(0.),vec3f(1.));}
fn byte(i:u32)->u32{
 let pixels=p.x*p.y;
 if(p.w==0u){if(i>=pixels*4u){return 0u;}let c=i%4u;let v=image[i/4u];if(c==3u){return u32(round(clamp(v.a,0.,1.)*255.));}var color=v.rgb;if(p.z==1u){color=select(vec3f(0.),color/max(v.a,1e-30),v.a>0.);}return u32(round(clamp(color[c],0.,1.)*255.));}
 if(i<pixels){let v=rgb(i);return u32(round(16.+219.*dot(v,vec3f(.2126,.7152,.0722))));}
 if(i>=pixels*3u/2u){return 0u;}
 let n=i-pixels;let x=(n/2u)%(p.x/2u)*2u;let y=(n/p.x)*2u;
 let v=(rgb(y*p.x+x)+rgb(y*p.x+x+1u)+rgb((y+1u)*p.x+x)+rgb((y+1u)*p.x+x+1u))*.25;
 let l=dot(v,vec3f(.2126,.7152,.0722));
 return u32(round(128.+224.*select((v.b-l)/1.8556,(v.r-l)/1.5748,n%2u==1u)));
}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g:vec3u,@builtin(num_workgroups) groups:vec3u){
 let word=g.x+g.y*groups.x*64u;
 let count=select(p.x*p.y*4u,p.x*p.y*3u/2u,p.w==1u);let i=word*4u;
 if(p.w==2u){let pixels=p.x*p.y;if(word>=pixels*4u){return;}let channel=word/pixels;let v=image[word%pixels];output[word]=bitcast<u32>(select(select(select(v.g,v.b,channel==1u),v.r,channel==2u),v.a,channel==3u));return;}
 if(i>=count){return;}output[word]=byte(i)|(byte(i+1u)<<8u)|(byte(i+2u)<<16u)|(byte(i+3u)<<24u);
}
"#;
