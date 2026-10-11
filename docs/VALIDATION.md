# Validation record — 0.3.0

Validated on 11 October 2026. Local regression results are not historical hardware certification.

| Check | Result |
|---|---|
| JavaScript syntax | 56 modules checked by Node |
| Automated regression tests | 247 passed; 0 failed; 0 skipped |
| Source public TypeScript declarations | Strict NodeNext consumer compilation passed |
| Isolated installed-package TypeScript consumer | Strict NodeNext compilation passed |
| Static distribution | Built successfully |
| Self-contained HTML | 34 embedded ESM modules; Worker starts without network dependencies |
| Browser end-to-end workflows | 33 passed; no uncaught page errors |
| Desktop | 1440 × 1150 viewport |
| Mobile | 390 × 844 viewport; no horizontal document overflow |
| Renderer exercised | Canvas 2D, including focus/sprite-cache behavior |
| Binary tape diagnostic | 186 bytes; 649 executed instructions to user entry; payload executes |
| Corrupt tape | Host decoder rejects bad checksum; executed reader leader independently restarts on corruption |
| Reversibility | Complete boot reversal and independent mid-boot snapshot/resume passed |
| Standalone npm package | Offline installation, API, declarations and CLI checked independently |
| Hardware WebGPU/WGSL execution | Not verified |
| Full original Sketchpad assembly and boot | No demonstrated success; no original-program execution claim |
| Remote GitHub Actions | Not run |

Environment: Node 22.16.0, npm 10.9.2, TypeScript 5.8.3; installed Python Playwright and Chromium. No runtime dependencies or implicit downloads were needed.

## Coverage

The prior 192-test suite remains. Added tests cover TRAP mode decoding and old-metabit behavior, marking and atomic reversal, sequence interlocks and P mark preservation, external preemption/HOLD and post-transition breakpoints with reversible non-instruction boundary events, corrected TSD channels, ROM words/configuration initialization, actual tape-loader execution, multi-block checksums, complete boot reversal, corrupt-payload rejection by the reader leader, snapshot continuation, PETR clock/overrun/rewind, native PUNCH entry, deferred brackets, archival source offsets/nesting, include budgets/cycles and beam-energy invariants.

This is not an exhaustive cross-product of every opcode, configuration, memory bank, peripheral mode and trap setting. Rendering is not an electrical model and the geometry solver is newly written.

## Browser evidence

`test-results/browser-report.json` records 33 workflows. They cover the physical console, 37 pushbuttons/288 toggles, 33 sequence indicators, console-only mode, focus changes, worker execution/reversal, explicit and native compilation, timed scope output, tape download/cold bootstrap/entry breakpoint/payload/reset, failed tape-build and assembly locks, document drawing/constraints/undo/instances, physical light-pen gestures/text/HOLD, machine indicators, archive navigation and 390px mobile layout.

The browser suite uses `page.set_content` with the generated standalone HTML in Chromium. It exercises real DOM/Canvas, Blob ESM modules, Workers and pointer/keyboard events without network navigation. It does not certify file-URL policies, external HTTPS hosting, all browser engines or every touch device. A separate local-HTTP WebGPU probe was blocked by the environment's browser navigation policy; neither software nor hardware GPU execution is claimed from that attempt.

Original-byte hash/audit logic is tested, but a complete original listing has not been successfully assembled or executed. Archive network operations were not replaced with fabricated bytes.

## Reproduce

```sh
npm run check
npm test
npm run test:types
npm run build
python tests/browser_smoke.py --chromium /path/to/chromium
npm run package:toolchain
npm run test:package     # validates the installed tarball, not workspace links
```

TypeScript, Python Playwright and Chromium must be installed for their optional checks. The source archive contains the test code and reports. The standalone toolchain tarball is an installable local artifact, not an npm-registry publication.
