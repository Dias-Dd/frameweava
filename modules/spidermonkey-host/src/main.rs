mod engine;
mod sandbox;
use std::io::{self,Read,Write};

pub fn budget_arg(flag:&str,default:usize)->Result<usize,String>{let args=std::env::args().collect::<Vec<_>>();if let Some(i)=args.iter().position(|a|a==flag){let n=args.get(i+1).ok_or("Missing byte budget")?.parse::<usize>().map_err(|_|"Invalid byte budget")?;if n==0{return Err("Positive byte budget required".into());}Ok(n)}else{Ok(default)}}

fn worker()->Result<(),String>{
    sandbox::require_container()?;
    let args:Vec<String>=std::env::args().collect();if let Some(i)=args.iter().position(|s|s=="--probe"){let file=args.get(i+1).ok_or("Missing canary file")?;let port=args.get(i+2).ok_or("Missing canary port")?.parse::<u16>().map_err(|_|"Invalid port")?;println!("{}",sandbox::probe(file,port)?);return Ok(());}
    let max_bytes=budget_arg("--message-bytes",64*1024*1024)?;if max_bytes>u32::MAX as usize{return Err("Message budget exceeds u32 framing".into());}engine::set_byte_budget(max_bytes);
    let mut host=engine::Host::new()?;
    let input=io::stdin();let mut input=input.lock();let output=io::stdout();let mut output=output.lock();
    loop{
        let mut header=[0;4];match input.read_exact(&mut header){Ok(())=>{},Err(e)if e.kind()==io::ErrorKind::UnexpectedEof=>break,Err(e)=>return Err(e.to_string())}
        let size=u32::from_le_bytes(header) as usize;if size==0||size>max_bytes{return Err("Invalid request length".into());}
        let mut bytes=vec![0;size];input.read_exact(&mut bytes).map_err(|e|e.to_string())?;
        if bytes[0]==255{host.set_input(bytes[1..].to_vec());host.eval("void __fw_receive();","frameweave-dispatch.js")?;}else{
        let request:serde_json::Value=serde_json::from_slice(&bytes).map_err(|e|e.to_string())?;
        let source=request.get("source").and_then(|v|v.as_str()).ok_or("Expected sealed source")?;host.eval(source,"frameweave-host.js")?;
        if request.get("gc").and_then(|v|v.as_bool())==Some(true){host.gc();}}
        let response=host.take_response().ok_or("No reply after draining microtasks; pending external work is not admitted")?;
        output.write_all(&(response.len() as u32).to_le_bytes()).map_err(|e|e.to_string())?;
        output.write_all(&response).map_err(|e|e.to_string())?;output.flush().map_err(|e|e.to_string())?;
    }Ok(())
}
fn main(){let args:Vec<String>=std::env::args().collect();if args.len()==3&&args[1]=="--cleanup"{let pid=args[2].parse::<u32>().expect("Expected broker PID");sandbox::cleanup(pid);return;}let result=if std::env::args().any(|s|s=="--worker"){worker().map(|_|0)}else{sandbox::launch()};match result{Ok(code)=>std::process::exit(code),Err(e)=>{eprintln!("E_SPIDERMONKEY_HOST: {e}");std::process::exit(1);}}}
