# Sketchpad Lab 0.4.0

A browser reconstruction of Ivan Sutherland's Sketchpad workflows and the TX-2 console, with a native-M4 restoration assembler, instruction emulator, reversible debugger, and an **optional independent gate/electrical hardware laboratory**.

**The complete, unmodified original Sketchpad program does not yet boot.** The drawing application is newly written JavaScript; the gate board is synthesized research hardware rather than a transcription of the original TX-2 circuit cards. See [compatibility](docs/COMPATIBILITY.md) and [hardware fidelity](docs/HARDWARE.md).

## Run

[Launch the application](https://wieslawsoltes.github.io/SketchpadLab/) or [download the generated standalone HTML](https://wieslawsoltes.github.io/SketchpadLab/Sketchpad-Lab.html). GitHub Pages is rebuilt after the checks pass on `main`.

From source, Node.js 22 or later is sufficient; there are no runtime package dependencies:

```sh
npm run dev
# http://localhost:4173/apps/studio/index.html
npm run build
# Generates dist/ and Sketchpad-Lab.html for offline use.
```

The generated HTML embeds the styles, module graph and worker bootstraps without a CDN. The browser must allow JavaScript, Blob URLs and workers. WebGPU requires a supported browser/context; the drawing renderer has a Canvas fallback. Hardware computation uses CPU gates by default and never silently substitutes them for a failed selected GPU backend.

Build outputs belong in CI artifacts and are regenerated from source, rather than serving stale checked-in copies.

## Hardware laboratory

Click **Hardware**, choose a model, and click **Enable & build**. Merely opening the panel does not allocate a hardware worker; the original drawing and instruction workspaces remain intact.

The laboratory includes four-state clocked gates, delayed inertial/transport gates, a 48-opcode research board, bounded gate-built RAM, an RLC/diode/BJT transient solver and explicit digital/analog coupling. Run/step/reverse, breakpoints, waveforms, source editing, actual driver-cone inspection, portable snapshots and VCD/wiring export are available. Closing pauses the laboratory; Power off releases its worker and storage.

The extended board currently contains **214,395 Boolean gates and 1,736 flip-flops**, plus explicit RAM macros by default. The 256-word gate-RAM option uses flip-flops and multiplexers for its data and metadata. These are synthesized implementation counts, not historical TX-2 component counts.

The board executes its own gate connectivity, not the instruction emulator. It does not yet implement the full TX-2 sequence, INOUT, TRAP, tape-boot or peripheral circuitry. Generic electrical models do not establish a transistor-accurate original machine. Read [the model contracts, SDK examples and validation requirements](docs/HARDWARE.md).

## Drawing, assembly and instruction research

The drawing reconstruction supports lines/circles/arcs, shared points, snapping, constraints, live master instances, attachers, definition copying/dismembering, vector text/scalars, undo/redo, JSON persistence and modern SVG/HP-GL export. The console includes 37 controls, 288 toggles, encoders, register lamps and an optional console-only view. Its appearance is evidence-guided, not a certified dimensionally exact replica.

The separate instruction workbench provides exact 36-bit words, one's-complement arithmetic, the bounded explicit/native-M4 assemblers, memory/configuration handling, breakpoints, watchpoints, snapshots and reversal. Its INOUT research profile executes the published plugboard/reader leader to load generated binary tapes and includes scope, light-pen, paper-tape and TRAP research models. These capabilities are not automatically capabilities of the new gate board.

## Reusable packages

```sh
npm run package:toolchain
npm run package:hardware
```

The resulting self-contained tarballs are `artifacts/sketchpad-lab-tx2-toolchain-0.4.0.tgz` and `artifacts/sketchpad-lab-hardware-sim-0.4.0.tgz`. Both include notices and strict TypeScript declarations. No registry publication is implied by creating a tarball.

```js
import {TX2GateBoard} from '@sketchpad-lab/hardware-sim';
import {assemble} from '@sketchpad-lab/hardware-sim/assembler';

const image = assemble('.org 100\nLDA 200\n.org 200\n.word 0d1963');
if (image.diagnostics.length) throw new Error(JSON.stringify(image.diagnostics));
const board = new TX2GateBoard(image);
board.stepInstruction();
console.log(board.state().A); // 1963n, from gate execution
```

The combined toolchain exposes hardware through `@sketchpad-lab/tx2-toolchain/hardware`. Its default/core API remains the separate instruction-level implementation.

## Quality checks

```sh
npm run check
npm test
npm run test:types
npm run build
npm run test:browser
npm run test:hardware-browser -- --gpu
npm run package:toolchain
npm run test:package
npm run package:hardware
npm run test:hardware-package
```

Type checks require TypeScript; browser checks require Python Playwright and Chromium. CI installs these test tools, exercises both workspaces and isolated package installations, and archives the exact tested source plus generated distributions. Hardware GPU checks report adapter availability explicitly; `python tests/hardware_browser.py --gpu --require-gpu` makes lack of execution a failure.

The Node suite contains **298 passing regression tests** at this release, plus **33 original-workspace and 17 hardware-browser workflows**. Counts are regression coverage, not proof of full historical compatibility. See [0.4.0 release notes](docs/RELEASE-0.4.0.md); GPU environment results are recorded in the CI hardware report.

## Original sources and attribution

`sk.tx2as` and `sk2.tx2as` are not bundled or relicensed. Archive import/fetch preserves source bytes and verifies pinned identity/length; a matching hash does not prove historical correctness. The alternate listing is not asserted to be the latest working release.

```sh
npm run originals:fetch
npm run originals:verify
```

[Hardware](docs/HARDWARE.md) · [Compatibility](docs/COMPATIBILITY.md) · [Architecture](docs/ARCHITECTURE.md) · [Assembler](docs/ASSEMBLER.md) · [Tape bootstrap](docs/TAPE.md) · [Controls](docs/CONTROLS.md) · [Visual fidelity](docs/VISUAL-FIDELITY.md) · [Sources](docs/SOURCES.md) · [Attribution](THIRD_PARTY_NOTICES.md)
