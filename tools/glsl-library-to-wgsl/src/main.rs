// Build-time shader translation, not an execution host, device or runtime API.
use std::{env, fs};
fn exits(block: &naga::Block) -> bool {
    match block.last() {
        Some(naga::Statement::Break | naga::Statement::Return { .. } | naga::Statement::Kill) => true,
        Some(naga::Statement::Block(body)) => exits(body),
        Some(naga::Statement::If { accept, reject, .. }) => exits(accept) && exits(reject),
        _ => false,
    }
}
fn grouped_cases(block: &mut naga::Block) -> Result<(), String> {
    for statement in block.iter_mut() {
        match statement {
            naga::Statement::Block(body) => grouped_cases(body)?,
            naga::Statement::If { accept, reject, .. } => { grouped_cases(accept)?; grouped_cases(reject)?; }
            naga::Statement::Loop { body, continuing, .. } => { grouped_cases(body)?; grouped_cases(continuing)?; }
            naga::Statement::Switch { cases, .. } => {
                for case in cases.iter_mut() { grouped_cases(&mut case.body)?; }
                for i in (0..cases.len()).rev() {
                    if !cases[i].fall_through { continue; }
                    if exits(&cases[i].body) { cases[i].fall_through = false; continue; }
                    if i + 1 == cases.len() { cases[i].fall_through = false; continue; }
                    if !cases[i].body.is_empty() { return Err(format!("Active fallthrough must be lowered before IR: {:?}", cases[i].body.last())); }
                    cases[i].body = cases[i + 1].body.clone();
                    cases[i].fall_through = false;
                }
            }
            _ => {}
        }
    }
    Ok(())
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 { return Err("usage: glsl-library-to-wgsl input.glsl output.wgsl".into()); }
    let source = fs::read_to_string(&args[1])?;
    let glsl = format!("#version 450\n{}\nvoid main() {{}}\n", source);
    let mut module = naga::front::glsl::Frontend::default()
        .parse(&naga::front::glsl::Options::from(naga::ShaderStage::Fragment), &glsl)
        .map_err(|error| format!("GLSL translation failed: {error:?}"))?;
    // The input is a function library. No binding/IO/entry point is admitted
    // into PixelScope; its normal ABI remains responsible for all GPU entry IO.
    module.entry_points.clear();
    if !module.global_variables.is_empty() { return Err("Shader library cannot declare global resources".into()); }
    // WGSL has no fallthrough. Append the following case body on its actual
    // fallthrough path. Existing Break/Return still exit before appended code.
    for (_, function) in module.functions.iter_mut() { grouped_cases(&mut function.body)?; }
    let info = naga::valid::Validator::new(naga::valid::ValidationFlags::all(), naga::valid::Capabilities::all())
        .validate(&module).map_err(|error| format!("GLSL IR validation failed: {error:?}"))?;
    let output = naga::back::wgsl::write_string(&module, &info, naga::back::wgsl::WriterFlags::EXPLICIT_TYPES)?;
    fs::write(&args[2], output)?;
    Ok(())
}
