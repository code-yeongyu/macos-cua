
## T1: Latency Baseline Benchmarks + Regression Tests

- Screenshot p50 ~155ms, p95 ~747ms, p99 ~968ms (100 iterations via screencapture CLI)
- Click+capture p50 ~172ms, p95 ~263ms, p99 ~300ms (50 iterations)
- Tool descriptors: 4055 bytes, ~1014 estimated tokens (9 macos_cua_* + 1 native computer)
- vitest only auto-discovers `.test.ts` files; `.bench.ts` must be renamed or run explicitly
- Mocking CoreGraphics FFI in core tests requires `vi.mock` on relative paths from test file
- Korean IME "안녕하세요" types correctly via `postUnicodeText` (5 Unicode segments)
- Existing tests broke when T4 added `getAppState`/`listApps` to `ComputerInterface` — fixed

## T6: AXUIElement tree extraction

- `AXUIElementCopyActionNames` must be used for action names; generic attribute reads do not expose the same data reliably.
- Swift SourceKit flags conditional casts to CoreFoundation AX types as always-successful; checking `CFGetTypeID` before `unsafeBitCast` keeps AXValue/AXUIElement bridging explicit.
- Finder AX extraction returned a non-empty tree with root `AXApplication` and `axAvailable: true`; invalid PID routing returns a structured `ok:false` error.

## T5: ScreenCaptureKit screenshot helper

- `cua-helper` SCK screenshot QA returned `ok:true` for 1280×800 and produced a valid PNG header `89 50 4E 47 0D 0A 1A 0A`.
- Observed JSON-stdio helper process round-trip latency: ~378ms for one cold `echo '{"cmd":"screenshot"}' | .build/release/cua-helper` invocation, including process startup and PNG base64 response.
- `SCScreenshotManager.captureImage` requires macOS 14 APIs, so `packages/cua-helper` now targets `.macOS(.v14)`.
- Permission path uses `CGPreflightScreenCaptureAccess()` before SCK capture so missing Screen Recording permission returns a JSON error instead of prompting mid-capture.

## T7: UI Settle Debounce QA Observations

- Static Finder settles in ~686ms with `settleMs=200`, `pollMs=50` (total elapsed, including initial sampling)
- Timeout path (`timeoutMs=100`, `settleMs=200`) correctly returns `settled:false` in ~298ms
- Invalid PID (`pid=-1`) gracefully returns `settled:true` immediately in ~37ms
- `Task.sleep(nanoseconds:)` requires `try?` because it can throw `CancellationError`
- `CGPoint`/`CGSize` use `CGFloat`, so explicit `Double(...)` cast is needed when storing in a `Double`-typed fingerprint struct
- `ApplicationServices` framework must be linked in `Package.swift` for `AXUIElement` APIs

## T8: Unified cua-helper routing + skyshot benchmarks

- `getAppState` is wired as one stdio request/response: optional settle debounce, SCK screenshot capture, AX tree extraction, and `NSRunningApplication` metadata are returned together.
- `listApps` filters `NSWorkspace.shared.runningApplications` to `.regular` activation-policy GUI apps; Finder appeared in QA output.
- Persistent-helper AX tree benchmark on Finder: p50 74ms, p95 151ms (100 iterations). Cold process-spawn AX timing was ~128ms p50, so benchmark gates should prefer the persistent stdio process model used by TypeScript wrappers.
- Screenshot and `getAppState` benchmark numbers are blocked until the helper binary receives its own Screen Recording TCC grant; evidence JSON records `permission_granted: false`.
