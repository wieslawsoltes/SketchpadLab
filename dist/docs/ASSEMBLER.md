# Assembly frontends — 0.3.0

The toolchain emits TX-2 instruction bit patterns through two bounded frontends: a modern explicit dialect and a native M4 restoration subset. It is **not a complete implementation of original M4**. Use `assemble(source,{dialect:"explicit"|"m4"|"auto"})`; native hand directives, arrow tags and origin lines are auto-detected. `assembleM4` selects native parsing directly.

## Modern explicit dialect

Bare integers are octal. Prefixes `0d`, `0x`, `0b` and `0o` explicitly select decimal, hexadecimal, binary and octal. Values remain BigInt through parsing. Negative machine words are encoded in one's complement; a raw `777777777777` word denotes negative zero.

```asm
.org 100
.entry START
LIMIT = 7
START: SKX_1 LIMIT
LOOP:  ADD_1 DATA
       JPX^-1_1 LOOP
STOP:  JMP STOP
.org 200
DATA: .word 1,2,3,4,5,6,7,10
```

Canonical instruction syntax is `[h|u]OP[^configuration][_index] [*]address`. `h` sets hold and `u` explicitly clears it. LDE, ITE, JPX and JNX have the conventional implicit hold setting unless overridden. Disassembly prints an explicit `u` where omitting it would change the word on reassembly. A leading `*` or bracketed operand `[expression]` sets the deferred-address bit. Configuration `^-1` is encoded as a signed five-bit one's-complement value. `_1.9` identifies quarter 1, decimal bit 9 for bit operations; ordinary numeric indices remain octal.

Expressions support symbols, current location `#`, parentheses, unary `+ - ~`, and binary `+ - * / % << >> & ^ |`. Precedence is explicit in the Pratt parser. There are no function calls, property access, string execution, JavaScript evaluation or implicit filesystem includes.

Directives: `.org expression`, `.entry expression`, `.word expression,...`, `.fill count,value`, `.equ NAME,expression`, `NAME=expression`, `.assert expression`, `.include "supplied-name"`, `.macro NAME parameter,...` and `.endm`. An assertion succeeds for any nonzero integer expression; comparison operators are not part of this dialect.

```asm
.macro COPY source, destination
  LDA \source
  STA \destination
.endm
COPY INPUT, OUTPUT
```

Macro parameters use a backslash prefix and `%%name` creates a per-expansion local label. Includes are passed in the JavaScript `assemble(source, { includes: { name: text } })` options. Expansion limits reject recursive or oversized source. Forward labels and equality chains are resolved; duplicate and cyclic definitions are diagnostics rather than silently redefined symbols.

Superscript/subscript digits and selected `@sup_*@` / `@sub_*@` glyph markers are normalized only in a separate parsing view. Archival metadata and editorial brackets are not executable code. Native manuscript syntax belongs to the M4 frontend below; the explicit frontend deliberately retains its own macro and expression semantics. A recognized instruction mnemonic does not guarantee that the emulator implements that opcode.

Errors prevent an executable word list from being returned. Successful images contain address/word pairs, symbols, source maps, a listing and an entry address. `serializeImage`/`deserializeImage` use modern JSON, not PETR tape encoding. Raw six-bit frame helpers similarly do not implement a historical bootstrap format.


## Native M4 restoration frontend

```asm
☛☛DEF MOVE|A→B
hLDE A
STE B
☛☛EMD
100|
START→ MOVE|{123456}→ANSWER
STOP→ JMP STOP
☛☛GOTO START
```

The frontend interprets native origins, arrow tags, re-definable lazy equalities, superscript configuration and subscript index syllables, hold/not-hold, and deferred/pipe constructions. Greek/glyph markup is normalized in a separate parsing view; the archive's original bytes remain untouched. Bracketed editorial annotations and `**` comments are not executable instructions.

**Native arithmetic is left-to-right**, not the explicit dialect's precedence grammar. Field syllables combine by bitwise OR. Leading/trailing commas apply the 16-case word-quarter transformation chart, not comma-separated argument lists. Numbers may be octal, marked decimal or fixed-point. Signed words preserve one's-complement semantics.

DEF/DEFINE through EMD introduces native delimiter-separated macros. Compound-symbol macros, script arguments, nested expansions, omitted dummy suppression and expansion-local tags/equalities are supported. Indirect equality references to an omitted dummy produce zero; direct uses suppress their instruction. Nested register-containing literals allocate RC words; `#` in them refers to the RC location. Pipe indexing creates an actual deferred RC pointer. Unassigned address symbols can allocate zero RC words; unassigned index/configuration symbols can allocate slots. Use `autoAssign:false` for stricter experiments.

Includes must be supplied as explicit strings; there is no implicit filesystem or network access. Source size, depth and expansion budgets apply. Included files share one aggregate UTF-8 byte budget; cycles are diagnosed. GOTO and nonempty PUNCH/PUN select the entry. Output commands LIST/TYPE/DIR/BIN/NAME/SUM are retained as metadata only. Interactive source editing commands and unknown glyphs fault rather than being ignored.

Default division by zero is an unresolved-semantics diagnostic. The optional `zeroDivision:'zero'` chooses a restoration hypothesis explicitly; it is not a claim of authentic arithmetic. Do not use that switch to conceal a source or assembler discrepancy.

Result: words, symbols, original source locations and expansion stacks, listing, diagnostics, optional warnings/output-command metadata, and source statistics. Errors discard words/listing/source map. Neither success on these diagnostics nor source-byte identity proves that the entire recovered Sketchpad manuscript can be correctly linked and executed.

## Source locations and archival annotations

`scanAssemblySource` returns the original source, a same-length parsing copy, per-line UTF-16 start/end offsets, and recognized editorial ranges. It preserves LF/CRLF and does not rewrite the retained archive. Normal `**` comments are blanked; semicolon comments are enabled by the explicit frontend. Selected `[meta ...]`, `[Handwritten: ...]` and similar editorial records may nest and span lines. Unknown bracket prose is not silently deleted. `[ADDRESS]` remains an executable deferred operand.

## Tape output and CLI

```sh
node tools/assemble.mjs --tape --dialect m4 --no-auto-assign input.tx2 program.tape
# Installed package:
tx2-assemble --tape --include common=./common.tx2 input.tx2 program.tape
```

Include bindings authorize only the given local files. The compiler finishes assembly and encoding before opening the destination; failures leave an existing output unchanged. JSON image output remains the default without `--tape`. See [TAPE.md](TAPE.md) for framing, checksum arithmetic, reserved memory and bootstrap semantics.
