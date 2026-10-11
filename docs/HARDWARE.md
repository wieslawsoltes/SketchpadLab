# Hardware laboratory — 0.4.0

The optional hardware laboratory runs independently of the drawing reconstruction and the existing instruction-level TX-2 emulator. It is off by default. Opening **Hardware** allocates no simulator; **Enable & build** starts a dedicated worker. Closing the panel pauses it, and **Power off** terminates the worker and releases its storage.

**This is working structural/electrical research simulation, not a complete historically exact TX-2 netlist. The gate board does not boot the original Sketchpad program.**

## Models

| Mode | What actually executes | Limits |
| --- | --- | --- |
| Clocked digital | Validated 0/1/X/Z gates, levelized dirty propagation, simultaneous flip-flop sampling, explicit RAM ports | Ideal logical edges, no propagation/setup/hold timing |
| Timed digital | Stable event heap, inertial or transport delays, same-time input batches and zero-delay delta cycles | Specified delays, not transistor voltages; explicit gate/flop storage, no RAM macros |
| TX-2 gate board | Gate-built opcode decode, fetch/resolve/execute control, effective addresses, registers, exchanger and ALU | Synthesized research topology; single-sequence operation and explicit unsupported-case faults |
| Electrical | Modified-nodal equations, backward-Euler RLC transients, Shockley diodes, Ebers–Moll NPN/PNP models and damped Newton iteration | Generic parameters, dense bounded solver; no parasitics, breakdown, thermal or magnetic-core model |
| Mixed signal | Held DAC voltages, electrical integration, threshold/hysteresis ADC sampling, then a simultaneous digital clock | Sample-and-hold coupling, not analog evaluation of all Boolean gates |

The CPU digital backend evaluates only dirty fanout gates. The optional WGSL backend evaluates each dependency level in a distinct dispatch using the same four-state truth table. It does **not** call the instruction emulator. Storage commits remain explicit host boundaries. A GPU error restores committed storage and is reported; there is no silent CPU-execution fallback.

The default remains CPU gates because readback and dispatch costs can outweigh GPU parallelism for a single sequential board. The extended board has 1,030 dependency levels, including the unrolled divider. A GPU option is not a speedup claim.

## TX-2 research board

The compact board supports 37 opcode families. Extended arithmetic adds 11, for 48: multiply/divide, cycle/scale, normalize and tally networks. Carry-lookahead addition, carry-save multiplication, restoring division, barrel shifts, four fracture forms and 512 system-configuration values are elaborated into wire connectivity. No native integer ALU is used to manufacture the board's execution results.

The standard extended configuration currently elaborates **214,395 gates and 1,736 flip-flops**. Its full address-space allocation contains 4,849,664 RAM/metabit cells in behavioral macros. These counts describe this synthesized implementation, not historical component counts.

**STUV RAM macro** is the practical default. **256-word gate RAM** replaces both data and metadata arrays with explicit flip-flops, write decoders and read multiplexers. Library callers may select bounded gate-RAM depths up to 512 words. Neither storage option models magnetic cores electrically.

The gate board intentionally rejects INOUT/OPR/TSD, sequence-changing control forms, unimplemented arithmetic cases, and unsupported memory references. It does not implement sequence scheduling, TRAP 42, authentic tape transport, or the complete console/peripheral electronics. Those features must not be inferred from the separate instruction emulator's capabilities. Fetch/resolve/execute clocks are logical boundaries, not historical TX-2 cycle times.

A corrected address-validation regression covers a non-deferred operand whose raw address lies outside installed RAM but whose indexed effective address lies inside it. The converse still faults before register writeback.

## Browser workflow

Choose a TX-2 assembly example, a timed NAND latch/ring oscillator, an RC circuit, an NPN inverter, or a transistor/flip-flop mixed model. Select the backend and memory implementation, then build. Clock/step and instruction-step are distinct. Run is bounded, yields to Pause, and supports an octal instruction breakpoint. The existing Sketchpad model and instruction debugger are not reset.

The workbench includes sampled logic/voltage/current traces, driver-cone inspection, checkpoints, clock/event reversal, source editing, portable snapshot import/export and structural-wiring export. Driver-cone inspection shows the state at the explicit Probe action. VCD uses one nanosecond per logical-clock index as an interchange scale; it does not assert a physical board clock period. Electrical trace JSON explicitly labels SI units.

Failed builds leave the previous circuit available for inspection but prevent execution against edited, unbuilt source. Snapshots validate circuit identity, storage, events and resource limits before being accepted. Power off is the escape hatch for a long construction/solve operation.

## Standalone package

```sh
npm run package:hardware
npm install ./artifacts/sketchpad-lab-hardware-sim-0.4.0.tgz
```

```js
import {NetlistBuilder, DigitalSimulator, TX2GateBoard} from '@sketchpad-lab/hardware-sim';
import {assemble} from '@sketchpad-lab/hardware-sim/assembler';

const b = new NetlistBuilder('counter');
const counter = b.register('count', 8);
counter.connect(b.add(counter.q, b.constant(1, 8)).sum);
b.output('count', counter.q);
const circuit = new DigitalSimulator(b.compile());
circuit.run(259);
console.log(circuit.read('count')); // 3n: evaluated from gates and flip-flops
circuit.back();

const image = assemble('.org 100\nLDA 200\nADD 201\n.org 200\n.word 0d1963\n.word 0d2026');
if (image.diagnostics.length) throw new Error(JSON.stringify(image.diagnostics));
const board = new TX2GateBoard(image, {extended: true, depth: 256});
board.stepInstruction();
board.stepInstruction();
console.log(board.state().A); // 3989n
```

The tarball includes all transitive modules and TypeScript declarations; it does not rely on repository-relative workspace installations. The combined TX-2 toolchain also exports this API from `@sketchpad-lab/tx2-toolchain/hardware`. No runtime dependency, server, API key, or GPU is required for CPU use.

## Validation and evidence

```sh
npm run test:hardware
npm run package:hardware
npm run test:hardware-package
npm run build
npm run test:hardware-browser -- --gpu
# For a capable validation host, require actual shader execution:
python tests/hardware_browser.py --gpu --require-gpu
```

Tests compare all 512 exchanger configurations with the independent instruction implementation, exercise compact/extended instruction families, and check analytic RC/RL curves, diode KCL, NPN/PNP states, mixed-signal coupling, timing cancellation, snapshot rejection and reversal. Such differential tests do not establish historical electrical accuracy.

The optional GPU test executes all 704 four-state gate cases and compares 16 GPU-clocked storage transitions plus reversal when an adapter is available. Missing/blocked adapters are recorded as unavailable. An available adapter producing wrong results fails the suite; `--require-gpu` also rejects unavailability. Physical-GPU performance/accuracy is not inferred from software-adapter execution.

## References

- TX-2 Technical Manual and Users Handbook: https://tx-2.github.io/documentation/
- Attributed instruction/exchanger reference implementation: https://github.com/TX-2/TX-2-simulator
- WebGPU synchronization and usage scopes: https://www.w3.org/TR/webgpu/
- WGSL: https://www.w3.org/TR/WGSL/

Original circuit-card transcription, component characterization, physical timing, core-memory behavior, complete I/O, and original-program replay remain separate acceptance requirements.
