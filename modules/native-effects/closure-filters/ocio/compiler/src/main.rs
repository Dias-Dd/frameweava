//! Offline, fixed-operation source translation only. No GPU/device/renderer.
use std::io::{self, Read};
fn translate() -> Result<serde_json::Value, String> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).map_err(|e|e.to_string())?;
    let request:serde_json::Value=serde_json::from_str(&input).map_err(|e|e.to_string())?;
    if let Some(wgsl)=request["validateWgsl"].as_str(){let module=naga::front::wgsl::parse_str(wgsl).map_err(|e|e.emit_to_string(wgsl))?;naga::valid::Validator::new(naga::valid::ValidationFlags::all(),naga::valid::Capabilities::all()).validate(&module).map_err(|e|format!("{e:?}"))?;return Ok(serde_json::json!({"valid":true}));}
    let glsl=request["glsl"].as_str().ok_or("Expected glsl source")?;
    let mut frontend=naga::front::glsl::Frontend::default();
    let mut module=frontend.parse(&naga::front::glsl::Options::from(naga::ShaderStage::Compute),glsl).map_err(|e|e.emit_to_string(glsl))?;
    // Keep OCIO helper functions, remove only the synthetic compute entry.
    module.entry_points.clear();
    let info=naga::valid::Validator::new(naga::valid::ValidationFlags::all(),naga::valid::Capabilities::all()).validate(&module).map_err(|e|format!("{e:?}"))?;
    let wgsl=naga::back::wgsl::write_string(&module,&info,naga::back::wgsl::WriterFlags::EXPLICIT_TYPES).map_err(|e|e.to_string())?;
    // Query Naga's own typed WGSL spans. This is a bounded preparation hook,
    // not an alternate parser/compiler or a string guess about vector widths.
    let parsed=naga::front::wgsl::parse_str(&wgsl).map_err(|e|e.emit_to_string(&wgsl))?;
    let typed=naga::valid::Validator::new(naga::valid::ValidationFlags::all(),naga::valid::Capabilities::all()).validate(&parsed).map_err(|e|e.to_string())?;
    let mut calls=Vec::new();let mut matrices=Vec::new();let mut binary=Vec::new();
    for (fh,f) in parsed.functions.iter(){for (eh,e) in f.expressions.iter(){
        if let naga::Expression::Binary{op:naga::BinaryOperator::Multiply,left,right}=e{
            if let (naga::TypeInner::Matrix{columns,rows,..},naga::TypeInner::Vector{size,..})=(typed[fh][*left].ty.inner_with(&parsed.types),typed[fh][*right].ty.inner_with(&parsed.types)){
                if columns!=size{return Err("Matrix/vector dimension mismatch".into());}
                let a=f.expressions.get_span(*left).to_range().ok_or("Matrix left span")?;let b=f.expressions.get_span(eh).to_range().ok_or("Matrix operation span")?;
                let between=&wgsl[a.end..];let op=a.end+between.find('*').ok_or("Matrix multiply token")?;
                matrices.push(serde_json::json!({"left":a.start,"operator":op,"end":b.end,"columns":*columns as u8,"rows":*rows as u8}));
            }
        }
        if let naga::Expression::Binary{op,left,right}=e{
            let name=match op{naga::BinaryOperator::Add=>"add",naga::BinaryOperator::Subtract=>"sub",naga::BinaryOperator::Multiply=>"mul",naga::BinaryOperator::Divide=>"div",_=>""};
            let lanes=|h:naga::Handle<naga::Expression>|match typed[fh][h].ty.inner_with(&parsed.types){naga::TypeInner::Scalar(naga::Scalar{kind:naga::ScalarKind::Float,..})=>Some(1),naga::TypeInner::Vector{size,scalar:naga::Scalar{kind:naga::ScalarKind::Float,..}}=>Some(*size as u8),_=>None};
            if !name.is_empty(){if let (Some(a),Some(b),Some(c))=(lanes(*left),lanes(*right),lanes(eh)){
                let span=f.expressions.get_span(eh).to_range().ok_or("Binary float span")?;
                binary.push(serde_json::json!({"start":span.start,"end":span.end,"name":name,"a":a,"b":b,"c":c}));
            }}
        }
        if let naga::Expression::Math{fun,arg,..}=e{
            use naga::MathFunction as M;
            let name=match fun{M::Pow=>"pow",M::Log=>"log",M::Log2=>"log2",M::Exp=>"exp",M::Exp2=>"exp2",M::Sqrt=>"sqrt",M::Atan=>"atan",M::Atan2=>"atan2",M::Sin=>"sin",M::Cos=>"cos",M::Dot=>"dot",M::Mix=>"mix",_=>continue};
            let result=if *fun==M::Dot{*arg}else{eh};let lanes=match typed[fh][result].ty.inner_with(&parsed.types){naga::TypeInner::Scalar(_)=>1,naga::TypeInner::Vector{size,..}=>*size as u8,_=>return Err("Unexpected transcendental result type".into())};
            let range=f.expressions.get_span(eh).to_range().ok_or("Missing typed math span")?;
            if wgsl[range.clone()]!=*name && !wgsl[range.clone()].starts_with(&format!("{}(",name)){return Err(format!("Unexpected typed {} span: {}",name,&wgsl[range]));}
            calls.push(serde_json::json!({"start":range.start,"name":name,"lanes":lanes}));
        }
    }}
    Ok(serde_json::json!({"wgsl":wgsl,"mathCalls":calls,"matrices":matrices,"binary":binary}))
}
fn main(){match translate(){Ok(result)=>println!("{}",result),Err(e)=>{eprintln!("{}",serde_json::json!({"code":"E_NATIVE_OCIO_TRANSLATE","message":e}));std::process::exit(1);}}}
