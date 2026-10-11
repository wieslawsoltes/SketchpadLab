# Sketchpad Lab 0.3.0

11 October 2026. Continued browser-console reconstruction, native assembler and instruction-level simulator work. **The complete original Sketchpad program is still not assembled/booted here.**

## Delivered

**Visual console:** P91-211-inspired rectangular faceplate, gray housing/blanking panels, numbered strip, encoders, separate button box, corrected per-register lamp grids, FA/F/X and 33 live sequence flags. Console-only view and an in-app fidelity record separate archival interpretation from modern tools. Focus/intensity/afterglow operate the shared analytic beam approximation.

**Assembler:** source-preserving scanning fixes the loss of square-bracket deferred operands; nested recognized annotations retain locations; aggregate include budgets and cycle rejection; native PUNCH/PUN selects entry. Reader-leader tape encoding/decoding includes one's-complement checksums, framing/range validation and explicit CLI export.

**Simulator:** published 32-word plugboard and 20-word reader leader execute to load new diagnostics from tape without host-side program loading. TRAP 42 supports old-metabit detection, automatic marking, inhibit, marked sequence interlocks and reversible circuit state. P marks survive normal sequencing. PETR models logical rewind, free-running frame arrival, overrun and motor modes. Between-step high-priority flags preempt before the next unheld fetch. Non-INOUT TSD uses sequences 0/75/76, not 77. Run honors breakpoints after asynchronous sequence/device transitions, with separately reversible boundary events and unchanged instruction counts.

**Debugger/workspaces:** cold tape boot, tape download, ROM/leader listing, circuit/reader state, entry breakpoint, reset/reboot and failure locking. Complete successful bootstrap reversal and independent snapshot/resume are tested. Corrupt payloads cause the executed reader leader to restart before user code, independently of host tape validation.

## Verification

247 automated regression tests, 56 JavaScript syntax checks, strict public TypeScript consumer compilation and 33 Canvas browser workflows passed. The offline standalone package is checked independently, including binary tape output, bootstrap execution, reversal, snapshot/resume, strict TypeScript imports and CLI failure behavior. See VALIDATION.md and the supplied JSON reports for exact commands and scope.

The small loader diagnostic uses 186 file bytes and reaches entry 100 octal after 649 executed instructions. That is a count within this emulator, not a hardware benchmark or original-program execution result.

## Boundaries

Still outstanding: complete original-listing unit selection/linking and required M4 editing/glyph semantics; remaining CPU/configuration and alarm cases; full console reset wiring and peripherals; physical tape control-channel/END MARK behavior; independent electrical traces; original Sketchpad replay; measured visual/photometric fidelity. Hardware WebGPU is not validated. No original source transcriptions, historical images or external font files are bundled.

GitHub repository writes and remote Actions were not performed. The matching user repository is an archived C# project, not the browser source baseline. Local commits and a portable Git bundle/patch preserve this work without altering that repository.
