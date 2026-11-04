// SPDX-License-Identifier: Apache-2.0
//! Optional bytes-v1 binding shim. Application code lives in algorithm.rs.
use std::cell::RefCell;
use std::collections::BTreeMap;
mod algorithm;
thread_local! {
    static BUFFERS: RefCell<BTreeMap<u32, Box<[u8]>>> = RefCell::new(BTreeMap::new());
    static INITIALIZED: RefCell<bool> = const { RefCell::new(false) };
}
#[no_mangle]
pub extern "C" fn fw_abi_version() -> u32 { 1 }
#[no_mangle]
pub extern "C" fn fw_init() -> i32 {
    INITIALIZED.with(|state| { let mut state = state.borrow_mut(); if *state { -1 } else { *state = true; 0 } })
}
#[no_mangle]
pub extern "C" fn fw_alloc(length: u32) -> u32 {
    if !INITIALIZED.with(|s| *s.borrow()) || length == 0 || length > 16 * 1024 * 1024 { return 0; }
    let mut buffer = vec![0u8; length as usize].into_boxed_slice();
    let pointer = buffer.as_mut_ptr() as u32;
    BUFFERS.with(|buffers| { buffers.borrow_mut().insert(pointer, buffer); }); pointer
}
#[no_mangle]
pub extern "C" fn fw_free(pointer: u32) -> i32 {
    BUFFERS.with(|buffers| if buffers.borrow_mut().remove(&pointer).is_some() { 0 } else { -2 })
}
#[no_mangle]
pub extern "C" fn fw_call(op: u32, input: u32, length: u32, output: u32, capacity: u32) -> i32 {
    if !INITIALIZED.with(|s| *s.borrow()) { return -1; }
    BUFFERS.with(|buffers| {
        let mut buffers = buffers.borrow_mut();
        let bytes = if input == 0 && length == 0 { Vec::new() } else {
            let Some(data) = buffers.get(&input) else { return -2; };
            if data.len() != length as usize { return -2; } data.to_vec()
        };
        if input == output { return -2; }
        let Some(target) = buffers.get_mut(&output) else { return -2; };
        if target.len() != capacity as usize { return -2; }
        match algorithm::run(op, &bytes, target) { Ok(n) if n <= capacity as usize => n as i32, Ok(_) => -5, Err(code) => code }
    })
}
#[no_mangle]
pub extern "C" fn fw_buffer_count() -> u32 { BUFFERS.with(|buffers| buffers.borrow().len() as u32) }
#[no_mangle]
pub extern "C" fn fw_dispose() -> i32 {
    BUFFERS.with(|buffers| buffers.borrow_mut().clear()); INITIALIZED.with(|state| *state.borrow_mut() = false); 0
}
