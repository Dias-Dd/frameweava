/* This Source Code Form is subject to the Mozilla Public License, v. 2.0.
 * JSAPI embedding follows the pinned servo/mozjs minimal/typedarray examples.
 * JobQueue glue was identified by the user-provided Gemini PoC. No GPU code. */
use ::std::{collections::BTreeMap,cell::{Cell,RefCell},ffi::CString,ptr};
use mozjs::{rooted,typedarray};
use mozjs::jsapi::{JSContext,JSObject,Value,CallArgs,MutableHandle,JS_NewGlobalObject,OnNewGlobalHookOption,JSAutoRealm,JS_DefineFunction,ToStringSlow,JS_StructuredClone,JS_IsExceptionPending,JS_GetPendingException,JS_ClearPendingException,GenericMicroTask,IsJSMicroTask,ToMaybeWrappedJSMicroTask,RunJSMicroTask,SetJobQueue,JS_GC,GCReason,CurrentGlobalOrNull,HandleObject,SetPromiseRejectionTrackerCallback,PromiseRejectionHandlingState,GetPromiseID,JS_NewUCStringCopyN};
use mozjs::jsval::{UndefinedValue,ObjectValue,StringValue};
use mozjs::rust::{JSEngine,Runtime,RealmOptions,SIMPLE_GLOBAL_CLASS,RootedObjectVectorWrapper,CompileOptionsWrapper,evaluate_script};
use mozjs::rust::wrappers2::{HasAnyMicroTasks,JS_DequeueNextMicroTask,JobQueueIsEmpty};
use mozjs::glue::{CreateJobQueue,DeleteJobQueue,JobQueueTraps,RustJobQueue,JS_GetPromiseResult};
use mozjs::typedarray::{Uint8Array,CreateWith};
use sha2::{Digest,Sha256};

thread_local!{static RESPONSE:RefCell<Option<Vec<u8>>>=const{RefCell::new(None)};static INPUT:RefCell<Option<Vec<u8>>>=const{RefCell::new(None)};static REJECTIONS:RefCell<BTreeMap<u64,String>>=const{RefCell::new(BTreeMap::new())};}
thread_local!{static BYTE_BUDGET:Cell<usize>=const{Cell::new(64*1024*1024)};}
pub fn set_byte_budget(bytes:usize){BYTE_BUDGET.with(|b|b.set(bytes));}
fn byte_budget()->usize{BYTE_BUDGET.with(Cell::get)}
unsafe extern "C" fn data_trap(_: *mut JSContext,_:MutableHandle<*mut JSObject>,_:MutableHandle<*mut JSObject>)->bool{true}
unsafe extern "C" fn global_trap(cx:*mut JSContext, out:MutableHandle<*mut JSObject>)->bool{out.set(unsafe{CurrentGlobalOrNull(cx)});true}
unsafe extern "C" fn jobs_trap(_: *mut JSContext){}
static TRAPS:JobQueueTraps=JobQueueTraps{getHostDefinedData:Some(data_trap),getHostDefinedGlobal:Some(global_trap),runJobs:Some(jobs_trap),traceNonGCThingMicroTask:None};

