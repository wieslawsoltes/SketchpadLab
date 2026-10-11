# Gate-driven sequences and peripherals

This increment extends the optional structural hardware board. Execution must remain independent of `TX2.step`, `TX2.execute`, and the instruction-level peripheral classes.

## Implementation targets

- Gate-built priority selection, sequence flags, HOLD/dismissal, placekeepers and LIMBO.
- Structural IOS/TSD handshakes, tape framing, scope readiness and bounded signal observation.
- Published plugboard/reader-leader execution with no host preload of the user payload into RAM.
- Reversible storage, snapshot validation, browser controls, differential tests and measured performance.

## Fidelity contract

This is a synthesized logical model, not a transcription of historical TX-2 circuit cards. Timing parameters are explicit logical-clock counts; no electrical timing is implied. ROM/RAM macros and observation buffers must be labeled. Generic electrical simulation remains separate from Boolean propagation. Unsupported instructions, modes and devices must stop visibly instead of falling back to the instruction emulator.

Validated implementation details and remaining boundaries will be added before merge.
