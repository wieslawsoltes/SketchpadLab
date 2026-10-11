# Attribution and source boundaries

## Ivan Sutherland's Sketchpad

The application is named for Ivan Edward Sutherland's **Sketchpad: A Man–Machine Graphical Communication System**, described in his January 1963 MIT thesis. This is an independent reconstruction and preservation workbench, not an official release, a recovered original binary, or a claim of endorsement by Sutherland, MIT, the Computer History Museum, or the TX-2 preservation project.

The recovered source transcriptions are maintained at https://github.com/TX-2/Sketchpad . The original listing bytes are **not bundled or relicensed** in this distribution. The optional fetcher retrieves identified Git blobs from that repository without modifications. Review the upstream archive's terms and attribution before redistributing those historical materials. SHA-1 is used as a Git content identity check, not as a signature or a proof that a transcription is historically correct.

No historical photographs, scanned manual pages, fonts, or audio/video footage are included in the application. The interface and example drawings are newly authored. The drawing solver and ring arena are new implementations, not Sutherland's program translated into JavaScript.

## TX-2 Simulator Project — MIT-licensed reference implementation

Repository: https://github.com/TX-2/TX-2-simulator
Reference revision inspected: `8757845b8aeb1777c73ee2b9ad2885dd66e26288`.

The instruction table, standard configuration constants, exchange permutations and sign-extension behavior, mapped register addresses, instruction semantics and deferred-address logic were developed with reference to the TX-2 manuals and the project's Rust implementation. Portions of the logic are adapted from that implementation. Relevant files include `base/src/instruction.rs`, `base/src/types.rs`, `cpu/src/exchanger.rs`, `cpu/src/memory.rs`, `cpu/src/control.rs`, the `cpu/src/control/op_*.rs` instruction modules, `assembler/src/asmlib/ast/asteval.rs` (M4 comma transforms), and `base/src/splay.rs` (six-frame splay mapping). New 0.3.0 references/adaptations additionally include `cpu/src/control/trap.rs`, `cpu/src/io/dev_petr.rs`, `assembler/src/asmlib/readerleader.rs` (published numeric reader-leader words), and `assembler/src/asmlib/driver/output.rs` (binary framing and checksum interpretation). `cpu/src/memory.rs` also supplies the published 32-word plugboard listing. Those words are retained as numeric machine code; they are not a recovered Sketchpad binary. This distribution does not embed, compile, or run the complete upstream simulator.

Upstream MIT permission notice, reproduced from `LICENSE-MIT`:

```text
Copyright (c) 2021-2025 The TX-2 Simulator Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

// SPDX-License-Identifier: MIT
https://opensource.org/license/MIT
```
