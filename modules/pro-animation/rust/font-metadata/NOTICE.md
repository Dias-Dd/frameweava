# Font metadata transport

Frameweave original adapter, Apache-2.0. src/original-shaper.rs is an exact byte
snapshot of existing rust/shaping/src/lib.rs. Tests/build receipts verify its
SHA and reject stale source. src/lib.rs only appends typed metadata queries;
one original Engine/font/client owns shaping and inspection together.

Original unchanged upstream:
- HarfRust0.15.0 / MIT / commit71d965130ea93905f81b8f03a03d7ecc794fbc47
- Skrifa0.49.0 / MIT OR Apache-2.0 /
  commit47a301615fd95acf0da9fb7dbcd0ea7c7df36943
- read-fonts/font-types and remaining transitive dependencies are the exact
  existing shaping Cargo.lock, with no new dependency or source patch.

Reuse original rust/shaping/licenses, including SHAPING-NOTICE and the full
official Kit generated licenses/dependency inventory when distributing the
new private carrier as a formal package. Supplemental direct notices do not
replace transitive obligations. unicode-ident's Unicode-3.0 obligations remain.
This crate does not declare a new P4 ABI, permission or font download mechanism.
The test.pa3-font-metadata private identity is not a public package capability.
