# Original kurbo data query transport

Use existing rust/curve-metrics licences and provenance/curve-geometry SOURCE.json
and NOTICE. Cargo.toml/Cargo.lock are exact parent curve-metrics copies, not a lock
bypass or new dependency. src/original-curve.rs preserves the original own adapter
byte-for-byte. src/curve-base.rs only adds result storage/init/reset; original
sampling bodies and all upstream kurbo algorithms remain unchanged. New query
methods in src/lib.rs use one owned Engine, not a second reader/runtime.
Initial SOURCE-DEVELOPMENT.json is an authoring receipt; actual current build and
verification are in docs/pro-animation/curve-geometry-validation/checkpoint.json.
