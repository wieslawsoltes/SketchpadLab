# Optional hardware laboratory — 0.5.0

Opening **Hardware** leaves the default drawing and instruction workspaces intact and allocates no hardware worker. **Enable & build** starts the selected independent model. Close pauses; **Power off** releases its worker and storage. This is working research simulation, not a complete historical TX-2 transistor reconstruction or a boot of the original Sketchpad application.

## Choose the execution abstraction

| Model/backend | Forward execution | Explicit boundary |
| --- | --- | --- |
| CPU clocked gates | Validated four-state gates, packed schedules/CSR dirty fanout, simultaneous storage commits | Ideal logical edges, no analog voltages |
| `webgpu` | One dispatch per dependency level; gate truth-table evaluation | Host flip-flop/RAM commits |
| `webgpu-resident` | Gates, flip-flops, RAM and gate-built peripherals in bounded GPU batches | One cooperating workgroup per circuit; validated host inspection journal per batch |
| Timed logic | Stable event heap, inertial/transport delays and delta cycles | Specified delays, not measured original electronics |
| Electrical | Modified-nodal RLC, Shockley diodes and Ebers–Moll NPN/PNP with damped Newton iteration | Generic parameters, bounded dense solver |
| Mixed signal | Held DAC voltages, electrical integration, ADC sampling, digital edge | Sample-and-hold coupling, not analog solving of every Boolean gate |

The structural board includes compact 37-operation or extended 48-operation datapaths. INOUT adds OPR/IOS and TSD and enables structural sequences, TRAP, reader, scope, pen and punch. [Gate-I/O contracts](GATE-IO.md) describe exact supported modes and boot behavior. Unsupported operations/configurations stop rather than falling back to an instruction interpreter.

RAM macros are the practical default. The small gate-RAM option explicitly instantiates its data/metabit flip-flops, read multiplexers and write decoders. Neither represents magnetic-core physics. Gate counts describe a synthesized implementation, not historical component counts; the current model's statistics panel reports its exact topology.

## Resident scheduling and performance

The resident shader uses one 64-invocation workgroup. Dependencies synchronize with storage barriers within that cooperating group; no cross-workgroup barrier is assumed. A packed topological schedule is partitioned at the asynchronous RAM read boundary. Only gate ancestors of RAM addresses run before the read; all other gates run afterwards. Every gate executes **once per settle**, without using stale RAM reads or modifying arithmetic semantics. RAM address feedback requires a register boundary and is rejected during validation.

The schedule compiler is iterative O(wires + gates + edges). Batches are bounded by requested clocks, work and journal capacity. The host receives committed wire/probe state and reversible memory journals once per batch. Unchanged RAM is not repeatedly uploaded. Device loss, validation faults, invalid controls and conflicting host edits reject the batch; errors do not silently select another backend. Direct typed-array edits require `GPUResidentSimulator.invalidate()`; supported simulator mutations advance revision counters automatically.

CPU dirty propagation remains the default. GPU speedup is workload/adapter dependent. The release validation includes actual resident tape bootstrap, full reversal, multiple RAM banks, X/Z truth cases and mutation guards on SwiftShader. This is actual WGSL execution on a software adapter, not physical-GPU performance certification. See [measurements](VALIDATION.md).

## Adaptive electrical integration

The existing fixed-step solver remains unchanged by default. Add this JSON member to an electrical circuit (or the `circuit` inside a mixed model) to enable internal step control:

```json
"integration": {
  "mode": "adaptive",
  "relativeTolerance": 0.00001,
  "voltageTolerance": 0.000001,
  "currentTolerance": 0.000000001,
  "minStep": 1e-15,
  "maxTrials": 10000
}
```

Each trial compares one full backward-Euler step with two half steps. Accepted state is the two-half-step result, with no extrapolation. Voltage/current tolerances normalize the local error estimate. Source slope changes are exact internal boundaries. This estimates local discretization error, not a guaranteed global error bound or physical component accuracy.

One successful `step(dt)` commits exactly the requested observation endpoint and one reverse entry. Failed nonlinear/trial/minimum-step intervals restore all public state, even after internal steps were accepted. In mixed mode internal subdivisions do not add ADC samples or digital edges. Session source-breakpoint handling preserves that same outer interval. Fixed mode remains byte-compatible with the earlier solver when no integration setting is supplied.

```js
import {AdaptiveElectricalSimulator} from '@sketchpad-lab/hardware-sim';
const simulator = new AdaptiveElectricalSimulator({
  integration: {mode: 'adaptive', relativeTolerance: 1e-5},
  nodes: ['0', 'in', 'out'],
  components: [
    {name:'V', type:'V', p:'in', n:'0', source:5},
    {name:'R', type:'R', p:'in', n:'out', value:1000},
    {name:'C', type:'C', p:'out', n:'0', value:1e-6},
  ],
});
const interval = simulator.step(0.001);
console.log(interval.time, simulator.voltage('out'), interval.integration);
simulator.back(); // Reverses the entire observation interval.
```

Node/saturation models do not include original transistor characterization, parasitic capacitances, breakdown, thermal feedback or core-memory effects. The solver is bounded and dense; it is not advertised as a full-machine transistor solver. Power off terminates its worker when a construction/solve is too long for interactive use.

## Debugging, files and packages

Clock and instruction steps remain distinct. Bounded runs yield for pause; breakpoints stop at fetch. Source edits disable stale-source execution. Checkpoints, imported snapshots, clock/event reversal, VCD and structural-wiring exports are available. Driver inspection reports the actual driver cone at Probe time. Analog trace JSON labels seconds, volts and amperes. VCD's nanosecond scale for logical-clock indices is an interchange convention, not a calibrated machine clock.

```sh
npm run package:hardware
npm install ./artifacts/sketchpad-lab-hardware-sim-0.5.0.tgz
```

The self-contained package includes all transitive modules and strict declarations; the combined toolchain also exports `/hardware`. CPU use requires neither browser globals nor GPU access. No registry publication is implied. Public `ElectricalSimulator` remains the fixed base implementation; `AdaptiveElectricalSimulator` exposes adaptive behavior explicitly, while sessions honor circuit metadata.

[Bootstrap SDK example](GATE-IO.md) · [Validation](VALIDATION.md) · [Compatibility](COMPATIBILITY.md)

Synchronization reference: https://www.w3.org/TR/WGSL/#synchronization-builtin-functions. Hardware references and attribution are listed in [SOURCES.md](SOURCES.md).
