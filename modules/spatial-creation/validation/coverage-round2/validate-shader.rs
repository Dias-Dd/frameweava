// Developer-only diagnostic; links the already built, pinned Naga 30.0.1.
fn main() {
    let file = std::env::args().nth(1).expect("shader.wgsl");
    let source = std::fs::read_to_string(file).unwrap();
    match naga::front::wgsl::parse_str(&source) {
        Ok(_) => println!("Naga WGSL parse passed"),
        Err(error) => {
            eprintln!("{}", error.emit_to_string(&source));
            std::process::exit(1);
        }
    }
}
