# Gate-driven sequences, INOUT and bootstrap — 0.5.0

The optional structural board executes independently of `TX2.step`, `TX2.execute` and instruction-level peripheral classes. Newly authored control/datapath topology is synthesized into gates; this is not a transcription of historical circuit cards.

## Implemented circuits

Sequence control includes priority selection, 33 valid sequence flags, K, X/TSP placekeepers, HOLD, explicit raise/lower, dismissal/retry, reports and LIMBO. Marked placekeepers and TRAP interlocks participate in boundary selection. Instruction stepping includes the appropriate sequence-boundary transition; logical-clock stepping exposes that transition separately.

Peripheral unit numbers and masks below are **octal**:

| Unit | Structural behavior | Mode boundary |
| --- | --- | --- |
| 42 | TRAP old-metabit detection, automatic marking, inhibition and sequence interception | Mode mask 0717; no complete alarm electronics |
| 52 | Buffer, countdown, free-running arrivals, overrun, rewind and normal/splayed transfers | Modes 0, 2, 0100, 0102, 0104, 0106; logical beginning-of-tape, no fabricated END MARK holes |
| 55 | Pen coordinates, signed distance/squaring/comparison and illumination-triggered flags | Mode 0; ideal circular geometric aperture, not photometry |
| 60 | Connected/ready handshake, signed coordinates, relocation and dwell countdown | Mode mask 0330; unsupported film/other control modes fault |
| 63 | Normal/splayed frame output, seventh-hole bit and ready countdown | Mode mask 6; bounded observation ring, not unlimited archival media |

Peripheral transfers outside the verified configuration-zero path fault. Non-INOUT TSD channels and the TRAP channel retain explicit supported cycle/dismiss behavior. Read-only console ports and external META are independently tested. CPU and GPU backends share the same gate connectivity, not host implementations of these device protocols.

`deviceOptions` periods are integer **logical-clock counts**. A 32-bit device clock and bounded scope/punch observation rings are part of the model. Scope records retain the low 24 clock bits; wrap and dropped-history counts are visible. `observeBoard` decodes those records for the UI and does not generate handshakes or device events.

## Real bootstrap, explicit abstractions

A boot board starts with empty payload RAM and zeroed F memory. The host supplies the published plugboard ROM and mounted tape bytes; it does not preload the compiled user payload. The executed SPG instructions initialize F, then tape-reader/splay circuits deliver the published 20-word reader leader. That machine code loads data blocks, checks the checksum, disconnects the reader and transfers control to the entry stub/program.

The regression fixture with `readerPeriod: 48` reaches entry after **9,020 logical clocks and 649 retired instructions**. Different modeled device periods change the clock count. A corrupt payload is rejected by the executing reader leader before entry, without relying on a host checksum validator. Every retained clock can be reversed, and an independent mid-boot snapshot resumes to the same result.

Mounted tape is a ROM macro; default STUV data/metadata and observation rings are RAM macros. They are explicit simulation boundaries, not gate/transistor models of magnetic cores. The small gate-RAM option builds each data/metabit from flip-flops and mux/decoder gates but is too small for full-address-space tape bootstrap.

## Public session example

```js
import {HardwareSession} from '@sketchpad-lab/hardware-sim';

const session = new HardwareSession();
await session.load({
  kind: 'board', backend: 'cpu', inout: true, boot: 'tape',
  extended: false, deviceOptions: {readerPeriod: 48},
  source: '.org 100\nLDA 200\nSTOP: JMP STOP\n.org 200\n.word 0d1963',
});
const loaded = await session.advance({budget: 100000, breakpoint: 0o100});
if (!loaded.powered || loaded.lastRun.reason !== 'breakpoint') {
  throw new Error('Bootstrap did not reach the requested entry');
}
await session.advance({operation: 'instruction'});
console.log(session.board.state().A); // 1963n, from gate execution
session.dispose();
```

Select `backend: 'webgpu-resident'` in a capable browser to keep forward circuit/storage execution on the GPU. Batches are bounded; the validated journal updates a host inspection mirror. No forward CPU gate or instruction call is used to manufacture its result. Pausing, external pen input, snapshots and reverse operate at safe batch boundaries; explicit edits invalidate device state for re-upload.

In the UI choose **Gate tape bootstrap**, **Gate scope / light pen**, or **Gate paper-tape punch**. The scope view draws emitted records, and pointer input changes sensor wires. It is not the original Sketchpad application drawing through this CPU.

## References and remaining acceptance work

Instruction-format, plugboard and reader-leader references are attributed in [SOURCES.md](SOURCES.md) and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md), including https://github.com/TX-2/TX-2-simulator and the manuals at https://tx-2.github.io/documentation/.

The complete original Sketchpad listing, all opcode/configuration cases, all peripherals and alarms, original circuit-card transcription, component characterization, magnetic-core behavior, analog CRT/pen circuitry and independently measured electrical timing remain separate acceptance requirements.
