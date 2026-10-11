# Visual-fidelity record — 0.3.0

## Target and evidence

The principal visual reference is Lincoln Laboratory photograph **P91-211**, showing the operating console used with the original two-dimensional Sketchpad. The photo archive supplies conflicting month/day ordering in its caption; this release cites the identifier and year rather than asserting a resolved day/month. Photograph **P91-113** informs the separate register/toggle grouping. The later P91-233 display, associated with Sketchpad-III, is not treated as the target program.

Photo index: https://tx-2.github.io/photographs.html

Primary layout image: https://tx-2.github.io/photos/Lincoln-Lab/2022-10-31/P91-211.jpg

The photographs were consulted as references. Their pixels are not embedded, no person is rendered in the application, and no third-party fonts are distributed.

## Reference-based changes

The outer faceplate is now a **black rectangle in a gray beveled frame**, rather than a large circular outer bezel. A curved inner tube/glass impression remains behind the rectangular drawing area. The cabinet has blanking panels above the scope, a 9–0 number strip, four lower rotary encoders, a separate desktop pushbutton box and an adjacent instrument bank. The left telephone silhouette and clipped operator sheet echo the setting; the telephone is nonfunctional decoration, not an emulated communications device.

Register strips show K, P, N, FA, F, X, Q, D, A, B, C, E and Z with their individual bit counts. FA and X are selected from the instruction's fields; F shows the chosen configuration. The sequence bank shows the 33 legal sequence flags, with a separate current-sequence indicator. All eight 36-bit toggle registers and the 37 pushbutton inputs remain functional.

The 37-button bit assignments follow the thesis appendix. **Their exact physical ordering/spacing has not been established from a measured drawing.** The current matrix is a navigable presentation of those assignments, not a certified reproduction of a specific manufactured button box.

## What is intentionally modern

The default drawing engine, numerical solver and vector lettering are newly authored. The activity log, quick-reference sheet, numeric register values, reversible-debugger controls, view navigation, undo/redo and compiler workspaces are modern tools. CONSOLE ONLY hides header/navigation without pretending those tools existed on the original machine. The drawing workbench remains collapsed until opened.

Desktop cabinet proportions are an orthographic interpretation, not a perspective-matched photographic projection. The mobile layout rearranges panels to keep them usable rather than preserving full-size physical geometry. CSS gradients, screw shapes, material colors, fonts and dimensions are inferred. Display focus/intensity sliders are modern accessibility controls for the rendering model.

## Display model

Host geometry and stroke text are clipped and sampled into a 1024-address point list with bounded traversal. A deterministic exponential decay produces afterglow. A two-Gaussian radial beam model provides a tunable core and halo. Focus is bounded to 0.35–1.8; intensity scales energy.

Canvas 2D caches a small point sprite per focus/device-pixel-ratio pair, then adds contributions. WGSL uses the corresponding analytic core/halo formula in two passes. The Canvas sprite quantizes alpha and clips peak energy; WebGPU accumulates floating-point contributions before framebuffer conversion. They are not claimed pixel-identical. Neither model is a measured phosphor spectrum, analog bandwidth model or calibrated photometric simulation of the TX-2.

Browser validation exercised the Canvas path, including changing focus and invalidating the sprite cache. Hardware WebGPU and loss/recovery remain unverified. A local HTTP WebGPU probe was blocked by the execution environment's browser navigation policy; that is not a successful GPU execution test.

## Remaining fidelity gates

Exact identity would require measured cabinet/faceplate/controls geometry, resolved physical key locations, matched historic labels and typography, a specified console revision, calibrated CRT sampling/spot response and a reproducible camera or orthographic comparison. Original Sketchpad-generated display lists would then need to drive the result. This release supplies reference-based improvements and an inspectable fidelity record, not a “100% identical” certificate.
