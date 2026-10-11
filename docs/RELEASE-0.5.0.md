# 0.5.0 — Gate-driven boot, resident GPU and adaptive electronics

The optional hardware workbench now runs sequence control and supported INOUT devices from its structural gate model, including priority flags, placekeepers, HOLD/dismissal/LIMBO, TRAP, tape reader, scope, light pen and punch. The published plugboard and reader leader load authored diagnostics from tape without host payload preloading. Complete original Sketchpad execution is still not demonstrated.

The GPU-resident backend advances gates, flip-flops, RAM and gate-built devices in bounded WGSL batches. Host inspection mirrors are updated only from validated journals. RAM-dependency partitioning removes duplicate combinational evaluation: the verified 9,020-clock bootstrap fell from 903,339,906 to 451,669,953 gate evaluations. Software-adapter elapsed measurements are documented separately; physical-GPU speedup is not claimed. CPU execution uses packed typed-array schedules and CSR dirty fanout.

Adaptive electrical integration adds backward-Euler step doubling, separate voltage/current tolerances, internal PWL breakpoints and atomic observation intervals. Mixed-signal sampling preserves exactly one digital clock per requested interval. Regression fixes prevent the session from prematurely ending an adaptive interval at a source knot. Fixed-step behavior remains available unchanged.

The browser adds gate-I/O scope/pen interaction, trace/sequence inspection, tape-boot selection, snapshot configuration restoration, resident backend selection and an adaptive RC example. The original drawing and instruction workspaces remain independent; hardware is off until explicitly enabled.

Validation: 358 Node tests, 33 original-workspace and 24 hardware-browser workflows, strict TypeScript and isolated installed SDK consumers. CI additionally requires actual resident WGSL conformance, full tape bootstrap and full reverse on a supported adapter. See [VALIDATION.md](VALIDATION.md) for measured runs and report paths.

Remaining fidelity work includes original circuit-card transcription and component characterization, magnetic-core/analog CRT/pen physics, complete alarms and all devices/configurations, remaining M4 manuscript semantics, original-program assembly/replay and exact historical visuals. The digital pen is geometric, not photometric; default RAM/media/trace storage use explicit macros. Logical clocks are not measured historical electrical timing.

[Hardware/SDK contracts](HARDWARE.md) · [Gate boot and I/O](GATE-IO.md) · [Compatibility](COMPATIBILITY.md)
