# Sketchpad Lab 0.5.0

Browser reconstruction of Sketchpad workflows and the TX-2 console, with a native-M4 restoration assembler, reversible instruction emulator, and **optional independent gate/electrical hardware laboratory**.

**The complete unmodified original Sketchpad application does not yet boot.** Published plugboard and reader-leader code now runs through the gate-built machine to load authored diagnostics from tape. That is not execution of the original drawing application, nor a historically exact transistor-level reconstruction. See [compatibility](docs/COMPATIBILITY.md).

[Launch](https://wieslawsoltes.github.io/SketchpadLab/) · [Standalone HTML](https://wieslawsoltes.github.io/SketchpadLab/Sketchpad-Lab.html) · [Hardware SDK](docs/HARDWARE.md) · [Gate I/O and bootstrap](docs/GATE-IO.md)

## Run

```sh
npm run dev
# http://localhost:4173/apps/studio/index.html
npm run build
# Generates dist/ and the self-contained Sketchpad-Lab.html.
```

Node.js 22+ is sufficient for build/runtime tooling. There are no runtime package dependencies. The standalone embeds its modules and workers; browsers must permit JavaScript, Blob URLs and workers. CPU gates are the default. Explicitly selecting WebGPU requires a supported secure context and adapter; GPU failures are not hidden by an instruction-interpreter fallback.

## New in 0.5.0

The gate board now includes priority sequence control, HOLD/dismissal, placekeepers, LIMBO, IOS/TSD handshakes, tape buffers/rewind, scope output, circular light-pen detection, punch output and TRAP logic. Gate-controlled tape boot begins with cleared configuration and payload RAM, executes the published loader, and transfers to compiled user code. The optional workbench shows actual emitted scope records and accepts live pen input while leaving the original instruction workspace untouched.

**GPU-resident execution** advances gates, flip-flops, RAM and gate-built devices in bounded batches. A RAM-dependency schedule evaluates every gate once per settle rather than twice. The CPU backend uses packed schedules and compressed sparse-row dirty fanout. Neither backend calls the instruction emulator to manufacture results.

**Adaptive electrical integration** adds backward-Euler step doubling, explicit tolerances, exact source-breakpoint handling and atomic observation intervals. Mixed-signal integration preserves the requested DAC/ADC sampling interval and one digital edge, even when internal analog steps subdivide.

Opening **Hardware** allocates no simulator; **Enable & build** creates its worker. Close pauses; Power off releases it. Clock/instruction step, reverse, breakpoints, checkpoints, portable snapshots, VCD, wiring export and actual driver inspection remain available.

## Packages and validation

```sh
npm run package:toolchain
npm run package:hardware
npm run test:package
npm run test:hardware-package
npm run check
npm test
npm run test:types
npm run build
npm run test:browser
npm run test:hardware-browser -- --gpu
python tests/resident_browser.py --require-gpu
```

Tarballs are `artifacts/sketchpad-lab-tx2-toolchain-0.5.0.tgz` and `artifacts/sketchpad-lab-hardware-sim-0.5.0.tgz`. They include transitive modules, notices and strict TypeScript declarations. Creating a tarball does not publish it to npm. Type/browser tests require TypeScript and Python Playwright/Chromium; CI installs pinned test tools, archives exact source identity, runs both GPU backends and deploys passing main builds.

[Validation and measurements](docs/VALIDATION.md) · [Release notes](docs/RELEASE-0.5.0.md) · [Architecture](docs/ARCHITECTURE.md) · [Assembler](docs/ASSEMBLER.md) · [Tape format](docs/TAPE.md) · [Controls](docs/CONTROLS.md) · [Visual fidelity](docs/VISUAL-FIDELITY.md) · [Sources](docs/SOURCES.md) · [Notices](THIRD_PARTY_NOTICES.md)

Original `sk.tx2as` and `sk2.tx2as` files are not bundled or relicensed. Archive fetch/import preserves and verifies pinned bytes; hash identity does not establish assembly correctness or a latest working historical release.
