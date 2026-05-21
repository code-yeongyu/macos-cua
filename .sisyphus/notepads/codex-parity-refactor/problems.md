## Screen Recording TCC permission required for new SCK-using helper binary

After Wave 2, the rebuilt cua-helper binary uses ScreenCaptureKit, which is
**TCC-gated per-binary**. The OLD binary (using `screencapture` CLI fallback) inherited
permission from the terminal. The NEW binary needs its own permission grant:
- `CGPreflightScreenCaptureAccess()` returns `true` for our helper (Terminal has permission)
- But `SCShareableContent.current.displays` returns `[]` — SCK uses its own TCC entry that's
  empty for the new binary.

Symptoms:
- `screencapture` CLI works fine (T1 baseline succeeded)
- T6 `getAXTree` works (uses Accessibility, separate permission, already granted)
- T7 `waitForSettle` works (uses Accessibility)
- T5 `screenshot` returns `{"ok":false,"error":"no displays available for screenshot"}`

Action required BEFORE T8 benchmark gate / T10 integration:
1. User opens **System Settings → Privacy & Security → Screen Recording**
2. Click `+`, navigate to `packages/cua-helper/.build/arm64-apple-macosx/release/cua-helper`
3. Toggle ON
4. (Or simpler) Once T8 wires into pi-extension, the model's first `get_app_state` call
   triggers a system prompt for the user to grant permission.

The code path is CORRECT — T5's implementation matches the spec. The blocker is
operational/TCC, not code logic.

## Cold stdio round-trip latency observation

T5 measured ~378ms for a cold-start screenshot (process spawn + SCK init + capture +
encode + base64 + JSON round-trip). Steady-state latency (persistent subprocess) should
be much lower. T8's BENCHMARK GATE measures steady-state via the helper's persistent
subprocess pattern, so 378ms cold-start is expected and NOT a failure mode.

## T8 screenshot/getAppState benchmark blocked on Screen Recording permission

T8 now calls `CGRequestScreenCaptureAccess()` at helper startup, but the local run still returned
`{"ok":false,"error":"no displays available for screenshot"}` for:

```bash
echo '{"id":"s","cmd":"screenshot","width":1280,"height":800}' \
  | packages/cua-helper/.build/arm64-apple-macosx/release/cua-helper
```

This means the benchmark gate for `screenshot` and `getAppState` is blocked on the user granting
Screen Recording permission to the release helper binary. Grant:

`packages/cua-helper/.build/arm64-apple-macosx/release/cua-helper`

in System Settings → Privacy & Security → Screen Recording, then rerun T10/T21 benchmark gates.
AX tree benchmarking is not blocked by this permission and passed its p50 gate.
