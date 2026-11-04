# PA3 Zig Zag algorithm adapter (in progress)

Original EffectCraft Rust: `crates/path/src/ops.rs` and tangent helpers in `crates/path/src/fit.rs`, commit **861c51f8187bf56efc77cc7b60fc4a513d2b7198**, repository https://github.com/storytold/effectcraft . The original fit.rs attributes its own compatible code to VectorCraft. Both complete original files and a selected unchanged Rust test excerpt are under `upstream/`; original MIT/Apache notices are under `licenses/`. No editor, renderer or project model is copied.

Original ops.rs SHA256 `98679efdf568338fe274c7cfc9719afe525c5ac07c6d5ad47cf06ebbdf6347ac`, fit.rs SHA256 `92bdff8b69f649b43717257611cc119d7045fcca890744b18e77c9cbe834c337`.

`src/algorithm.rs` retains the original Rust resample/emit/normal/smooth formula. Its explicit changes are removing the silent ridge1000 clamp, and passing the original kurbo arclength/inverse accuracy explicitly. `geometry.rs` adds complete preflight before allocation, checked representable counts, caller resource budgets, finite output checks, exact size0 identity, degenerate contour preservation and an explicit precision failure for nonzero segments the original would silently discard. Default-instance native comparisons retain an unchanged original excerpt as reference, plus independent analytic line/curve/seam tests. These are not Adobe pixel-equality claims.

kurbo0.13.1 remains the already reviewed MIT OR Apache-2.0 crate and fixed Cargo tree from the Curve/Dash checkpoints. New adapter code is Apache-2.0. Keep all generated dependency license files, this notice and original attribution in any future formal package. No new package dependency, permission, timeline, GPU pixel effect or public Stage binding is declared available by this work-in-progress notice.
