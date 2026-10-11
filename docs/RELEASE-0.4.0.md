# 0.4.0 — Optional independent hardware laboratory

## Implemented

- Independent clocked four-state gates, validated structural netlists, simultaneous storage commits, bounded reverse journals and VCD export.
- Timed inertial/transport evaluation, stable event ordering, delta cycles and rejected nonconvergent/over-budget runs without partial state mutation.
- Synthesized TX-2 research board: compact 37-op configuration, 48-op extended arithmetic, 512 configuration values, explicit gate RAM or behavioral RAM macros, unsupported-operation faults without instruction fallback.
- Backward-Euler RLC transients, damped Newton diode/BJT equations and explicit sample-and-hold digital/analog co-simulation.
- Optional WebGPU level dispatch with a shared four-state truth table and rollback on GPU failure. Host storage boundaries remain explicit; speedup is not assumed.
- Off-by-default browser worker, bounded run/pause/step/reverse, breakpoints, source editing, waveforms, driver inspection, portable snapshots and wiring/trace exports.
- Public hardware API, strict declarations, standalone hardware tarball and the combined toolchain's `/hardware` export.

## Completion and correctness fixes

Non-deferred gate address resolution no longer rejects an unused raw address before applying its index. A reproducing regression distinguishes an indexed target inside installed memory from one outside it. The old gate implementation fails the valid-target case; the corrected implementation passes both.

CI archives source identity and checksums, tests the actual installed tarballs, and runs original-console and hardware-browser workflows. Generated distributions are rebuilt from the tested sources, not treated as authoritative stale checked-in releases.

## Validation

Local validation: 298 Node regression tests, 33 original-workspace browser workflows, 17 hardware-browser workflows, strict source and isolated-package TypeScript consumers, and offline runtime package installation. Browser hardware checks cover extended arithmetic, explicit flip-flop RAM, propagation-delay circuits, electrical/mixed models, failed builds, snapshots, breakpoints, pause and mobile layout.

The GPU harness uses the actual WGSL source, covering 704 four-state truth cases, 16 clocked storage comparisons and reversal when a supported adapter is available. The local browser's navigation policy prevented creating a trustworthy GPU context; local physical-GPU execution is not certified. CI emits a separate report of what its adapter actually executed. Missing adapters are not silently counted as GPU passes.

## Fidelity boundary

This is not a complete original TX-2 gate/electrical model and does not boot unmodified original Sketchpad. The synthesized topology and logical clocks are not the original circuit-card netlist or measured timing. Gate-board sequence scheduling, INOUT, TRAP and tape boot remain unsupported. Electrical component characterization, parasitics, thermal/breakdown effects and magnetic-core physics are not implemented. The earlier instruction emulator's separate peripheral/boot support does not remove these boundaries.

See [HARDWARE.md](HARDWARE.md) for the model contracts, SDK usage and detailed exclusions.
