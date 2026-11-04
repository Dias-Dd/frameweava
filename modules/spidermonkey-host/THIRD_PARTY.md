# Fixed upstreams and distribution notes

- Mozilla/Servo `mozjs 0.26.13`, `mozjs_sys 153.6.0-1`, MPL-2.0.
  Source revision `6e69c1624194d7d678fb8f85830e9fd242c765a2` for sys;
  crate checksums are fixed in Cargo.lock. Static archive SHA-256 and official
  asset URL are in UPSTREAM.json; GitHub release digest was independently
  queried and equals the supplied Gemini PoC file's hash.
- Real root React **19.3.1**, `react-reconciler 0.34.0` and scheduler **0.28.0**,
  MIT; exact npm integrity in the root package-lock. Reconciler peer
  range is `^19.3.0`. `@types/react-reconciler 0.33.0`, MIT, build-time only.
- `windows-sys 0.61.2`, MIT/Apache-2.0; `sha2 0.10.9`, MIT/Apache-2.0;
  `serde_json 1.0.154`, MIT/Apache-2.0. All resolved Cargo packages, including
  build/platform-only crates, have version/license/repository records in
  `validation/cargo-licenses.json`. This metadata is not a binary SBOM.

Native JSAPI/rooting/job-queue code follows Mozilla's public examples and is
MPL-2.0 (`src/engine.rs`). The broker and adapter are independently authored
Apache-2.0. The user-provided Gemini PoC was used as read-only embedding evidence;
its React18 tree serializer, benchmarks, GPU runtime and renderer were not
imported. The existing Frameweave GPU implementation is reused unchanged.

License texts are in `licenses/`. Before binary distribution, provide the
corresponding MPL-covered Mozilla/Servo source (including any modifications),
source retrieval notice, bundled Mozilla/NSPR/ICU and linked dependency notices,
and build information for the exact shipped artifact. The Cargo license list
alone does not satisfy that work. No binary is published with this checkpoint.
MPL's source obligations are described by the
[official Mozilla FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

No GPL code was copied; alternatives such as `MIT OR Apache-2.0 OR LGPL` in the
inventory are not an instruction to select LGPL. Final installer/license
assembly is pending Main's distribution review.
