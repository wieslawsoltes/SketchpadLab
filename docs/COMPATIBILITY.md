# Compatibility and authenticity — 0.5.0

The project has separate implementations, not one interchangeable level of fidelity. A regression pass or a gate count does not prove equivalence with historical TX-2 electronics.

| Implementation | Executes | Verified boundary |
| --- | --- | --- |
| Drawing reconstruction | Newly authored geometry, constraints, rings, text and master-instance workflows | Not the original Sketchpad executable or a certified pixel-identical console |
| Instruction emulator | Exact 36-bit instruction semantics and optional sequence/peripheral models | Instruction-level research; per-operation/configuration restrictions remain |
| Structural gate board | Wire connectivity, gates, flip-flops, RAM boundaries, control sequences and supported peripherals | Synthesized logical topology, not original circuit-card transcription |
| Timed gate engine | Four-state events with specified propagation delays | Not analog transistor voltages or measured historic timing |
| Electrical/mixed engines | RLC and generic diode/BJT equations, fixed/adaptive integration, explicit digital coupling | Bounded numerical models, not a transistor-accurate whole TX-2 |

## Original program

No complete unmodified recovered Sketchpad listing has been successfully assembled, linked, booted and replayed here. The host drawing is newly written. The **published plugboard and 20-word reader leader** execute in the instruction and gate implementations to load authored diagnostics; the bootstrap is not the full Sketchpad application.

## Gate coverage added after 0.4.0

Priority sequences, flags, placekeepers, HOLD/dismiss/retry, LIMBO, IOS/TSD, supported tape/scope/pen/punch modes and TRAP marking/interlocks are now structural circuits. They also run in GPU-resident storage, with validation of full bootstrap and reversal. They are no longer merely capabilities of the instruction emulator.

Unsupported cases still fault: deferred JMP, AOP/unknown instructions, remaining exceptional arithmetic/configuration cases and unimplemented device/control modes. Full alarm circuitry, Lincoln Writer, other input/display channels, magnetic tape, original plotter/console-reset wiring, physical END MARK transport and motor dynamics are not implemented. RAM and external-media macros are not magnetic-core electronics. Scope/pen modeling is digital geometry and dwell logic, not analog optics.

GPU barriers synchronize the one cooperating workgroup used for each resident circuit. This is not unlimited whole-device parallelism. Software-adapter results do not certify physical-GPU acceleration. Logical clock parameters are not historical timing measurements.

Adaptive electrical error estimates control local discretization error, not global solution error or original-device fidelity. Component parasitics, breakdown/thermal behavior, original component characterization and magnetic-core physics remain absent.

[Gate contracts and modes](GATE-IO.md) · [Engine/SDK contracts](HARDWARE.md) · [Current validation](VALIDATION.md)

The retained [instruction/drawing ledger](INSTRUCTION-COMPATIBILITY.md) describes the earlier instruction, assembler, drawing and visual implementations. Its statements such as “not an electrical/gate model” apply to those instruction-level components, not to the independent optional gate engine. Those historical release counts are not current test totals.
