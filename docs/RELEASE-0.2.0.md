# Release 0.2.0 — physical console and machine restoration work

## Delivered

The default console is now a physical-machine reconstruction rather than a modern CAD dashboard: circular CRT bezel, monochrome spot display, live register lamps, four encoders, 288 toggle switches, a wired 37-button box, pen/cradle interaction and collapsed modern workbench. Cabinet geometry and exact key placement remain inferred, not verified identical.

The geometric library expands from 17 to 28 constraint types, adds scalar readouts, vector lettering, four-DOF constrained instances, live attachers, designated-point copying, and supported-constraint preservation on dismember. Master propagation no longer rescales instances simply to retain stale host attachment coordinates. Scaled dismember preserves scalar values while transforming measurement equations. Plot planning/HP-GL are modern conveniences, not original device formats.

The CPU grows from 23 to 48 core opcode handlers. Added families cover multiplication/division, normalization/scaling/cycling, logic/exchange and richer configuration/overflow behavior. An optional INOUT profile implements priority scheduling, held-instruction interlocks, dismiss/retry, scope, light pen, reader and punch behavior. Synthetic instruction timing and unsupported configurations are documented.

Native M4 is a new frontend, with DEF/EMD, compound macros, script syllables, field OR, all comma transformations, nested RC pools, pipe indexing, native equality/origin semantics and source maps. It does not claim every M4 command or successful assembly of all original listing units.

## Compatibility boundary

Original unchanged Sketchpad has **not booted**. Remaining work includes full archival assembly/linking, unresolved M4 editing and glyph semantics, required missing CPU/configuration behavior, TRAP42 and alarms, full boot and peripheral protocols, independent execution traces, source proofing and original-workflow replay. Visual resemblance does not replace those requirements.

## Validation

192 regression tests, strict TypeScript consumer checks and 23 browser workflows passed. The browser used Canvas 2D. Hardware WebGPU and complete historical fidelity remain unverified. See VALIDATION.md and test-results/browser-report.json.
