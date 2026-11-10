# Structured exception replies

The existing binary reply keeps `{id,error:{code,message,details}}`, with optional
finite `frame` and string `hint`. The authorized transport Stage ID always wins
over authored error metadata. `frame:0` and `hint:''` are valid.

Explicit transferable `details` retains its data, including null, false, zero,
empty strings, arrays, objects and the codec's owned byte arrays. An absent or
undefined details value keeps the legacy native-stack string fallback. Existing
`details.cause` data is untouched; no independent cause wire field is introduced.
Primary-ray modules rethrow original exceptions instead of reclassifying permission,
budget or cancellation errors. Ordinary errors retain the existing Stage category.

Descriptor-only copying avoids authored property/index accessors. Cycles,
opaque/nonfinite data, inspection failures and oversized diagnostics fall back
to a marked stack/string diagnostic. The existing codec and configured transport
byte budget remain authoritative. When an entire diagnostic cannot fit, a compact
fallback keeps the original code when it fits. This is error-path handling only;
successful result encoding, isolation and Native host binaries are unchanged.
The error-only byte limit is supplied as an esbuild constant from the already
validated transport option, so it does not introduce a second capacity policy.

`tests/spidermonkey-errors.test.ts` exercises real SpiderMonkey → binary transport
→ EngineError replies and continued calls after failed serialization. The Native
primary-ray tests additionally exercise a structured hook error through Renderer.
Local qualification is Windows x64/AppContainer; other OS paths need their own
runtime acceptance.