unsafe fn text(cx:*mut JSContext,value:Value)->Result<String,String>{
    rooted!(in(cx) let v=value);
    rooted!(in(cx) let s=unsafe{ToStringSlow(cx,v.handle().into())});
    let raw=::std::ptr::NonNull::new(s.get()).ok_or("Cannot stringify value")?;
    let context=unsafe{mozjs::context::JSContext::from_ptr(::std::ptr::NonNull::new(cx as *mut _).unwrap())};
    Ok(unsafe{mozjs::conversions::jsstr_to_string(&context,raw)})
}
unsafe extern "C" fn emit(cx:*mut JSContext,n:u32,vp:*mut Value)->bool{
    let a=unsafe{CallArgs::from_vp(vp,n)};
    if n!=1 || !a.get(0).is_object(){return false;}
    typedarray!(in(cx) let view:Uint8Array=a.get(0).to_object());
    let Ok(view)=view else{return false;};
    if view.len()>byte_budget(){return false;}
    let Some(bytes)=view.to_vec() else{return false;};
    let ok=RESPONSE.with(|r|{let mut r=r.borrow_mut();if r.is_some(){false}else{*r=Some(bytes);true}});
    a.rval().set(UndefinedValue());ok
}
unsafe extern "C" fn hash(cx:*mut JSContext,n:u32,vp:*mut Value)->bool{
    let a=unsafe{CallArgs::from_vp(vp,n)};if n!=1||!a.get(0).is_object(){return false;}
    typedarray!(in(cx) let view:Uint8Array=a.get(0).to_object());let Ok(view)=view else{return false;};
    if view.len()>byte_budget(){return false;}let Some(bytes)=view.to_vec() else{return false;};
    let digest=Sha256::digest(bytes);
    let mut context=unsafe{mozjs::context::JSContext::from_ptr(::std::ptr::NonNull::new(cx as *mut _).unwrap())};
    rooted!(in(cx) let mut out=ptr::null_mut::<JSObject>());
    if unsafe{Uint8Array::create(&mut context,CreateWith::Slice(digest.as_slice()),out.handle_mut())}.is_err(){return false;}
    a.rval().set(ObjectValue(out.get()));true
}
unsafe extern "C" fn encode(cx:*mut JSContext,n:u32,vp:*mut Value)->bool{
    let a=unsafe{CallArgs::from_vp(vp,n)};if n!=1{return false;}
    let Ok(s)=(unsafe{text(cx,a.get(0).get())}) else{return false;};if s.len()>byte_budget(){return false;}
    let mut context=unsafe{mozjs::context::JSContext::from_ptr(::std::ptr::NonNull::new(cx as *mut _).unwrap())};
    rooted!(in(cx) let mut out=ptr::null_mut::<JSObject>());
    if unsafe{Uint8Array::create(&mut context,CreateWith::Slice(s.as_bytes()),out.handle_mut())}.is_err(){return false;}
    a.rval().set(ObjectValue(out.get()));true
}
unsafe extern "C" fn read_input(cx:*mut JSContext,n:u32,vp:*mut Value)->bool{
 let args=unsafe{CallArgs::from_vp(vp,n)};let Some(bytes)=INPUT.with(|r|r.borrow_mut().take()) else{return false;};
 let mut context=unsafe{mozjs::context::JSContext::from_ptr(::std::ptr::NonNull::new(cx as *mut _).unwrap())};rooted!(in(cx) let mut out=ptr::null_mut::<JSObject>());
 if unsafe{Uint8Array::create(&mut context,CreateWith::Slice(&bytes),out.handle_mut())}.is_err(){return false;}args.rval().set(ObjectValue(out.get()));true
}
unsafe fn decode_error(cx:*mut JSContext,message:&std::ffi::CStr)->bool{
 if !unsafe{JS_IsExceptionPending(cx)}{
  let mut context=unsafe{mozjs::context::JSContext::from_ptr(::std::ptr::NonNull::new(cx as *mut _).unwrap())};
  mozjs::error::throw_type_error(&mut context,message);
 }
 false
}
unsafe extern "C" fn decode_utf8(cx:*mut JSContext,n:u32,vp:*mut Value)->bool{
 let args=unsafe{CallArgs::from_vp(vp,n)};
 if !(n==1||n==2)||!args.get(0).is_object()||n==2&&!args.get(1).is_boolean(){return unsafe{decode_error(cx,c"Expected UTF-8 bytes and optional fatal boolean")};}
 typedarray!(in(cx) let view:Uint8Array=args.get(0).to_object());let Ok(view)=view else{return unsafe{decode_error(cx,c"Expected a Uint8Array")};};
 if view.len()>byte_budget(){return unsafe{decode_error(cx,c"UTF-8 input exceeds the existing host byte budget")};}
 let Some(bytes)=view.to_vec() else{return unsafe{decode_error(cx,c"Cannot read UTF-8 input")};};
 let fatal=n==1||args.get(1).to_boolean();
 let text=if fatal{match ::std::str::from_utf8(&bytes){Ok(value)=>std::borrow::Cow::Borrowed(value),Err(_)=>return unsafe{decode_error(cx,c"The encoded data is not valid UTF-8")}}}else{String::from_utf8_lossy(&bytes)};
 let text:Vec<u16>=text.encode_utf16().collect();
 rooted!(in(cx) let out=unsafe{JS_NewUCStringCopyN(cx,text.as_ptr(),text.len())});if out.get().is_null(){return false;}args.rval().set(unsafe{StringValue(&*out.get())});true
}
unsafe extern "C" fn clone_value(cx:*mut JSContext,n:u32,vp:*mut Value)->bool{
    let a=unsafe{CallArgs::from_vp(vp,n)};if n!=1{return false;}
    rooted!(in(cx) let mut out=UndefinedValue());
    if !unsafe{JS_StructuredClone(cx,a.get(0),out.handle_mut().into(),ptr::null(),ptr::null_mut())}{return false;}
    a.rval().set(out.get());true
}
unsafe extern "C" fn log(cx:*mut JSContext,n:u32,vp:*mut Value)->bool{
 let args=unsafe{CallArgs::from_vp(vp,n)};if n!=1{return false;}
 let Ok(value)=(unsafe{text(cx,args.get(0).get())}) else{return false;};
 eprintln!("JS: {}",value.chars().take(4096).collect::<String>());args.rval().set(UndefinedValue());true
}

