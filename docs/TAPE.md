# Standard reader-leader tapes — 0.3.0

The toolchain can compile new code into a binary tape file and execute the published TX-2 plugboard and reader leader to load it. This is a real emulated instruction path, **not a demonstrated boot of the complete original Sketchpad program**.

## Compile, inspect, boot

```js
import {
  assembleM4, encodeBinaryTape, decodeBinaryTape, TX2
} from '@sketchpad-lab/tx2-toolchain';

const image = assembleM4(`
100|
START→ LDA 200
STOP→ JMP STOP
200|
123
☛☛PUNCH START
`, {autoAssign: false});
if (image.diagnostics.length) throw new Error(JSON.stringify(image.diagnostics));

const tape = encodeBinaryTape(image);
const decoded = decodeBinaryTape(tape); // Checks all blocks; never executes them.
console.log(tape.length, decoded.blocks.length); // 186 bytes, 3 blocks

const machine = new TX2({profile: 'tx2-io-research'});
machine.bootTape(tape);
machine.breakpoints.add(image.entry);
const result = machine.run({budget: 5000});
if (result.reason !== 'breakpoint') throw new Error(machine.reason);
console.log(result.executed, machine.P.toString(8)); // 649, "100"
machine.step();
console.log(machine.getRegister('A')); // 83n, or octal 123
machine.back();
```

`bootTape` first validates/copies the mounted media, resets writable RAM and configuration memory, mounts PETR and places P/TSP at octal **377750**. It does **not** install the user's image or reader leader in RAM. Eight SPG instructions initialize the standard configuration. The following ROM routine connects reader 52, then its TSD/index loops read the leader into locations **003–026**. The leader subsequently loads program blocks, checks their checksums and jumps through the generated disconnect/start block.

The 649 count is an **executed-instruction count for this diagnostic**. It is not a historical runtime benchmark. Device waits use virtual time and instructions use the research profile's synthetic five-microsecond quantum.

## File format

A word contains 36 data bits. It is represented by six successive tape frames. For each incoming frame, the low six bits enter word bit positions 0, 6, 12, 18, 24 and 30 after the preceding accumulated data shifts left. After six transfers the original 36-bit word is reconstructed. `unsplayWord` and `cycleAndSplay` are inverse building blocks.

The default encoder sets **0x80** in each file byte, following the inspected TX-2 project's binary-file convention. This is a file marker, not a seventh CPU data bit. `marker:0` and `marker:0x40` are also accepted; the low six data bits are what this file reader consumes. Actual seventh-channel control-code and END MARK processing are not implemented.

The file begins with the **20 published reader-leader words**, without a block header. The remaining words are blocks:

| Word | Left 18 bits | Right 18 bits |
|---|---|---|
| Header | 1 minus payload length, one's complement | Last destination address |
| Payload | Raw program/data words | Raw program/data words |
| Trailer | Checksum balance, one's complement | Continuation address |

The checksum is the one's-complement 18-bit sum of **both halves of every word**, including the header and trailer. Both zero encodings are numerically zero. It is **not** a two's-complement checksum modulo 2^18.

Continuation **003** requests another block. The encoder's final continuation is **027**, which enters the generated two-word block at 027/030: disconnect PETR, then JPQ to the chosen entry. That block comes before user blocks; deliberately supplied user words at 027/030 can supersede it. Such replacement is permitted by the file builder but is not a guarantee that the replacement boot will complete.

## Validation and bounds

The builder rejects empty/failed images, invalid entries, overlapping addresses, non-36-bit words and addresses outside writable STU memory. It refuses user words in **000–026**, because they would overwrite the resident loader or its working cells. Entry must refer to a word actually present in the image.

The decoder checks leader identity, whole six-frame words, header ranges and lengths, truncation, every checksum, continuation addresses and trailing data. It returns nothing executable on failure. Inputs are bounded to 16 MB. `requireLeader:false` permits inspecting a stream of blocks without the leading loader words.

These checks are independent of the CPU: the boot API does not call the decoder. A regression deliberately corrupts a payload and verifies that the **executed reader leader's JPX/JNX checksum checks** restart the ROM read-in routine before entering user code.

## Transport and reversibility

PETR modes 0100/0102 start normal/assembly reading; 0104/0106 rewind to a logical beginning and then read. Modes 0/2 retain the prior diagnostic stream API. All mode/unit numbers here are octal. Frame arrival follows the motor clock rather than CPU consumption. Overwritten unread frames set missed-data state. Catch-up after a virtual-time jump is O(1).

The rewind model uses stream position and a logical beginning-of-file event instead of the physical END MARK. Acceleration, deceleration and all control-channel cases remain unimplemented. No physical tape speed or electrical conformance is certified.

Reverse execution restores registers, memory/parity/metabits, mode, buffer, cursor, transport direction/deadline, flags and virtual time. Mounted media is immutable during a run and belongs to whole-machine snapshots, not each instruction journal. RESET in the UI clears and reboots the mounted tape; it does not silently switch back to direct RAM loading.

## CLI

```sh
node tools/assemble.mjs --tape --dialect m4 --no-auto-assign program.tx2 program.tape
node tools/assemble.mjs --include common=./common.tx2 program.tx2 program.tx2.json
# Same interface after installing the standalone package:
tx2-assemble --tape program.tx2 program.tape
```

Without `--tape`, output is the existing modern JSON image. Includes authorize only explicit NAME=PATH bindings. Assembly and output encoding finish before the destination is opened; compile/encoding errors do not overwrite an existing output file.

Reference: Users Handbook §5-5.2 and the attributed TX-2 Simulator interpretations listed in SOURCES.md and THIRD_PARTY_NOTICES.md.
