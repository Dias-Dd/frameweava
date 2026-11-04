# Source and build provenance

The user supplied the Gemini Servo GPU-resident experiment. Its source changes
were copied into this worktree, audited against the existing Cargo cache and
adapted; its original source/build/output directories were not modified.

`native/upstream.json` freezes versions, upstream source bytes, patch bytes and
the local development binary inputs. The complete reviewed source delta is
`native/patches/servo-gpu-frame-v1.patch`; original MPL notices are retained.

- Servo 0.7.0: upstream commit
  `aac43a3f31a259f04a574f5ec4e959c943ad7cc7`, MPL-2.0.
- WebRender: upstream commit
  `d399b904fdce7bab553fb6514204790155a7fb07`, MPL-2.0.
- Stylo 0.22.0: source/VCS identity in `native/upstream.json`, MPL-2.0.
- Mozjs 0.26.4 / mozjs_sys 153.3.0-1: pinned in `native/Cargo.lock`.
  This development build uses copied user-supplied static link inputs, packaged
  into an explicitly hashed local archive. It is **not an independent
  SpiderMonkey source rebuild or binary redistribution qualification**.
- ANGLE `libEGL.dll` / `libGLESv2.dll`: copied supplied binaries, exact byte
  identities recorded. Their matching source/build recipe and full binary
  notices remain unqualified. Public redistribution is not authorized by a
  matching hash or by this development build flag.
- The C++ adapter derives from the supplied interop prototype. Native gradient,
  blur/grade and readback test implementations were removed; Frameweave's
  existing GPU effects provide the actual media operations.

The Servo dependency graph, including SVG rasterization via resvg/tiny-skia,
is pinned by the Cargo lock. SVG content may be rasterized on CPU internally;
external Surface residency does not imply every internal browser operation is
GPU compute. A release must collect dependency-specific notices and any
required source offers for the actual distributed build.

MPL text is included in `native/LICENSE-MPL-2.0` from
[Mozilla](https://www.mozilla.org/en-US/MPL/2.0/). ANGLE resource import was
checked against its
[D3D texture extension](https://chromium.googlesource.com/angle/angle/+/main/extensions/EGL_ANGLE_d3d_texture_client_buffer.txt)
and
[D3D11 implementation](https://chromium.googlesource.com/angle/angle/+/main/src/libANGLE/renderer/d3d/d3d11/SwapChain11.cpp).
Only reviewed local development is claimed. No third-party binary is checked
into this source delivery.
