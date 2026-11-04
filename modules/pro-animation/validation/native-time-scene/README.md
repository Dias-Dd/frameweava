# Editable native temporal scene

source.ts is a normal absolute-time procedural shot using a declared imported
linear HDR Resource. It transfers a fresh owner-local image per requested time.
project.tsx and half.tsx compare exact-time, Echo, shutter and wide-window
treatments in four existing Stages/Layers, with existing professional Glow.
The whole-chain native GPU/SpiderMonkey F16/F32 random-frame test and actual
PNG/EXR/24-frame MP4 media test pass. Both EXRs match the actual public Stage
buffer publications arranged by the existing compositor with zero pixel error.
Numeric/lifetime tests independently cover the other image operations.

This fixture is deliberately independent of model inference, optical flow,
video decoding and the browser. It tests real source motion at subframes and
native GPU lifetime/precision, rather than a fake static trajectory or a blur
alias. Do not mistake finite-window sampling for arbitrary upstream Stage seek.
