# Architecture

## Three separate layers

The **reconstruction layer** is `SketchDocument → constraint solver → flattened geometry → VectorDisplay`. The **machine layer** is `assembly text → parser/assembler → 36-bit image → TX2 → memory/device trace`. The **archive layer** is `original bytes → Git blob verification → transcription audit → unchanged source view`. There is no hidden shortcut in which a CPU opcode invokes the modern drawing application.

## Word semantics and execution

BigInt is used for all 36-bit bitwise operations; JavaScript's 32-bit numeric bitwise operators are used only for narrow fields and physical addresses. One's-complement arithmetic distinguishes the two zero encodings. Physical address addition uses the signed index value and canonicalizes zero before wrapping to 17 bits, independently of the arithmetic element's end-around-carry result.

An instruction starts a memory journal and captures scalar registers, X/F registers, input state and attached-device snapshots. Memory logs the old data, metabit and parity only on the first write to an address. On success the delta enters a bounded history. On failure the journal and state are restored before a diagnostic is exposed. Reverse execution applies the old memory values and restores the previous machine/device state. Unknown operations cannot silently advance as NOPs.

This is an instruction-atomic debugger model. It does not reproduce every intermediate hardware pulse or partially completed electrical operation. Snapshot memory is copied; per-instruction history stores deltas, not a full core-memory image. Host input and legacy diagnostic-device snapshots are copied. New INOUT event logs use immutable 128-event chunks plus a copied tail to reduce per-instruction snapshot cost. Logs are bounded; unlimited archival recording requires an external recorder. The reader stores mounted media separately from per-step state and includes it in whole-machine snapshots.

The browser worker limits run batches to 500 instructions and a request to at most one million. Batches yield to its event loop, allowing pause/cancel messages. UI rendering is independent of those batches. BigInt interoperability uses structured clone inside the application; snapshot JSON has explicit tagged integer and typed-array encodings.

## Model and solver

Points have stable document IDs. Lines reference point IDs rather than duplicating endpoint coordinates. Pictures own their geometry, and instances reference master pictures with affine transforms. Cycles are rejected. Multiple instances see a master edit through the same source model. The intrusive ring arena stores next/previous/owner/value planes in growable typed arrays. Ring insertion/removal is O(1); rebuilding the document's diagnostic rings is linear in membership count.

Constraint residuals carry sparse derivative maps. A damped Gauss–Newton/Levenberg–Marquardt step solves the normal equations using matrix-free preconditioned conjugate gradients. Fixed points and drag pins are eliminated from the variable vector. The solver returns residuals per constraint, maximum residual, iteration count, numerical rank and degrees of freedom. Dense rank estimation is limited to small systems; larger systems report unknown rank instead of an invented degree count.

The solver is local and numerical: it does not prove global feasibility, guarantee a unique solution, or provide exact symbolic dimension analysis. Degenerate geometry may stagnate. A low residual means these numerical equations are satisfied, not that every original Sketchpad constraint has been recreated.

## Rendering and packaging

The renderer converts visible segments to instanced analytic capsules. WGSL evaluates distance to the segment for antialiasing, and additive glow/core passes produce a vector-display appearance. CPU model traversal, curve tessellation, hit testing and label layout are not GPU-compute operations. Canvas 2D is a distinct fallback, accurately named in the UI.

`build-standalone.mjs` packages this application's acyclic relative ESM graph as local Blob modules, including the worker module. It is a purpose-built bundler, not a general JavaScript bundler. Dynamic import runs inside a classic worker bootstrap so the resulting file does not need a network-served module worker.

`package-toolchain.mjs` copies both machine and assembler implementations into one package. Relative imports remain internal to that tarball; there is no dependency-hoisting assumption. Type declarations cover the public APIs. No dependency install or build script downloads original listings implicitly.

## Security and data handling

Assembly expressions use a bounded parser, not `eval` or generated JavaScript. Includes resolve only from explicitly supplied source strings. Expansion depth and output sizes are bounded. Manuscript directives that are not implemented produce errors. Drawing imports validate object identity, references, ownership, coordinates, constraints and picture cycles before acceptance. Text is escaped for SVG and HTML presentation.

Untrusted input handling is not a formal security audit. Applications exposing the toolchain to arbitrary remote uploads should run it in a separate Worker/process with resource quotas and enforce their own size/rate limits. Web rendering and custom device adapters execute trusted application code, not original assembly in a JavaScript escape hatch.


## Native M4 and INOUT additions

The native assembler has normalization, source records, macro expansion with local symbol remapping, deferred equality evaluation and RC allocation, then instruction-word emission. Its fragment evaluator implements native script elevation, left-to-right arithmetic and word-quarter comma transforms. It does not rewrite the preserved archive. The modern explicit parser remains separate so its familiar precedence and directives do not silently change meaning.

An optional `TX2IOBus` couples sequence flags to five modeled devices/circuits. Device completion times are in a deterministic virtual microsecond domain; each instruction advances a synthetic five-microsecond quantum. Busy TSD dismisses/retries rather than manufacturing output. The scheduler observes hold/preemption behavior and saves/restores sequence placekeepers. Limbo advances to a known device completion or reports WAIT when external input is required. This is an instruction-level research abstraction, not pulse-accurate simulation.

Instances with geometric constraints use four similarity degrees of freedom (a,b,tx,ty). InstancePoint residuals bind host points to transformed master points. Master propagation seeds movable host attachers from updated master coordinates before solving dependents, preventing stale coordinates from spuriously rescaling instances. Dismembering transforms supported constraint targets, remaps point/scalar identity, and carries measurement-scale factors separately from scalar readout values.

The host display tessellates curves and stroke lettering, clips screen-space segments, samples 1024-address spots with bounded Bresenham traversal, and applies an exponential afterglow model. The same host display list feeds Canvas 2D or WebGPU; neither executes the original TX-2 display-generation code.

## Boot, trap, and source-view additions in 0.3.0

The machine path can now be `native/explicit source → image → binary tape → ROM plugboard → reader leader → loaded user program`. `bootTape` is a media/reset API, not a substitute CPU instruction: it does not install the user's words or the reader leader in RAM. ROM instruction execution performs initialization and loading. The tape parser is a separate, nonexecuting inspection API; boot does not require the parser to approve bytes, allowing tests of the original loader's own checksum branches.

Memory references carry an explicit phase: execute, defer, operand, or register. TRAP uses the old metabit, so an instruction does not trap on a mark it has just applied. Read/modify/write shares one operand-reference observation. Internal A–E register writes are not treated as fresh operand references. All marks, flags, sequence interlocks and circuit reports participate in the same reverse journal/state transaction. P keeps its 18th placekeeper bit across ordinary jumps and increments; physical fetch uses the lower 17 bits.

PETR models physical frame arrival independently of consumption. A jump in virtual time catches up in O(1), drops overwritten buffer contents and records missed data. Whole-machine snapshots own media bytes; per-instruction snapshots retain only the cursor, buffer and transport state. This is not cycle-accurate motor simulation.

The source scanner creates a lossless parsing view before native glyph normalization. Both frontends share aggregate source-budget accounting, including every explicit include invocation. Source offsets refer to original UTF-16 text; archive identity still applies to the original UTF-8 bytes rather than normalized text.

Run evaluates breakpoints at the actual fetch address after pending priority/device transitions. When a transition reaches a breakpoint without executing an instruction, the debugger records a `boundary` history event: it can restore the flags, E report, placekeeper and virtual time independently, without incrementing the instruction count. Ordinary single-step still executes through a breakpoint. Repeated stationary breakpoint checks do not add no-op history entries.