unsafe extern "C" fn rejection(cx:*mut JSContext,_muted:bool,promise:HandleObject,state:PromiseRejectionHandlingState,_data:*mut ::std::ffi::c_void){
 let id=unsafe{GetPromiseID(promise)};
 if matches!(state,PromiseRejectionHandlingState::Handled){REJECTIONS.with(|m|m.borrow_mut().remove(&id));return;}
 rooted!(in(cx) let mut result=UndefinedValue());unsafe{JS_GetPromiseResult(promise,result.handle_mut().into());}
 let message=unsafe{text(cx,result.get())}.unwrap_or("Unhandled Promise rejection".into());REJECTIONS.with(|m|{m.borrow_mut().insert(id,message);});
}
pub struct Host{_roots:RootedObjectVectorWrapper,global:*mut JSObject,queue:*mut RustJobQueue,runtime:Runtime,_engine:JSEngine}
impl Host{
    pub fn new()->Result<Self,String>{
        let engine=JSEngine::init().map_err(|_|"SpiderMonkey initialization failed")?;
        let mut runtime=Runtime::new(engine.handle());let cx=runtime.cx();let raw=unsafe{cx.raw_cx()};
        let queue=unsafe{CreateJobQueue(&TRAPS)};if queue.is_null(){return Err("Job queue allocation failed".into());}
        unsafe{SetJobQueue(raw,queue as *mut _);SetPromiseRejectionTrackerCallback(raw,Some(rejection),ptr::null_mut());}
        let options=RealmOptions::default();
        rooted!(in(raw) let global=unsafe{JS_NewGlobalObject(raw,&SIMPLE_GLOBAL_CLASS,ptr::null_mut(),OnNewGlobalHookOption::FireOnNewGlobalHook,&*options)});
        if global.get().is_null(){return Err("Global allocation failed".into());}
        let roots=RootedObjectVectorWrapper::new(cx);roots.append(global.get());
        unsafe{let _realm=JSAutoRealm::new(raw,global.get());
            for (name,fun) in [("__fw_emit",emit as unsafe extern "C" fn(*mut JSContext,u32,*mut Value)->bool),("__fw_hash",hash),("__fw_utf8",encode),("__fw_decode",decode_utf8),("__fw_input",read_input),("__fw_log",log),("structuredClone",clone_value)]{
                let name=CString::new(name).unwrap();if JS_DefineFunction(raw,global.handle().into(),name.as_ptr(),Some(fun),1,0).is_null(){return Err("Native function registration failed".into());}
            }
        }
        let object=global.get();drop(global);
        Ok(Self{_roots:roots,global:object,queue,runtime,_engine:engine})
    }
    pub fn eval(&mut self,source:&str,file:&str)->Result<(),String>{
        let cx=self.runtime.cx();let raw=unsafe{cx.raw_cx()};
        unsafe{let _realm=JSAutoRealm::new(raw,self.global);rooted!(in(raw) let global=self.global);rooted!(in(raw) let mut out=UndefinedValue());
            let options=CompileOptionsWrapper::new(cx,CString::new(file).map_err(|_|"Invalid filename")?,1);
            if evaluate_script(cx,global.handle(),source,out.handle_mut(),options).is_err(){return Err(Self::exception(raw));}
            rooted!(&in(cx) let mut task:GenericMicroTask);

            while HasAnyMicroTasks(cx){
                JS_DequeueNextMicroTask(cx,task.handle_mut());if !HasAnyMicroTasks(cx){JobQueueIsEmpty(cx);}
                if IsJSMicroTask(task.as_ptr()){let object=ToMaybeWrappedJSMicroTask(task.as_ptr());if !object.is_null(){rooted!(&in(cx) let object=object);RunJSMicroTask(raw,object.handle().into());}}
                if JS_IsExceptionPending(raw){return Err(Self::exception(raw));}
            }
        }if let Some(error)=REJECTIONS.with(|m|m.borrow().values().next().cloned()){return Err(format!("E_SPIDERMONKEY_UNHANDLED_REJECTION: {error}"));}Ok(())
    }
    unsafe fn exception(cx:*mut JSContext)->String{rooted!(in(cx) let mut out=UndefinedValue());unsafe{if JS_GetPendingException(cx,out.handle_mut().into()){JS_ClearPendingException(cx);return text(cx,out.get()).unwrap_or("JavaScript exception".into());}}"JavaScript evaluation failed".into()}
    pub fn set_input(&self,bytes:Vec<u8>){INPUT.with(|r|*r.borrow_mut()=Some(bytes));}
    pub fn gc(&mut self){unsafe{JS_GC(self.runtime.cx().raw_cx(),GCReason::API);}}
    pub fn take_response(&self)->Option<Vec<u8>>{RESPONSE.with(|r|r.borrow_mut().take())}
}
impl Drop for Host{fn drop(&mut self){unsafe{SetJobQueue(self.runtime.cx().raw_cx(),ptr::null_mut());DeleteJobQueue(self.queue);}}}
