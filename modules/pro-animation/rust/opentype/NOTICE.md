# OpenType data adapter

Frameweave adapter: Apache-2.0. `src/original-shaper.rs` is the unchanged prior
shaping adapter; `src/original-font-metadata.rs` is the unchanged prior metadata
adapter, including the same original shaper. SHA checks are enforced at build and
in the test loader. One Engine/font/Kit client owns all queries and shaping.

Unchanged runtime algorithms:
- HarfRust0.15.0, MIT, commit71d965130ea93905f81b8f03a03d7ecc794fbc47.
- Skrifa0.49.0 and read-fonts0.46.0, MIT OR Apache-2.0,
  commit47a301615fd95acf0da9fb7dbcd0ea7c7df36943.
- Exact existing font-metadata/shaping Cargo.lock; no new dependency or patch.

Preserve existing `rust/shaping/licenses`, including the full SHAPING-NOTICE,
and the official Kit-generated complete licenses/dependency inventory in a formal
distribution. This notice is supplemental, not a substitute. unicode-ident also
has Unicode-3.0 obligations. Provenance/dependencies.json contains the original
locked checksums and SPDX expressions for all27 dependencies.

No P4 ABI, permission, trust, registry, model/font distribution or Native-host WASM
policy change. The private test carrier is not a published module capability.
Actual images reuse original Native GPU glyph/Stroke/Glow/Layer code and licenses.
Original Noto files stay unmodified/OFL1.1. FontTools4.68/MIT is TEST ONLY. Original
synthetic edge-case fonts/adapter code are Apache-2.0, no proprietary font copying.
