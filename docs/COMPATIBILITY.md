# Compatibility and authenticity ledger — 0.3.0

A local regression pass does not establish equivalence with a lost physical machine. This ledger records implemented behavior and explicit limits, not a percentage-complete score.

## Original-code execution: no demonstrated boot

No complete unmodified recovered Sketchpad listing has been assembled, linked, booted and replayed here. There is no known-good original binary bundled. `examples/drawings.js` constructs the host drawing; `examples/programs.js` contains newly authored machine diagnostics. These are independent paths.

The preservation project reports that it lacks known-correct source and binaries. That is a provenance and verification problem to address, not evidence that restoration is impossible. See SOURCES.md.

## CPU and memory

| Area | Implemented | Boundary |
|---|---|---|
| Representation | Exact BigInt 36-bit words, 18-bit one's-complement indices, 17-bit addresses, both zero patterns | Not an electrical/gate model |
| Instruction format | 50 opcode names and documented aliases; hold/config/index/defer fields | Encoding is not proof of executable semantics |
| Core handlers | 48 handlers; list exported as `SUPPORTED_OPERATIONS` | Per-op/configuration restrictions remain |
| Arithmetic | Configured ADD/SUB with carry and overflow state; signed AB multiply/divide; scale, cycle, normalize; logic, exchange, index families | Simultaneously active 27/9 MUL/DIV/NOA/NAB/TLY coupled stepping, exceptional DIV results and SCALE zero count with pending overflow fault |
| Configuration | F[32], permutations, quarter activity, sign extension, four fractures, SPF/SPG/FLF/FLG, group wrap and F0 invariant | Not exhaustive electrical conformance |
| Addressing | Direct/indexed and chained deferred operands, pointer indexation, Q and N updates | Deferred JMP still faults; marked P placekeepers and TRAP 42 interlocks are supported; defer-loop detection is a host guard |
| Sequences | Optional priority profile, X placekeepers, TSP for K0, flag changes, dismiss/retry, held instruction interlocks | TRAP 42 mode handling and sequence interlock are modeled; no complete alarm circuit or independent electrical timing validation |
| STUV | S/T, optional U, A–E mapping, metadata/parity planes, shared A–E metabit | Full 32-word plugboard mapped read-only; published reader-leader boot tested. Full CODABO panel/electrical wiring is not modeled |
| Debugger | Atomic failure rollback, bounded reverse journals, breakpoints/watchpoints, snapshots and deterministic peripheral restoration | Not reversible microcycle/electrical execution |

New handlers relative to 0.1.0: EXA, EXX, ADX, FLF, FLG, ITE, ITA, UNA, DSA, INS, COM, JPA, JNA, JOV, CYA, CYB, CAB, SCA, SCB, SAB, NOA, NAB, MUL, DIV and TLY. OPR/IOS and TSD are additionally enabled under the optional INOUT research profile. AOP and unknown opcodes fault.

`cycles` counts executed instructions. The INOUT profile advances a **synthetic 5-microsecond instruction quantum**, plus waits to the next modeled device completion. This is useful for deterministic scheduling tests, not cycle-accurate performance measurement.

## Machine profiles and peripherals

`strict`: instruction research without sequence/peripheral scheduling. Unsupported scheduling operations fault.

`diagnostic-word-io`: retains a clearly nonhistorical signed-halfword coordinate stream. It must not be cited as evidence of original CRT compatibility.

`tx2-io-research`: instruction-level sequence/INOUT model. Implemented units, in octal:

| Unit | Device | Behavior and limits |
|---|---|---|
| 42 | TRAP | Instruction/defer/operand old-metabit detection and automatic marking; mark-inhibit switch; marked sequence placekeeper interlock; cycle/dismiss TSD; reversible circuit state. Instruction-boundary timing, not electrical propagation. |
| 52 | Photoelectric tape reader | Free-running frame arrival, buffering/overrun, normal/splayed data, logical rewind and modes 0100/0102/0104/0106; modes 0/2 retained for diagnostics. Published plugboard/reader leader load binary program tapes. Physical seventh-channel controls, acceleration and exact motor wiring are not modeled. |
| 55 | Light pen | Flag set only when an emitted scope spot intersects the supplied pen aperture. Ideal geometric detection, not analog electronics. |
| 60 | Scope | Signed 10-bit coordinates, relocation and intensity/dwell fields, connected/ready handshake and bounded spot history. Film advance and unknown mode bits fault. |
| 63 | Tape punch | Normal/splayed output, seventh hole, timed ready state and reversible bounded output. The assembler separately builds reader-leader tapes; punch transport is not an unlimited archival recorder. |

Configuration-zero peripheral TSD is supported; configured peripheral transfers outside that verified path fault. Scope history is a finite event log; long tape output history is also bounded, so this implementation is not a lossless unlimited archival recorder. `WordTape` remains a diagnostic word queue.

