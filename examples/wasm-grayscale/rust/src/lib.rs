//! Deterministic RGBA8 grayscale demo. Each WASM instance owns its buffers.
//! Integer luma weights sum to 256; alpha is preserved. No host imports or threads.
use std::cell::RefCell;
use std::collections::BTreeMap;

thread_local! {
    static BUFFERS: RefCell<BTreeMap<u32, Box<[u8]>>> = RefCell::new(BTreeMap::new());
}

#[no_mangle]
pub extern "C" fn fw_abi_version() -> u32 { 1 }

#[no_mangle]
pub extern "C" fn fw_alloc(length: u32) -> u32 {
    if length == 0 || length > 64 * 1024 * 1024 || length % 4 != 0 { return 0; }
    let mut buffer = vec![0u8; length as usize].into_boxed_slice();
    let pointer = buffer.as_mut_ptr() as u32;
    BUFFERS.with(|buffers| { buffers.borrow_mut().insert(pointer, buffer); });
    pointer
}

#[no_mangle]
pub extern "C" fn fw_grayscale(pointer: u32, length: u32) -> i32 {
    BUFFERS.with(|buffers| {
        let mut buffers = buffers.borrow_mut();
        let Some(buffer) = buffers.get_mut(&pointer) else { return -1; };
        if buffer.len() != length as usize { return -2; }
        for pixel in buffer.chunks_exact_mut(4) {
            let gray = ((77 * pixel[0] as u32 + 150 * pixel[1] as u32
                + 29 * pixel[2] as u32 + 128) >> 8) as u8;
            pixel[0] = gray; pixel[1] = gray; pixel[2] = gray;
        }
        0
    })
}

#[no_mangle]
pub extern "C" fn fw_checksum(pointer: u32) -> u32 {
    BUFFERS.with(|buffers| buffers.borrow().get(&pointer)
        .map(|buffer| buffer.iter().fold(0u32, |sum, value| sum.wrapping_add(*value as u32)))
        .unwrap_or(0))
}

#[no_mangle]
pub extern "C" fn fw_live_allocations() -> u32 {
    BUFFERS.with(|buffers| buffers.borrow().len() as u32)
}

#[no_mangle]
pub extern "C" fn fw_release(pointer: u32) -> u32 {
    BUFFERS.with(|buffers| u32::from(buffers.borrow_mut().remove(&pointer).is_some()))
}
