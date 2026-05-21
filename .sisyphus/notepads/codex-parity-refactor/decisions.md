
## T4 Decision: getAppState/listApps API surface

T2's `packages/core/src/accessibility/types.ts` was already present when T4 started, so `AppState` and `AppInfo` were imported directly from `../accessibility/types.js` — no inline shim was needed.

## T2: AX Tree and App State Types

Added four `export interface` types in `packages/core/src/accessibility/types.ts`:
- `AXTreeElement` — accessibility node with `id`, `role`, `label`, `value`, `frame`, `actions`, `children`
- `AppState` — app metadata + `elements[]` + screenshot dimensions
- `SkyshotResult` — wrapper pairing `AppState` with `captureTimestampMs`
- `AppInfo` — lightweight running-app descriptor (`name`, `bundleId`, `pid`, `isRunning`)

Barrel re-export uses `export type * from "./accessibility/types.js"` in `packages/core/src/index.ts`.
Field names are camelCase and match downstream task specs exactly (T9, T10, T12).

## T3 Decision: cua-helper module split + SCK framework linkage

Split `packages/cua-helper/Sources/CuaHelper/main.swift` (585 lines) into three files:

- `types.swift` — `HelperRequest`, `HelperResponse`, `HelperFailure`, `MouseButton`, `TargetWindow`, plus `helperVersion`, `defaultDragSteps`, `maximumDragSteps` constants. Needs `Foundation` + `CoreGraphics` imports.
- `input.swift` — `SkyLightBridge` (private framework loader + SPI wrappers), `WindowLookup`, `InputActions` (all mouse/keyboard/drag/type handlers), plus the `keyCodes` lookup table and modifier mask helpers. Also holds the top-level request field extractors (`pid`, `point`, `fromPoint`, `toPoint`, `button`) so `main.swift` can call them. Needs `AppKit`, `CoreGraphics`, `Darwin`, `Foundation`, `ObjectiveC`.
- `main.swift` — shrunk to ~55 lines: `HelperServer` class (stdin loop, JSON decode/encode, command router), plus the `NSApplication.shared.setActivationPolicy(.accessory)` startup line.

Visibility: all symbols are default `internal` (no `public` needed) because everything lives in the same SPM executable target.

`Package.swift` updated with `linkerSettings: [.linkedFramework("ScreenCaptureKit"), .linkedFramework("CoreImage")]` on the `CuaHelper` executable target. No `import ScreenCaptureKit` or `import CoreImage` added to source files yet — Wave 2 (screenshot.swift) will import them where needed.

Build verified: `swift build -c release` exits 0, ping smoke test returns `{"ok":true,"version":"0.1.0"}`, click to PID 1 routes correctly (returns ok rather than "missing command" / decode error). `build.sh` copies binary to `packages/core/dist/bin/cua-helper`.

## T6 Decision: cua-helper AX element JSON shape

`AXElement` stays target-internal for Swift traversal/action refetching. JSON responses use `AXElementJSON: Codable` with the TypeScript-side field names: `id`, `role`, `label`, `value`, `frame`, `actions`, `children`. `frame` is encoded as `AXFrameJSON { x, y, width, height }` with non-null `Double` values; missing AX position/size attributes become zero-origin or zero-size components instead of nullable frame fields so clients can decode a stable shape.

## T5 Decision: cua-helper screenshot capture requires macOS 14

Implemented screenshot capture with `SCScreenshotManager.captureImage(contentFilter:configuration:)`, which is macOS 14+. Bumped `packages/cua-helper/Package.swift` from `.macOS(.v13)` to `.macOS(.v14)` instead of adding a macOS 13 `SCStream` compatibility path, keeping T5 focused on the direct SCK screenshot path.

## T7 Decision: UI settle debounce fingerprint design

Fingerprint fields for `UISettleDetector.waitForSettle`:
- `x`, `y` from `kAXPositionAttribute` of the focused window
- `width`, `height` from `kAXSizeAttribute` of the focused window
- `children` count from `kAXChildrenAttribute` of the focused window

Why these: they are top-level window attributes that mutate on any meaningful UI activity (window moves, resizes, or content loads/unloads), yet they are cheap to sample via `AXUIElementCopyAttributeValue` without descending the full accessibility tree. A focused-window-only sample avoids the heavy traversal that T6's full tree extraction performs. The fingerprint is a plain `Equatable` struct (`WindowFingerprint`) rather than a hash — struct equality is fast and collision-free.

Defaults: `timeoutMs=2000`, `settleMs=300`, `pollMs=50`. The timeout bounds total wait; settleMs bounds consecutive stability. Invalid PID returns `true` immediately so the caller proceeds and surfaces the PID error at the actual capture step.
