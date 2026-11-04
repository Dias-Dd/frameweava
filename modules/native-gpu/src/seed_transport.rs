//! Private v1 bulk-word transport; control and staging budgets are host policy.
//! Input is only the parent-owned stdin pipe. No pathname or OS handle import.
use crate::protocol::{Command, Request};
use serde::Deserialize;
use std::io::Read;

#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Seeds {version:u32,format:String,byte_length:u64,buffers:Vec<Binding>}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Binding {buffer:usize,words:u64,r#type:String}

/// Validate the entire descriptor before reserving memory or reading a body.
/// Word payloads stream in 64 KiB chunks into their typed, owner-local seeds.
pub fn read_request<R:Read>(header:&[u8],input:&mut R,seed_limit:Option<u64>)->Result<(Request,bool),String>{
 let mut envelope:serde_json::Value=serde_json::from_slice(header).map_err(|e|format!("E_NATIVE_PROTOCOL: {e}"))?;
 let seeds=envelope.as_object_mut().and_then(|o|o.remove("binarySeeds"));
 let mut request:Request=serde_json::from_value(envelope).map_err(|e|format!("E_NATIVE_PROTOCOL: {e}"))?;
 if let Command::PreviewAudioQueue{frames,pcm,..}=&mut request.command{
  let bytes=u64::from(*frames)*8;
  if seeds.is_some()||*frames==0||*frames>crate::preview_audio::MAX_BLOCK_FRAMES||bytes>seed_limit.unwrap_or(u64::MAX){
   return Err("E_PREVIEW_AUDIO_RANGE: invalid or oversized stereo PCM body".into());
  }
  pcm.resize(bytes as usize,0);
  input.read_exact(pcm).map_err(|e|format!("E_PREVIEW_AUDIO_TRUNCATED: {e}"))?;
  return Ok((request,true));
 }
 let Some(value)=seeds else{return Ok((request,false));};
 let manifest:Seeds=serde_json::from_value(value).map_err(|e|format!("E_NATIVE_SEED_PROTOCOL: {e}"))?;
 let program=match &mut request.command{
  Command::Init{program}|Command::Reconfigure{program,..}=>program,
  _=>return Err("E_NATIVE_SEED_PROTOCOL: binary words belong only to init/reconfigure".into()),
 };
 if program.version!=2||manifest.version!=1||manifest.format!="words32-le"||manifest.buffers.is_empty(){
  return Err("E_NATIVE_SEED_PROTOCOL: expected bounded native-2 binary seeds v1".into());
 }
 program.validate()?;
 let mut seen=std::collections::HashSet::new();let mut bytes=0u64;
 for binding in &manifest.buffers{
  let d=program.data.get(binding.buffer).ok_or("E_NATIVE_SEED_PROTOCOL: unknown typed buffer")?;
  if !seen.insert(binding.buffer)||binding.words==0||binding.words>d.length||binding.r#type!=d.r#type||!d.initial.is_empty()||d.source_image.is_some()||d.source_resource.is_some(){
   return Err("E_NATIVE_SEED_PROTOCOL: duplicate, mismatched or conflicting typed seed binding".into());
  }
  bytes=bytes.checked_add(binding.words.checked_mul(4).ok_or("E_NATIVE_SEED_BUDGET: seed length overflow")?).ok_or("E_NATIVE_SEED_BUDGET: total overflow")?;
 }
 if bytes!=manifest.byte_length||bytes>seed_limit.unwrap_or(program.max_bytes)||bytes>program.max_bytes{
  return Err("E_NATIVE_SEED_BUDGET: binary body differs from its bound or exceeds the configured transport/program budget".into());
 }
 for binding in manifest.buffers{
  let d=&mut program.data[binding.buffer];
  d.initial.try_reserve_exact(binding.words as usize).map_err(|_|"E_NATIVE_SEED_BUDGET: cannot reserve bounded seed storage")?;
  let mut remaining=binding.words;let mut chunk=[0u8;64*1024];
  while remaining>0{
   let words=remaining.min((chunk.len()/4)as u64)as usize;
   input.read_exact(&mut chunk[..words*4]).map_err(|e|format!("E_NATIVE_SEED_TRUNCATED: incomplete binary seed body: {e}"))?;
   d.initial.extend(chunk[..words*4].chunks_exact(4).map(|b|u32::from_le_bytes([b[0],b[1],b[2],b[3]])));
   remaining-=words as u64;
  }
 }
 // The original full GPU admission is still authoritative, including mutable
 // seed accounting, actual device limits, state and image-view constraints.
 program.validate()?;
 Ok((request,true))
}
