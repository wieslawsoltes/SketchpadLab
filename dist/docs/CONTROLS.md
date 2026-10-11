# Operator controls — 0.3.0

The physical Console controls a **new host reconstruction**. Assembly/Debugger controls a separate machine. Neither route pretends the unchanged original program has booted.

## Physical pen workflow

Move the pointer onto the CRT. Press **D / DRAW** to anchor, move the pen, then **Enter / STOP** to finish a line. Nearby points snap and share identity. Successive DRAW presses can extend a connected construction. One live gesture is committed as one undo transaction.

For an arc, press **C / CEN CIR** at its center, move to the start, press DRAW, move around the circle, then STOP. **M / MOVE** moves aimed/selected geometry. **T / TEXT** starts moving text: type and STOP. **N / NUMBER** starts a scalar numeric display. The lettering is vector strokes from a newly authored alphabet.

**HOLD ignores one flick**, rather than enabling indefinite line chaining. Click the physical pen icon to flick the pen away. STOP finishes the current gesture; Ctrl/Command Z reverses it. Physical DELETE aims at an object. META protects delete-picture/delete-constraints/delete-free operations. Host META is a latching mouse convenience, whereas physical button press/release drives the hardware metabit.

TIE marks master points for automatic instance attachers. INSTANCE uses the master picture named by toggle register 25. COPY20–23 take picture numbers from the corresponding toggle registers. DESIGNATE accumulates target points for definition copying. CHANGE replaces an instance master, preserving ordered attachers where possible. DISMEMBER substitutes geometry while retaining supported constraints. Nonuniform affine dismembering is rejected.

Picture number buttons select/create pictures. Four shaft encoders manipulate X/Y view position, size and rotation; selected instances can be scaled/rotated. They also supply deterministic nine-bit console input quarters. The 20–27 octal toggle registers can be changed bit-by-bit or as 12-digit octal words. The K/P/Q/N/A–E/Z lamps follow the separate machine, not hidden state fabricated from the drawing.

PLOT exports SVG. PUNCH exports **modern HP-GL**, not historical TX-2 plotter tape. ORDER/DISORDER choose modern pen-run planning. LIBRARY opens modern JSON documents, not original magnetic media. The CONSTRAINT button opens the modern workbench rather than reproducing the full historical numeric constraint-library workflow.

## Drawing workbench

Open the collapsed drawer for modern tools and inspectors. Here **L** is a two-click line, **C** a center/radius circle, **A** a center/start/end arc, **V** selects, and **M** moves. Shift-click builds selections. H/V/Length constrain a line; Equal/parallel/perpendicular take two lines; coincidence takes two points. Fixed points are excluded from the solver; direct dragging can release a fixed point.

Wheel zooms around the pointer; middle-drag or Space-drag pans. Fit frames the current picture. The workbench exposes saved pictures, defining/inserting masters, undo/redo, JSON load/save, SVG and topology/constraint inspection.

The physical and workbench keyboard mappings intentionally differ and are documented in the in-app guide. Escape/STOP in physical mode finishes the live pen construction. The workbench's Escape cancels its unfinished click sequence.

## Machine tools

Select an example, Assemble & load, then Step or Run. STOP labels in diagnostics become breakpoints. Reverse restores processor, journaled memory, virtual time and peripheral state. Click listing rows for breakpoints. Register/memory edits clear reverse history. Snapshots are separate from drawing JSON and must match the current machine profile.

**M4 native macros** demonstrates DEF/EMD, literal pools and native syntax. **TX-2 scope** selects the INOUT research profile and emits four individual spots, with sequence switching and modeled ready delays. **Vector diagnostic** explicitly uses the older nonhistorical word-coordinate endpoint. Machine output appears in its own device pane; the host console drawing is not output from these diagnostics.

The module API additionally exposes tape mounting, punch frames and light-pen aperture control. Full tape-media UI and original boot are not claimed.

## Added console and tape controls in 0.3.0

**CONSOLE ONLY / SHOW WORKSPACES** hides or restores the modern header/navigation without resetting either model. **FOCUS**, **INTENSITY** and **AFTERGLOW** adjust the host beam appearance. FA/F/X and the 33 sequence flags are live machine indicators; their numeric labels are modern inspection aids.

In Assembly, **Boot tape** assembles and punches the editor text, selects the INOUT research profile and stops at the ROM configuration entry. **Run** executes the loader and stops at the selected source entry. **Punch tape** downloads a binary `.tape`, not JSON. **RESET** reboots that tape. Failed assembly or failed tape encoding disables execution of any previous image. **REFERENCE & FIDELITY RECORD** explains which console details are inferred.

Reverse undoes one recorded instruction **or sequence/device boundary event**. Reversing an idle wakeup changes virtual time/flags without decreasing the instruction count; the status explicitly says “reverse sequence/device boundary.” Marked P values retain their high bit in the register, while listing/source highlights use the physical low-17-bit address.
