# Contextual line adapter

Frameweave Apache-2.0 wrapper. Adopts the existing worktree multiline experiment;
no translation or replacement of the original Unicode algorithms.

`src/original-analysis.rs` is the exact original Frameweave itemizer adapter
`rust/text-analysis/src/analysis.rs`, SHA256
`1d26e04b045d182f497b02d40412c27da8adc04da7fbde0e97d5077e4db162a4`.
`analysis.rs::analyze_line` calls upstream paragraph analysis then original L1/L2
visual-runs on the requested range, preserving earlier embeddings/isolates.
It rejects scalar, grapheme and paragraph splits; all output offsets are local
UTF16 and the existing TypeScript adapter restores original-source positions.

| Crate | Fixed upstream commit | License |
| --- | --- | --- |
| unicode-bidi0.3.18 | 580b9c6c68fdb689916017e61d5052be3ed349b5 | MIT OR Apache-2.0 |
| unicode-script0.5.7 | 90bd26b53764c3f36b16f545a299792db31a650f | MIT OR Apache-2.0 |
| unicode-segmentation1.12.0 | 9e3f88c06ca275294ef4cb1daf0789f06a28611d | MIT OR Apache-2.0 |

Original licences/authors/Unicode rights are under licenses.
Cargo.lock is exact; wasm-bindgen0.2.129 and transitive dependencies are inventoried
by the existing official Kit build. Preserve its full generated licenses tree,
especially unicode-ident's (MIT OR Apache-2.0) AND Unicode-3.0 obligations,
when Main prepares a formal package. Supplemental licenses do not replace them.
No download, plugin lock, SDK pin, WASM permission, P4 ABI or safety policy change.

Build reproduction: validation/build-text-lines.mjs, by default locked/offline.
The private fixture identity test.pa3-text-lines is not a releasable package or
public capability. Main owns formal identity/factory/permissions/version.
