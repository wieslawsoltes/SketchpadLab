# Validation record — 0.5.0

Tests establish the behavior of the implemented research models, not historical hardware certification. CI archives exact source identity and generated artifacts for each tested commit.

## Checks

The current local suite passes **358 Node regression tests**, **33 original-workspace browser workflows** and **24 hardware-browser workflows**, with no uncaught page errors. Strict source TypeScript checks and both isolated offline installed-package runtime/type consumers pass. Build output includes the standalone HTML and both 0.5.0 SDK tarballs. CI repeats these checks and requires actual resident-GPU execution with `tests/resident_browser.py --require-gpu`.

Hardware browser coverage includes gate-only execution isolation, explicit gate RAM, timed circuits, fixed/adaptive electrical behavior, mixed sampling, snapshots, source failures, breakpoints, pause, full tape entry, emitted scope geometry, live pen hits, punch frames and 390px layouts.

## Actual GPU evidence

The pre-optimization PR run **38169617259** at `c795acefa7217de4d35e601b56ceb0eac9f85638` and single-pass run **38171931492** at `f51f30212b7a3c06ab9fa0204f9006cc7a8f8e98` both passed the resident conformance suite on **Google SwiftShader**, a software/fallback adapter.

| Same tape-boot fixture | Before RAM partition | Single-pass schedule |
| --- | ---: | ---: |
| Logical clocks | 9,020 | 9,020 |
| Retired instructions | 649 | 649 |
| GPU dispatches | 283 | 283 |
| Gate evaluations | 903,339,906 | 451,669,953 |
| Initial/changed state uploaded, bytes | 19,721,816 | 19,721,816 |
| Batch readback, bytes | 168,951,000 | 168,951,000 |
| Observed boot wall time, milliseconds | 56,374.5 | 27,390.1 |

The evaluation reduction is exact for this fixture: no gate is evaluated twice per settle after the change. Elapsed values are observations from different CI runs, **not a controlled physical-GPU benchmark or a promised speedup**. The bootstrap fixture has 48,551 gates; it is not the default extended arithmetic configuration.

The actual resident suite exercises 704 four-state gate combinations, batched clocks with two RAM banks/read-only regions, precise probes, reverse/input synchronization, fault rollback, concurrent/edit guards, gate-driven INOUT, internal breakpoints/instruction conditions, the complete 9,020-clock bootstrap, reversal of every retained boot clock, and public-session checkpoint/trace handling. Forward CPU gate methods are disabled in relevant tests to detect accidental fallback. The level-dispatch backend is separately compared against CPU storage and an INOUT scope board.

The local browser permits standalone DOM/worker testing but blocks navigation needed by its GPU fixture. Local GPU availability is not counted as a pass. CI reports the adapter that actually executes WGSL. **Physical-GPU acceleration and complete historical transistor fidelity remain unverified.**

## Electrical accuracy and rollback

Tests cover analytic RC/RL responses, negative supply, Shockley current/KCL, NPN/PNP inversion, source breakpoints, mixed ADC/DAC sampling, singular circuits, adaptive tolerance behavior, late nonlinear failure, minimum/trial budgets and independent snapshot continuation. The adaptive example at 1 ms is within 0.003 V of the analytic 5 V RC charging response. Local error control is not a global accuracy guarantee.

A regression reproduces the session's old premature endpoint at an internal PWL knot. Adaptive sessions now retain the requested outer time and mixed digital edge count; this is checked separately from the circuit solver itself.

## Reproduce

```sh
npm run check
npm test
npm run test:types
npm run build
npm run package:toolchain
npm run test:package
npm run package:hardware
npm run test:hardware-package
npm run test:browser
npm run test:hardware-browser -- --gpu
python tests/resident_browser.py --require-gpu
```

Reports: `test-results/browser-report.json`, `test-results/hardware/report.json`, `test-results/resident/report.json`, and `test-results/package-report.json`. CI source archives record their exact checkout SHA; a PR checkout may be a synthetic merge commit. Final distributions should be taken from the successful merged-main build.

Neither byte identity, differential testing, bootstrap success nor these regression counts demonstrates full unmodified original Sketchpad execution, exhaustive instruction/device compatibility, original electrical timing or pixel-identical reconstruction.
