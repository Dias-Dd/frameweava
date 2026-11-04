# PA3 Unicode analysis adapter

The wrapper in `src/` is Frameweave original code, Apache-2.0. It calls original, unmodified published crates:

| Crate | Fixed upstream commit | License |
|---|---|---|
| unicode-bidi 0.3.18 | 580b9c6c68fdb689916017e61d5052be3ed349b5 | MIT OR Apache-2.0 |
| unicode-script 0.5.7 | 90bd26b53764c3f36b16f545a299792db31a650f | MIT OR Apache-2.0 |
| unicode-segmentation 1.12.0 | 9e3f88c06ca275294ef4cb1daf0789f06a28611d | MIT OR Apache-2.0 |

Original license/copyright/author files are preserved under `licenses/`. Unicode data and official validation fixtures use the preserved Unicode License v3. All three selected algorithms use Unicode16 data. No upstream source patches, editor, font registry, renderer or timeline are imported. See the source audit for exact archives, original file hashes and reviewed call sites.

`Cargo.lock` also pins the build/wasm-bindgen dependencies. Most are MIT OR Apache-2.0; **unicode-ident 1.0.27 is (MIT OR Apache-2.0) AND Unicode-3.0**. The official Kit inventories original source bytes and collects all dependency license files in its generated `licenses/` output. Preserve that generated license tree, this notice and existing HarfRust/Skrifa notices when Main creates a formal new package. Supplemental Unicode fixture/font notices do not replace transitive notices. No new runtime permission or silent dependency download is authorized by this notice.

Noto Sans Hebrew in the validation scene is an unmodified OFL1.1 fixture at the fixed Google Fonts commit in `font-sources.json`; original OFL text is adjacent. Other fonts reuse already tracked OFL fixtures without duplicating or changing their bytes.
