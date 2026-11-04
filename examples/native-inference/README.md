# Image super-resolution example

`project.tsx` runs the ONNX Model Zoo ESPCN model on DirectML. It generates a synthetic 224 × 224 SDR luminance input and displays the model's 672 × 672 output.

The example includes the unmodified Apache-2.0 weights at `model/super-resolution-10.onnx` from ONNX Model Zoo revision `395472c`. [License](LICENSE) · [Model card](https://huggingface.co/onnxmodelzoo/super-resolution-10) · [Upstream weights](https://huggingface.co/onnxmodelzoo/super-resolution-10/blob/395472c4b6b92f788357237983d83fd913cfe7e3/super-resolution-10.onnx)

The file is 240,078 bytes and its SHA-256 is `85f36ff88cc504a24af5e0602148bc56a8aa09a58eca8c0da2756f3e8186035e`.

The example requires a configured DirectML runtime. From the repository root, `node examples/native-inference/fetch-model.mjs` verifies the bundled weights and populates the local inference test cache. It fetches the pinned upstream file only if the example's copy is missing. [DirectML runtime setup](../../modules/inference/README.md#build-and-reproduce)
