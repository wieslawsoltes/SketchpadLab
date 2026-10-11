# Sources and historical target

Research updated: 11 October 2026. Target concept: Ivan Edward Sutherland's original two-dimensional Sketchpad on the Lincoln TX-2, as described in the 1963 thesis/report and surviving listings. No claim is made that the alternate `sk2` transcription represents a chronologically later release or that Sketchpad-III is part of the same target.

## Primary description

Ivan E. Sutherland, *Sketchpad: A Man–Machine Graphical Communication System*, January 1963. Cambridge's 2003 typeset reissue, UCAM-CL-TR-574:
https://www.cl.cam.ac.uk/techreports/UCAM-CL-TR-574.pdf

The thesis text, including its constraint/control descriptions, was consulted. This continuation did not successfully render the PDF figures; no visual verification of those PDF pages is claimed. The implementation uses them as historical references, not copied art assets. The original ring operations and relaxation discussion inform the conceptual separation between geometry, constraints and display; the actual JavaScript structures and numerical solver are newly authored.

## Surviving program listings

Repository: https://github.com/TX-2/Sketchpad
Transcription/assembly notes: https://github.com/TX-2/Sketchpad/blob/main/doc/assembling.md
Format notes: https://github.com/TX-2/Sketchpad/blob/main/doc/format.md

Pinned Git blobs:

| Listing | Exact byte length | Git blob SHA-1 |
| --- | ---: | --- |
| sk.tx2as | 239176 | 01e3c1bd9ea8b024098d6dea152c13f191e37b0a |
| sk2.tx2as | 238611 | 45bfd756ae7a18148645de0ac99a6689c4e10906 |

The original file bytes are not included in this artifact. The opt-in fetcher retrieves the blobs directly, computes SHA-1 over `blob <byte-length>\0` followed by the exact bytes, and checks the recorded length. Newline conversion, glyph substitution and removal of editorial comments would change this identity and are therefore not applied to the retained original bytes.

The TX-2 preservation project describes its lack of a known-correct original source or binary and the difficulty of verifying scanned listings:
https://tx-2.github.io/software/

The source repository contains a transcription, not a demonstration that this distribution can boot it. A matching blob verifies retrieval, not the accuracy of every transcribed character.

## Hardware documentation

The primary-document index links the TX-2 Users Handbook (including the August 1963 opcode chapter), the three-volume TX-2 Technical Manual, and TX-2 Introductory Notes:
https://tx-2.github.io/documentation/

The implementation consulted documented instruction word fields, STUV mapping, A–E register addresses, configuration/permutation/activity/fracture behavior, index addressing, indirect pointer words, and the standard configuration plugboard. Hardware design changed over time; opcode 044 is not inferred from the inconsistent older index.
https://tx-2.github.io/commentary/opcode-changes

## Reference implementation

https://github.com/TX-2/TX-2-simulator
Inspected revision: `8757845b8aeb1777c73ee2b9ad2885dd66e26288`.

This MIT-licensed Rust project supplied useful readable interpretations and tests of the manuals. It is itself an ongoing preservation implementation, not a substitute for independent hardware validation. See THIRD_PARTY_NOTICES.md for attribution and the applicable permission notice.


## Console photographs and visual limits

Lincoln Laboratory's photo release is indexed at https://tx-2.github.io/photographs.html . Console and indicator photos inform the cabinet's appearance. The page distinguishes older photographs from December 1963 hardware that may be displaying Sketchpad-III. The application does not conflate that later program with the original two-dimensional Sketchpad target. Exact panel dimensions, pushbutton physical ordering and every legend remain reconstruction choices.

## M4 and peripheral references used in 0.2.0

The November 1963 Users Handbook, including the M4 chapters and INOUT device sections, is available through the primary document index and this text rendition:
https://archive.org/stream/tx-2-users-handbook-nov-63/TX-2_UsersHandbook_Nov63_djvu.txt

The text rendition may contain recognition errors; ambiguous readings are not treated as proof of hardware behavior. M4 field OR, the comma chart, omitted-dummy rules, literal pools, priority switching, TSD waiting and device formats were cross-checked where possible with the MIT-licensed project's readable implementation. New references at the pinned simulator revision include `assembler/src/asmlib/ast/asteval.rs` and `base/src/splay.rs`. The former supplies the complete comma chart and the latter the six-frame splay/unsplay bit mapping. Attribution is retained.

## References used in 0.3.0

Direct visual inspection used P91-211:
https://tx-2.github.io/photos/Lincoln-Lab/2022-10-31/P91-211.jpg

P91-113 informs the register/toggle grouping, not a claim that a mixed-photo arrangement has exact measured dimensions. See VISUAL-FIDELITY.md.

At the simulator revision above, `cpu/src/control/trap.rs` gives TRAP mode bits and disconnect behavior; `cpu/src/control.rs` gives marked placekeeper interception, E reports and P-mark preservation; `cpu/src/control/op_io.rs` identifies the non-INOUT TSD sequences 0, 75 and 76. `cpu/src/memory.rs` and `assembler/src/asmlib/readerleader.rs` reproduce the plugboard and reader-leader words from Users Handbook §5-5.2. `assembler/src/asmlib/driver/output.rs` provides a checkable interpretation of tape headers/trailers and one's-complement checksum arithmetic. `cpu/src/io/dev_petr.rs` describes motor mode bits and logical beginning/reversal behavior. `assembler/examples/hellosym.tx2as` demonstrates PUNCH selecting execution entry.

These are readable interpretations of original documentation. Neither the upstream simulator nor agreement with these code paths constitutes independent electrical validation. In particular, the binary file's optional 0x80 marker is not a seventh data bit; the six data bits are the low bits of each frame. Physical control-channel END MARK and analog acceleration are not simulated.
