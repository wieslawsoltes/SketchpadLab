export const PROGRAMS = {
    'Accumulator': `; TX2-Lab dialect. Integers are octal unless prefixed 0d.
; This is a newly written diagnostic, not original Sketchpad.
.org 100
.entry START
START: LDA LEFT
       ADD RIGHT
       STA ANSWER
STOP:  JMP STOP
.org 200
LEFT:  .word 0d1963
RIGHT: .word 0d2026
ANSWER: .word 0
`,
    'Index loop': `; Sum 1..8 decimal, using real TX-2 index instructions.
; JPX tests the OLD index, then adds the signed five-bit CF.
.org 100
.entry START
START: SKX_1 7
       LDA ZERO
LOOP:  ADD_1 DATA
       JPX^-1_1 LOOP
       STA ANSWER
STOP:  JMP STOP
.org 200
ZERO:  .word 0
ANSWER: .word 0
DATA: .word 1, 2, 3, 4, 5, 6, 7, 10
`,
    'Exchange quarters': `; Standard F[01] loads the right half; F[02] exchanges halves.
.org 100
.entry START
START: LDA VALUE
       LDB^02 VALUE
       LDC^01 VALUE
       LDE^03 VALUE
STOP:  JMP STOP
.org 200
VALUE: .word 111222333444
`,
    'Vector diagnostic': `; NONHISTORICAL I/O endpoint, explicitly selected by profile.
; Actual TSD instruction encoding; transport is a diagnostic word stream.
; This is NOT the TX-2 display protocol and does not boot Sketchpad.
.org 100
.entry START
START: SKX_1 4
LOOP:  TSD_1 POINTS
       JPX^-1_1 LOOP
STOP:  JMP STOP
.org 200
POINTS: .word (0d40 << 0d18) | 0d40
        .word (0d220 << 0d18) | 0d40
        .word (0d220 << 0d18) | 0d220
        .word (0d40 << 0d18) | 0d220
        .word (0d40 << 0d18) | 0d40
`,
    'Macro assembly': `; Safe, bounded TX2-Lab macro expansion. Not full M4 syntax.
.macro TRANSFER source, target
  LDA \\source
  STA \\target
.endm
.org 100
.entry START
START:
TRANSFER SOURCE, DEST
STOP: JMP STOP
.org 200
SOURCE: .word 123456765432
DEST: .word 0
`,
    'M4 native macros': `** Newly written native M4 diagnostic; not original Sketchpad.
☛☛DEF MOVE|A→B
hLDE A
STE B
☛☛EMD
100|
START→ MOVE|{123456}→ANSWER
STOP→ JMP STOP
☛☛GOTO START
`,
    'TX-2 scope': `** Newly written INOUT scope diagnostic; not original Sketchpad.
** RXF establishes the scope sequence. The scope emits individual spots.
** This research profile uses a synthetic 5-us instruction quantum.
100|
START→ RXF₆₀ SCOPE
IOS₆₀ 30030
JPD #
SCOPE→ TSD {0}
TSD {144000000000}
TSD {144000144000}
TSD {144000}
STOP→ JMP STOP
☛☛GOTO START
`
};
