//! Operator policy, separate from device/ABI address limits. Absent overrides
//! inherit the owner's existing admission budgets, never a hidden module cap.
use std::sync::OnceLock;

#[derive(Default)]
struct Limits { config:Option<usize>, control:Option<usize>, instances:Option<usize>, pixels:Option<usize> }
static LIMITS:OnceLock<Result<Limits,String>>=OnceLock::new();
fn value(name:&str,text:Option<String>)->Result<Option<usize>,String>{
    text.map(|s|s.parse::<usize>().ok().filter(|n|*n>0).ok_or_else(||format!("E_SERVO_BUDGET: {name} must be a positive addressable integer"))).transpose()
}
fn limits()->Result<&'static Limits,String>{
    LIMITS.get_or_init(||Ok(Limits {
        config:value("FRAMEWEAVE_SERVO_MAX_CONFIG_BYTES",std::env::var("FRAMEWEAVE_SERVO_MAX_CONFIG_BYTES").ok())?,
        control:value("FRAMEWEAVE_SERVO_MAX_CONTROL_BYTES",std::env::var("FRAMEWEAVE_SERVO_MAX_CONTROL_BYTES").ok())?,
        instances:value("FRAMEWEAVE_SERVO_MAX_INSTANCES",std::env::var("FRAMEWEAVE_SERVO_MAX_INSTANCES").ok())?,
        pixels:value("FRAMEWEAVE_SERVO_MAX_PIXELS",std::env::var("FRAMEWEAVE_SERVO_MAX_PIXELS").ok())?,
    })).as_ref().map_err(Clone::clone)
}
fn check(limit:Option<usize>,actual:usize,name:&str)->Result<(),String>{
    if limit.is_some_and(|n|actual>n){Err(format!("E_SERVO_BUDGET: {name} exceeds configured operator budget"))}else{Ok(())}
}
pub fn config(bytes:usize)->Result<(),String>{check(limits()?.config,bytes,"configuration bytes")}
pub fn control(context:usize,parameters:usize)->Result<(),String>{
    check(limits()?.control,context.checked_add(parameters).ok_or("E_SERVO_ADDRESS: control length overflow")?,"frame control bytes")
}
pub fn page(width:u32,height:u32,current:usize)->Result<(),String>{
    let p=usize::try_from(u64::from(width)*u64::from(height)).map_err(|_|"E_SERVO_ADDRESS: dimensions exceed address space")?;
    check(limits()?.pixels,p,"pixels per instance")?;check(limits()?.instances,current.checked_add(1).ok_or("E_SERVO_ADDRESS: instance count overflow")?,"live instances")
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn absent_policy_has_no_historical_ceiling(){for n in [32769,2*1024*1024+1,16_777_217,usize::MAX]{assert!(check(None,n,"test").is_ok());}}
    #[test]fn configured_budgets_are_enforced(){assert!(check(Some(2),2,"test").is_ok());assert!(check(Some(2),3,"test").unwrap_err().starts_with("E_SERVO_BUDGET"));}
    #[test]fn policy_values_are_explicit_positive_integers(){assert_eq!(value("test",None).unwrap(),None);assert_eq!(value("test",Some("64".into())).unwrap(),Some(64));for s in ["0","-1","NaN",""]{assert!(value("test",Some(s.into())).is_err());}}
}
