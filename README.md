# Sketchpad Lab 0.3.0

A working browser reconstruction of Sketchpad's drawing workflows and physical TX-2 console, alongside a standalone native-M4 restoration assembler, instruction-level emulator, peripheral research model, and reversible debugger.

**Not a 100% clone, not a dimensionally exact console, and not an emulator successfully running unmodified original Sketchpad.** The default drawing application is newly written JavaScript. The machine diagnostics are separately assembled and executed; no CPU opcode secretly calls the host drawing engine. See [the compatibility ledger](docs/COMPATIBILITY.md).

## Open it

**[Launch Sketchpad Lab on GitHub Pages](https://wieslawsoltes.github.io/SketchpadLab/).**
The site is rebuilt and deployed automatically after the checks pass on `main`.
The [standalone HTML](https://wieslawsoltes.github.io/SketchpadLab/Sketchpad-Lab.html) is also available to save for offline use.

Open **`Sketchpad-Lab.html`** in a normal browser tab. It is self-contained: styles, 34 JavaScript modules, and a Worker bootstrap; no CDN, package install, account, API key, or server. The browser must allow JavaScript, Blob URLs and Workers. Embedded previews may restrict these.

WebGPU is attempted, with Canvas 2D fallback. This build's browser tests exercised Canvas 2D; hardware WebGPU execution is not certified.

For development, use Node.js 22 or later:

```sh
npm run dev
# http://localhost:4173/apps/studio/index.html
npm run check
npm test
npm run test:types       # requires an installed TypeScript compiler
npm run build           # static dist/ plus self-contained HTML
npm run test:browser     # requires installed Python Playwright and Chromium
npm run package:toolchain
npm run test:package     # validates the installed tarball, not workspace links
```

No runtime dependencies need installing. Optional test tools are never downloaded implicitly.

## Physical console

The default UI replaces the modern drawing dashboard with a gray cabinet, rectangular black CRT faceplate and curved inner tube, monochrome spot display, 37-button box, four shaft encoders, eight editable 36-bit toggle registers, and live K/P/Q/N/FA/F/X/A–E/Z indicators and 33 sequence flags. The modern drawing workbench is a collapsed drawer. Controls are DOM components wired to application and input-register state, not painted hotspots.

Move the pointer onto the CRT and press **D / DRAW**. Move to the endpoint and press **Enter / STOP**. For an arc: **C / CEN CIR** at the center, move to the starting point and press DRAW, then move around the center and STOP. **T** starts moving text; type and STOP. **N** starts a scalar number. **HOLD** ignores one pen flick; the pen icon performs the flick. A live gesture is one undoable document edit.

Open **Drawing workbench** for modern two-click line/circle tools, selections, constraints, master-picture management and inspectors. Keyboard commands intentionally differ between the physical console and the open workbench; see [Controls](docs/CONTROLS.md).

The button bit assignments follow the thesis. Physical key order, exact panel dimensions, typography, cabinet arrangement and some legends are inferred. This is a reference-based reconstruction, not a verified pixel-identical facsimile.

## New in 0.3.0

**Real bootstrap execution:** the 32-word published plugboard initializes F memory and loads the 20-word standard reader leader through PETR. The reader then loads newly assembled program blocks, checks their one’s-complement checksums, disconnects the tape and reaches the entry point. No host-side user-RAM preload or special “boot” opcode is used. The bundled small diagnostic reaches its entry after 649 executed instructions. The complete original Sketchpad program remains unbooted.

**Compiler:** binary tape encoding/decoding and CLI export; native PUNCH/PUN entry handling; bracketed deferred operands no longer discarded as comments; lossless source views with UTF-16 offsets; nested archival-annotation recognition; aggregate include budgets and cyclic-include diagnostics.

**Simulator:** reversible TRAP 42 instruction/defer/operand marking and detection, marked sequence interlock, marked P placekeepers, between-step priority preemption and corrected non-INOUT TSD channels. PETR now has a free-running transport clock, overrun detection and logical rewind/motor modes.

**Visuals:** photo P91-211-inspired rectangular faceplate, numbered strip, blanking panels, four encoders, separate button box and register rack; functioning focus/intensity/afterglow; shared two-Gaussian beam formula; console-only view and in-app fidelity record. Exact cabinet dimensions and beam photometry are not established. See [Visual fidelity](docs/VISUAL-FIDELITY.md).

## Retained from 0.2.0

* **Geometry:** 28 constraint types; scalar quantities and vector-stroked numeric readouts; live instance attachers and similarity-transform variables; designated-point definition copying; master-to-dependent propagation; constraint-preserving dismembering; connected-path planning and modern HP-GL export.
* **Machine:** 48 opcode handlers, up from 23; fractured arithmetic, carry/overflow state, signed double-word multiply/divide, shift/cycle/normalize, exchange and logic families. Unsupported configurations still fault atomically.
* **Native M4:** DEF/EMD macros, compound-symbol macros, native origins and tags, literal pools, pipe-index constructs, script syllables, all 16 comma transforms, left-to-right expressions, implicit allocations, source maps and diagnostics. It is a restoration subset, not complete original M4.
* **INOUT research profile:** priority sequence switching, dismiss/retry and timed handshakes; scope 60, light pen 55, paper-tape reader 52 and punch 63. Six-bit splay/unsplay is implemented. Instruction duration is a deliberately synthetic 5 microseconds; no cycle-accuracy claim.

The initial host drawing has a newly authored repeated-hexagon picture with live masters; other pictures contain linkage and bridge examples. They are not original saved Sketchpad media.

## Assembly and debugger

Choose **M4 native macros** to assemble a native-syntax diagnostic, or **TX-2 scope** to exercise sequence switching and individual CRT spots. These examples automatically select the appropriate machine profile. The older **Vector diagnostic** retains its explicitly nonhistorical word-coordinate endpoint.

Step, bounded Run, Pause, Reverse, breakpoints, memory watchpoints, octal register/memory editing, trace, image export and snapshots work independently of the host drawing. Reverse restores registers, journaled memory, peripheral buffers, output events and virtual time. STOP labels in examples are debugger breakpoints, not invented halt instructions.

## Standalone toolchain

The packer produces `artifacts/sketchpad-lab-tx2-toolchain-0.3.0.tgz`. This self-contained ESM package has TypeScript declarations, an assembler CLI and no runtime dependencies. It is a local artifact, not an npm-registry publication.

```sh
npm install ./sketchpad-lab-tx2-toolchain-0.3.0.tgz
```

```js
import { assembleM4, TX2 } from '@sketchpad-lab/tx2-toolchain';

const image = assembleM4(`
☛☛DEF MOVE|A→B
hLDE A
STE B
☛☛EMD
100|
START→ MOVE|{123456}→ANSWER
STOP→ JMP STOP
☛☛GOTO START
`);
if (image.diagnostics.length) throw new Error(JSON.stringify(image.diagnostics));
const machine = new TX2();
machine.load(image);
machine.breakpoints.add(Number(image.symbols.get('STOP')));
console.log(machine.run({ budget: 100 })); // 2 instructions, breakpoint
console.log(machine.getRegister('E'));    // 42798n (octal 123456)
machine.back();                         // Revert STE and its memory write
```

Instantiate `new TX2({profile:'tx2-io-research'})` for the optional INOUT model. Unsupported peripheral units/modes are errors, not successful no-ops.

## Boot a newly assembled diagnostic from tape

In **Assembly**, choose a diagnostic, press **Boot tape**, then **Run**. The machine stops first at the plugboard; Run executes the loader and stops at the user-entry breakpoint. **Punch tape** downloads the binary tape, not JSON. RESET reboots the same mounted tape.

```js
import { assembleM4, encodeBinaryTape, TX2 } from '@sketchpad-lab/tx2-toolchain';
const image = assembleM4(`
100|
START→ LDA 200
STOP→ JMP STOP
200|
123
☛☛PUNCH START
`, { autoAssign: false });
if (image.diagnostics.length) throw new Error(JSON.stringify(image.diagnostics));
const tape = encodeBinaryTape(image);
const machine = new TX2({ profile: 'tx2-io-research' });
machine.bootTape(tape);              // RAM is clear; P = 377750 octal
machine.breakpoints.add(image.entry);
console.log(machine.run({ budget: 5000 })); // 649 instructions; breakpoint
machine.step();                     // Execute the tape-loaded LDA
console.log(machine.getRegister('A')); // 83n (123 octal)
```

The binary file uses six low-data-bit frames per word, with an optional high file marker. Logical beginning-of-file substitutes for the physical END MARK. See [Tape format and limits](docs/TAPE.md).

## Archive and provenance

Original `sk.tx2as` and `sk2.tx2as` bytes are **not bundled or relicensed**. Archive import/fetch preserves bytes and verifies pinned Git blob identity and length. A matching hash proves retrieval, not historical correctness or successful execution. `sk2` is an alternate listing, not asserted to be a later working release.

```sh
npm run originals:fetch   # explicit network operation
npm run originals:verify
```

Fetching never substitutes synthetic sources on failure. The complete original listings have not been assembled, linked and booted in this build.

## Verification and documentation

**247 regression tests; 33 browser workflows; strict TypeScript consumer compilation.** See [Validation](docs/VALIDATION.md) for exact scope and exclusions.

[Release notes](docs/RELEASE-0.3.0.md) · [Binary tape](docs/TAPE.md) · [Visual fidelity](docs/VISUAL-FIDELITY.md) · [Compatibility](docs/COMPATIBILITY.md) · [Architecture](docs/ARCHITECTURE.md) · [Assembler](docs/ASSEMBLER.md) · [Controls](docs/CONTROLS.md) · [Sources](docs/SOURCES.md) · [Attribution](THIRD_PARTY_NOTICES.md)
