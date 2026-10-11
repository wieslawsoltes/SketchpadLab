# Optional hardware simulation

The hardware mode is developed separately from the default instruction-level TX-2 simulator. The existing Sketchpad reconstruction and instruction debugger remain unchanged by default.

## Fidelity contracts

1. **Instruction research**: the existing TX2 implementation executes instruction semantics. Its instruction counter is not a gate or electrical clock.
2. **Digital gate research**: an independently executed, structural netlist has explicit wires, Boolean gates, flip-flops, memory boundaries and clock edges. A TX-2-compatible research board must not call the instruction simulator to manufacture its results. Unsupported instructions/configurations must stop explicitly.
3. **Electrical research**: circuit voltages and currents are calculated by a transient circuit solver. Device parameters and circuit topology must be identified. Generic demonstration circuits are not claimed to reproduce the original TX-2 electronics.

An implementation of the simulation engines is not evidence of a complete historically exact TX-2 netlist. Original schematic transcription, component characterization, core-memory physics and independent measurements remain separate acceptance requirements. A fast GPU backend is not a reason to omit timing dependencies or silently change the model.

## Implementation plan

- Reusable, validated structural netlists and deterministic CPU execution.
- Optional WebGPU compute backend with identical digital truth tables and explicit synchronization.
- Clocked TX-2 research board whose datapath and control outputs are evaluated from gates.
- Bounded waveforms, snapshots, reproducible stepping and clear unsupported-operation diagnostics.
- Optional electrical transient analysis with convergence/error reporting.
- Browser hardware workbench, diagnostics, backend parity tests and performance measurements.

## References

- TX-2 Technical Manual, especially Volume 1 chapters 3–7 and Volume 2 chapters 8–15: https://tx-2.github.io/documentation/
- Published instruction-format and bootstrap reference implementations: https://github.com/TX-2/TX-2-simulator
- WebGPU and WGSL specifications: https://gpuweb.github.io/gpuweb/ and https://gpuweb.github.io/gpuweb/wgsl/

This document will be updated with implemented scope and measured validation before the pull request is marked ready.