Missing hardware includes Lincoln Writer/keyboard protocols, other display/input channels, magnetic tape, historical plotter transport, full console reset wiring, complete alarm handling, exact transport control characters and remaining modes. The console's host controls do not run the original drawing program.

## Native M4 frontend

The assembler now has a native restoration frontend in addition to the modern explicit dialect. It supports manuscript glyph normalization in a separate parsing view, macro definition/expansion and hygienic local symbols, omitted dummy parameters, native origins, tags/equalities, field-syllable OR, all 16 comma transforms, fixed-point/octal/decimal values, left-to-right operators, nested register-containing pools and pipe indexing, implicit allocations, source maps and GOTO/PUNCH/PUN entry. Both frontends retain bracketed deferred operands and source offsets while blanking only recognized archival annotations in a parsing copy. Includes consume an aggregate byte budget.

Not complete M4: interactive editing commands (such as MOVE/INSERT/REPLACE/DELETE), unknown glyph/overstrike cases, all typing/output conventions, a verified full archival unit/link layout and ambiguous historical zero-divisor semantics remain unresolved. LIST/TYPE/DIR/BIN/NAME/SUM requests are retained as metadata, not emitted physical devices. PUNCH/PUN with an argument selects the entry; generating bytes is an explicit encodeBinaryTape/CLI operation, not an implicit filesystem write. Default zero division faults; optional `zeroDivision:'zero'` is an explicitly selected hypothesis, never the default.

Assembly failures return no executable word list. This does not prove that every accepted expression agrees with the original lost M4 executable. Source hash identity and assembly correctness remain independent.

## Interactive reconstruction

The model supports shared points, lines/circles/arcs, vector-stroked text, scalars/numeric displays, hierarchical master pictures, live attachers, designated-point copying and similarity-transform dismembering that preserves supported constraints. There are **28 modern constraint types**; the UI exposes common ones and the rest are library APIs.

The numerical solver is sparse automatic differentiation plus damped least-squares, not Sutherland's original relaxation routines. Intrusive rings are newly written, not original packed TX-2 records. The stroke alphabet is newly authored, not recovered original character-generator data. Master propagation, constraint preservation and scalar copy behavior have regression tests, not original-workflow equivalence certification.

Similarity transforms are required for constrained instances/dismembering. Arbitrary affine dismembering is rejected. Full original symbolic constraints and dummy definitions, original database/type/ring semantics, all COPY modes, original library media, original saved pictures, plotting and punching encodings remain outside this delivery. HP-GL and SVG are explicitly modern export formats.

## Visual fidelity

Default: P91-211-inspired rectangular faceplate and numbered picture strip, reference-based physical-console cabinet, 37-button box with thesis bit assignments, 288 toggles, four encoders, 1024-address spot sampling, monochrome glow/afterglow and vector lettering. Modern analysis controls live in a collapsible drawer or separate workspaces.

**Not verified visually identical.** Exact key ordering/spacing, cabinet geometry, material response, panel labels, fonts, display photometry and every historic console revision are not established. The principal layout reference is P91-211; P91-113 informs the instrument bank. Combining photographs is an interpretation, not evidence of one exact contemporary operating arrangement. P91-233/Sketchpad-III is not the target.

## Rendering

Real WebGPU/WGSL capsule rendering and a separate Canvas 2D fallback are implemented. Host geometry traversal, constraint solving, curve tessellation and spot sampling run on CPU; this is not compute-only WebGPU. Canvas 2D was exercised in the supplied browser tests. Hardware WebGPU, device-loss behavior and cross-backend visual parity are unverified. Exponential phosphor decay and two-Gaussian focus/intensity are deterministic visual models, not calibrated CRT physics. Canvas sprites quantize alpha and clamp peak energy; WGSL accumulates float contributions, so exact pixel parity is not claimed.

## Bootstrap evidence and limits

The new binary encoder emits the published standard reader leader, a disconnect/start block and checksummed program blocks. `bootTape` clears RAM and F, mounts bytes and starts at ROM 377750. Tests execute SPG, IOS, TSD, indices, deferred addressing, self-modification and one's-complement checksums to load a newly authored diagnostic. A corrupted payload causes the **executed reader leader** to restart before user entry, even when the host-side decoder is bypassed. The complete successful boot can be reversed, and a mid-boot snapshot resumes independently.

This establishes a tested path through the listed instructions, not complete CPU correctness or original Sketchpad compatibility. Tape files use a logical beginning marker rather than physical END MARK control-channel detection. Host-generated code is restricted from clobbering resident loader words 0–026. Full historical M4 editing/linking, arbitrary loader replacement and all tape conventions are not implemented.

## Acceptance for an original-program compatibility claim

A credible full claim still needs a selected historical revision, preserved and independently proofread sources, complete required M4 semantics, linked image and entry/boot sequence, required CPU configurations and peripheral circuits, independent trace comparisons and replay of documented workflows with output generated by the unchanged original program. A convincing host UI is not a substitute for those gates.
