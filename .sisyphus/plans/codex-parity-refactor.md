# Codex Computer Use Parity Refactor

## TL;DR

> **Quick Summary**: Refactor macos-cua pi-extension to match Codex Computer Use's performance architecture — replace CLI shell-outs (screencapture/sips) with ScreenCaptureKit + in-process resize, add AX tree extraction, change screenshot policy from auto-after-every-action to explicit `get_app_state`, and reduce tool surface from 10 to 5.
>
> **Review Mode**: HIGH ACCURACY — Momus review required before execution. Plan passed Metis gap analysis, Oracle phase 1 (interview), Oracle phase 2 (plan compliance), and Oracle phase 3 (readiness).
>
> **Deliverables**:
> - Swift cua-helper with ScreenCaptureKit capture, CoreImage resize, AX tree extraction, and UI settle debounce
> - `get_app_state` tool returning screenshot + AX tree (Codex's "skyshot" equivalent)
> - Native `computer` tool preserved (model training compat) with no auto-screenshot
> - 9 `macos_cua_*` prefix tools removed
> - Old CLI pipelines (`screencapture`, `sips`) removed
> - Performance targets: p50 < 40ms screenshot, p50 < 100ms click-to-state
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 7 waves
> **Critical Path**: T1 → T3 → T5/T6 → T8 → T10 → T13/T14 → T18/T19 → F1-F4

---

## Context

### Original Request
"완전히 똑같아지도록 최대성능 나오도록 리팩토링하는 작업계획서 작성 - 아예 새로 짜야한다면 코드 제거 까지도 포함하도록 하게 해주셈"

### Interview Summary
**Key Discussions**:
- Analysis showed screenshot pipeline (screencapture + sips) = ~150-400ms per action, dominant latency
- Auto-screenshot after EVERY action = structural multiplier (10 actions = 10 screenshots = ~2.5s overhead)
- Codex uses ScreenCaptureKit direct (~16-33ms), per-turn screenshot (not per-action), AX tree with element indexing
- User wants max performance parity, willing to remove/rewrite everything needed

**Research Findings**:
- `bg_c090de01`: Our 10 tools = ~600 tokens descriptor, screencapture ~100-250ms, sips ~50-150ms per action
- `bg_26dd255c`: Codex binary recon — SCShareableContent, RefetchableSkyshotAXTree, DebounceStateMachine, 9 semantic tools, per-app instruction markdown, CGEvent physical clicks preferred

### Metis Review
**Identified Gaps** (addressed):
- Model target ambiguity → Both Anthropic + OpenAI supported, provider-conditional tool exposure
- "Maximum performance" lacks numbers → p50 < 40ms screenshot, p50 < 100ms click-to-state, ≤50% tool tokens
- Per-turn vs explicit screenshot → Explicit `get_app_state` with system prompt guidance (= per-turn in practice)
- AX element ID strategy → Sequential session counter (integer), not stable across captures
- Rollback plan → CLI fallback kept during dev, deleted only after benchmarks confirm
- Hybrid vs pure tool approach → Hybrid: keep native `computer` + add custom AX tools

---

## Work Objectives

### Core Objective
Achieve Codex Computer Use performance parity by replacing CLI shell-out screenshot pipeline with native ScreenCaptureKit, adding AX tree state observation, and eliminating per-action auto-screenshot overhead.

### Concrete Deliverables
- `packages/cua-helper/Sources/CuaHelper/screenshot.swift` — ScreenCaptureKit capture + CoreImage resize
- `packages/cua-helper/Sources/CuaHelper/accessibility.swift` — AXUIElement tree extraction
- `packages/cua-helper/Sources/CuaHelper/debounce.swift` — UI settle detection
- `packages/pi-extension/src/tools/get-app-state.ts` — Skyshot-equivalent tool
- `packages/pi-extension/src/tools/set-value.ts` — AX value setter
- `packages/pi-extension/src/tools/perform-action.ts` — AX secondary action
- `packages/pi-extension/src/tools/list-apps.ts` — Running app enumeration
- Updated `anthropic-computer-use.ts` and `openai-computer-use.ts` without auto-screenshot
- 9 old `macos_cua_*` tool files removed
- Old `screencapture` and `sips` CLI paths removed

### Definition of Done
- [ ] `pnpm -r typecheck` (tsgo) exits 0
- [ ] `pnpm test` — all vitest tests pass
- [ ] `biome check .` exits 0
- [ ] `pnpm -r build` exits 0 (including Swift helper rebuild)
- [ ] Screenshot p50 < 40ms, p95 < 80ms (measured over 100 captures)
- [ ] Tool count = 5 (1 native computer + 4 custom)
- [ ] Zero `screencapture` or `sips` invocations in shipping code
- [ ] Korean IME regression: "안녕하세요" types correctly

### Must Have
- ScreenCaptureKit-based screenshot (no CLI spawn)
- In-process image resize (no sips CLI spawn)
- AX tree extraction with element indexing
- Explicit `get_app_state` tool (screenshot + AX tree combined)
- Native `computer` tool preserved for Anthropic/OpenAI model training compatibility
- Auto-screenshot removal (actions return lightweight `{ ok: true }` results)
- System prompt guidance for per-turn `get_app_state` usage
- Pre-refactor latency baseline and regression tests
- Phased delivery with benchmark gates between waves
- CLI fallback kept during dev waves, removed only after benchmark confirmation

### Must NOT Have (Guardrails)
- Cursor animation ("Magic Move" Bezier paths)
- PIP (Picture-in-Picture) support
- Per-app instruction markdown content creation
- XPC IPC layer
- Protobuf encoding
- Multi-touch gestures
- Voice/dictation integration
- More than 5 tools total (native `computer` + ≤4 custom)
- New npm dependencies for image processing (resize happens in Swift helper)
- Any `@ts-ignore`, `@ts-expect-error`, or `any` type assertions
- Comments that don't add value beyond self-documenting names

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest, 90 tests, 25 files)
- **Automated tests**: Tests-after (rewrite/update tests for new architecture)
- **Framework**: vitest (existing)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Swift helper**: Use Bash — build helper, send JSON commands via stdin, verify JSON response
- **TypeScript layer**: Use Bash — `pnpm vitest` test or `node` compiled script, verify output
- **Pi-extension tools**: Use Bash — mock tool invocation, verify response shape
- **Performance**: Use Bash — benchmark script outputs JSON metrics, assert thresholds

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — baseline + types + Swift prep):
├── Task 1: Latency baseline recording + pre-refactor regression tests [quick]
├── Task 2: TypeScript types (AXTreeElement, AppState, SkyshotResult) [quick]
├── Task 3: Package.swift update + split main.swift into modules [quick]
└── Task 4: ComputerInterface additions (getAppState, listApps) [quick]

Wave 2 (Swift Helper — SCK + AX + debounce, MAX PARALLEL):
├── Task 5: screenshot.swift — ScreenCaptureKit + CoreImage resize (depends: 3) [deep]
├── Task 6: accessibility.swift — AX tree extraction (depends: 3) [deep]
└── Task 7: debounce.swift — UI settle detection (depends: 3) [quick]

Wave 3 (Swift Integration — skyshot command):
└── Task 8: main.swift routing for all new commands (depends: 5, 6, 7) [deep]

  >>> BENCHMARK GATE: SCK screenshot p50 < 40ms, AX tree p50 < 100ms <<<

Wave 4a (TypeScript Foundation):
└── Task 9: MacOSCuaHelper new command wrappers (depends: 4, 8) [quick]

Wave 4b (after T9 — parallel):
├── Task 10: MacOSHostComputer screenshot + getAppState via helper (depends: 9) [deep]
└── Task 11: AX element index → coordinate resolver (depends: 9) [quick]

Wave 4c (after T10, T11):
└── Task 12: get_app_state + list_apps tool implementations (depends: 10, 11) [deep]

Wave 5a (Pi-Extension Gate):
└── Task 13: pi-extension index.ts rewrite (depends: 12) [deep]

Wave 5b (after T13 — MAX PARALLEL):
├── Task 14: Anthropic computer-use: remove auto-screenshot (depends: 13) [deep]
├── Task 15: OpenAI computer-use: remove auto-screenshot (depends: 13) [deep]
├── Task 16: set_value + perform_secondary_action tools (depends: 13) [quick]
└── Task 17: System prompt update + per-turn guidance (depends: 13) [quick]

Wave 6a (Code Removal — parallel):
├── Task 18: Remove 9 macos_cua_* tool files (depends: 13) [quick]
├── Task 19: Remove screencapture + sips fallback paths (depends: 14, 15) [quick]
└── Task 20: Update vitest tests for new architecture (depends: 14, 15, 16) [deep]

Wave 6b (after T20 — benchmark):
└── Task 21: Performance benchmark report (before vs after) (depends: 1, 19, 20) [quick]

  >>> BENCHMARK GATE: Full cycle measured, all p50/p95 targets met <<<

Wave FINAL (4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Blocked By | Blocks | Wave |
|------|-----------|--------|------|
| T1 | — | T21 | 1 |
| T2 | — | T9, T12 | 1 |
| T3 | — | T5, T6, T7 | 1 |
| T4 | — | T9, T10 | 1 |
| T5 | T3 | T8 | 2 |
| T6 | T3 | T8 | 2 |
| T7 | T3 | T8 | 2 |
| T8 | T5, T6, T7 | T9, T10 | 3 |
| T9 | T4, T8 | T10, T11, T12 | 4a |
| T10 | T9 | T12 | 4b |
| T11 | T9 | T12 | 4b |
| T12 | T10, T11 | T13 | 4c |
| T13 | T12 | T14, T15, T16, T17, T18 | 5a |
| T14 | T13 | T19, T20 | 5b |
| T15 | T13 | T19, T20 | 5b |
| T16 | T13 | T20 | 5b |
| T17 | T13 | — | 5b |
| T18 | T13 | — | 6a |
| T19 | T14, T15 | T21 | 6a |
| T20 | T14, T15, T16 | T21 | 6a |
| T21 | T1, T19, T20 | F1-F4 | 6b |

### Agent Dispatch Summary

| Wave | Count | Tasks |
|------|-------|-------|
| W1 | 4 | T1→`quick`, T2→`quick`, T3→`quick`, T4→`quick` |
| W2 | 3 | T5→`deep`, T6→`deep`, T7→`quick` |
| W3 | 1 | T8→`deep` |
| W4 | 4 | T9→`quick`, T10→`deep`, T11→`quick`, T12→`deep` |
| W5 | 5 | T13→`deep`, T14→`deep`, T15→`deep`, T16→`quick`, T17→`quick` |
| W6 | 4 | T18→`quick`, T19→`quick`, T20→`deep`, T21→`quick` |
| FINAL | 4 | F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep` |

---

## TODOs

- [x] 1. Latency Baseline Recording + Pre-Refactor Regression Tests

  **What to do**:
  - Create `packages/pi-extension/test/bench/screenshot-baseline.bench.ts`: call `MacOSHostComputer.screenshot()` 100 times, record p50/p95/p99 in JSON
  - Create `packages/pi-extension/test/bench/click-capture-baseline.bench.ts`: click + screenshotResult() 50 times, record p50/p95/p99
  - Create `packages/pi-extension/test/bench/tool-descriptors-baseline.ts`: serialize all registered tool schemas, count bytes and estimated tokens
  - Create regression tests that lock current behavior: screenshot returns PNG Buffer, click dispatches CGEvent, type produces text, key with modifiers works, scroll works, Korean IME "안녕하세요" works
  - Output all metrics to `.sisyphus/evidence/baseline-metrics.json`

  **Must NOT do**:
  - Change any production code
  - Add dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4)
  - **Blocks**: T21 (benchmark comparison)
  - **Blocked By**: None

  **References**:
  - `packages/core/src/platform/macos.ts:49-69` — current screenshot() with screencapture CLI (measure this)
  - `packages/pi-extension/src/computer-use/coords.ts:52-77` — sips resize pipeline (measure this)
  - `packages/pi-extension/src/anthropic-computer-use.ts:233-237` — screenshotResult() full pipeline (measure end-to-end)
  - `packages/core/src/platform/macos-input.ts` — click dispatch path
  - `packages/pi-extension/src/tools/index.ts` — tool registration (count descriptors)

  **Acceptance Criteria**:
  - [ ] `.sisyphus/evidence/baseline-metrics.json` exists with `{ screenshot_p50_ms, screenshot_p95_ms, click_capture_p50_ms, tool_descriptor_bytes, tool_descriptor_estimated_tokens }`
  - [ ] Regression tests pass: `pnpm -F @macos-cua/pi-extension test -- --grep baseline`

  **QA Scenarios**:
  ```
  Scenario: Baseline metrics are captured
    Tool: Bash
    Steps:
      1. Run: pnpm -F @macos-cua/pi-extension vitest run test/bench/screenshot-baseline.bench.ts
      2. Assert: .sisyphus/evidence/baseline-metrics.json exists
      3. Assert: JSON has screenshot_p50_ms field, value is numeric > 0
    Expected Result: Metrics file with all fields populated
    Evidence: .sisyphus/evidence/task-1-baseline-metrics.json

  Scenario: Korean IME regression baseline
    Tool: Bash
    Steps:
      1. Run regression test that types "안녕하세요" via computer.type()
      2. Assert: no error thrown
    Expected Result: Type completes without error
    Evidence: .sisyphus/evidence/task-1-korean-ime.txt
  ```

  **Commit**: YES
  - Message: `test(perf): add latency baseline benchmarks and regression tests`
  - Pre-commit: `pnpm -F @macos-cua/pi-extension test`

- [x] 2. TypeScript Types for AX Tree, App State, and Skyshot

  **What to do**:
  - Create `packages/core/src/accessibility/types.ts`:
    ```typescript
    interface AXTreeElement { id: number; role: string; label: string | null; value: string | null; frame: { x: number; y: number; width: number; height: number }; actions: string[]; children: number[]; }
    interface AppState { app: string; bundleId: string; pid: number; frontmost: boolean; axAvailable: boolean; elements: AXTreeElement[]; screenshotBase64: string; screenshotWidth: number; screenshotHeight: number; }
    interface SkyshotResult { appState: AppState; captureTimestampMs: number; }
    interface AppInfo { name: string; bundleId: string; pid: number; isRunning: boolean; }
    ```
  - Export from `packages/core/src/index.ts`
  - These types are consumed by MacOSCuaHelper, tool implementations, and pi-extension

  **Must NOT do**:
  - Add runtime logic — types only
  - Use `any` or loose types

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3, T4)
  - **Blocks**: T9 (helper wrappers), T12 (tool implementations)
  - **Blocked By**: None

  **References**:
  - `packages/core/src/computer/interface.ts` — existing ComputerInterface (follow same style)
  - `packages/core/src/index.ts` — barrel exports pattern
  - Codex recon: `{ elementID, role, title, value, actions, frame }` element shape (from `bg_26dd255c`)

  **Acceptance Criteria**:
  - [ ] `pnpm -F @macos-cua/core typecheck` passes
  - [ ] Types exported from `@macos-cua/core`
  - [ ] No `any` types

  **QA Scenarios**:
  ```
  Scenario: Types compile and export correctly
    Tool: Bash
    Steps:
      1. Run: pnpm -F @macos-cua/core typecheck
      2. Run: pnpm -F @macos-cua/core build
      3. Assert: dist/index.d.ts contains AXTreeElement, AppState, SkyshotResult
    Expected Result: Clean typecheck and build, types in dist
    Evidence: .sisyphus/evidence/task-2-typecheck.txt
  ```

  **Commit**: YES
  - Message: `feat(core): add AX tree and app state TypeScript types`
  - Pre-commit: `pnpm -F @macos-cua/core typecheck`

- [x] 3. Package.swift Update + Split main.swift into Modules

  **What to do**:
  - Update `packages/cua-helper/Package.swift`: add `linkerSettings: [.linkedFramework("ScreenCaptureKit"), .linkedFramework("CoreImage")]` to CuaHelper target
  - Split `packages/cua-helper/Sources/CuaHelper/main.swift` (585 lines) into:
    - `main.swift` — entry point, stdin loop, command routing, HelperRequest/HelperResponse types
    - `input.swift` — existing mouse/keyboard/scroll/drag commands (SkyLightBridge, click/type/key/scroll/drag handlers)
    - `types.swift` — shared types (MouseButton, TargetWindow, HelperFailure)
  - Verify `swift build -c release` still produces working binary
  - Do NOT add new commands yet — just split existing code for parallel development

  **Must NOT do**:
  - Add new functionality (that's Wave 2)
  - Change any behavior
  - Break the JSON-stdio protocol

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`rust-programmer`] (closest to Swift strict typing patterns)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T4)
  - **Blocks**: T5, T6, T7 (new Swift files need clean module structure)
  - **Blocked By**: None

  **References**:
  - `packages/cua-helper/Sources/CuaHelper/main.swift` — current 585-line single file to split
  - `packages/cua-helper/Package.swift` — current target config (swift-tools-version 5.9, macOS 13)
  - `packages/cua-helper/build.sh` — build script to verify

  **Acceptance Criteria**:
  - [ ] `swift build -c release` in `packages/cua-helper/` succeeds
  - [ ] Binary at `.build/release/cua-helper` works (ping command returns `{ ok: true }`)
  - [ ] All existing helper commands still work (click, type, key, scroll, drag)
  - [ ] Module files exist: `main.swift`, `input.swift`, `types.swift`

  **QA Scenarios**:
  ```
  Scenario: Split helper builds and responds to ping
    Tool: Bash
    Steps:
      1. cd packages/cua-helper && swift build -c release
      2. echo '{"id":"t","cmd":"ping"}' | .build/release/cua-helper
      3. Assert: response contains "ok":true and "version"
    Expected Result: Binary compiles, ping returns ok with version
    Evidence: .sisyphus/evidence/task-3-helper-build.txt

  Scenario: Existing click command still works after split
    Tool: Bash
    Steps:
      1. echo '{"id":"t","cmd":"clickPid","pid":1,"x":0,"y":0}' | .build/release/cua-helper
      2. Assert: response is valid JSON (ok or error about pid)
    Expected Result: Command routes correctly to input.swift handler
    Evidence: .sisyphus/evidence/task-3-click-routing.txt
  ```

  **Commit**: YES
  - Message: `refactor(cua-helper): split main.swift into modules + add SCK framework`
  - Pre-commit: `cd packages/cua-helper && swift build -c release`

- [x] 4. ComputerInterface Additions (getAppState, listApps)

  **What to do**:
  - Add abstract methods to `packages/core/src/computer/interface.ts`:
    ```typescript
    abstract getAppState(targetPid?: number): Promise<AppState>;
    abstract listApps(): Promise<AppInfo[]>;
    ```
  - Add stub implementations in `packages/core/src/platform/vm.ts` and `packages/core/src/platform/cloud.ts` that throw `new Error("Not implemented")`
  - Add placeholder implementation in `packages/core/src/platform/macos.ts` that throws `new Error("Not implemented — requires cua-helper skyshot command")` (real impl in T10)
  - Import `AppState`, `AppInfo` from `../accessibility/types.js`

  **Must NOT do**:
  - Implement the actual macOS logic (that's T10)
  - Change existing method signatures

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3)
  - **Blocks**: T9 (helper wrappers), T10 (macOS impl)
  - **Blocked By**: None (T2 types can be imported after T2 merges, but interface stubs work with inline types)

  **References**:
  - `packages/core/src/computer/interface.ts` — existing abstract class pattern
  - `packages/core/src/platform/vm.ts:1-20` — existing stub pattern (`throw new Error("Not implemented")`)
  - `packages/core/src/accessibility/types.ts` — types from T2

  **Acceptance Criteria**:
  - [ ] `pnpm -F @macos-cua/core typecheck` passes
  - [ ] `pnpm -F @macos-cua/core build` succeeds
  - [ ] VM and Cloud stubs throw "Not implemented"

  **QA Scenarios**:
  ```
  Scenario: Interface compiles with new methods
    Tool: Bash
    Steps:
      1. pnpm -F @macos-cua/core typecheck
      2. pnpm -F @macos-cua/core build
      3. grep "getAppState" packages/core/dist/computer/interface.d.ts
    Expected Result: Typecheck clean, method in declaration
    Evidence: .sisyphus/evidence/task-4-interface.txt
  ```

  **Commit**: YES
  - Message: `feat(core): add getAppState and listApps to ComputerInterface`
  - Pre-commit: `pnpm -F @macos-cua/core typecheck`

- [x] 5. screenshot.swift — ScreenCaptureKit Capture + CoreImage Resize

  **What to do**:
  - Create `packages/cua-helper/Sources/CuaHelper/screenshot.swift`
  - Implement `captureScreenshot(width: Int, height: Int) async throws -> Data`:
    1. `SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)` to get available content
    2. Create `SCContentFilter` for main display
    3. `SCScreenshotManager.captureImage(contentFilter:configuration:)` to capture
    4. Convert `CGImage` to resized JPEG using CoreImage `CIImage` + `CIContext.createCGImage` with target dimensions
    5. Create `NSBitmapImageRep` from resized CGImage, encode as PNG with compression
    6. Return PNG data as base64-encoded string
  - Handle Retina displays: `SCStreamConfiguration.scaleFactor` for capture scale control
  - Handle permission denied: catch `SCStreamError.userDeclined`, return structured error
  - Export function callable from main.swift command router

  **Must NOT do**:
  - Add AX tree logic (that's T6)
  - Modify existing commands
  - Use `screencapture` CLI as fallback within this file

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [] (Swift native, no TS skill needed)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T6, T7)
  - **Blocks**: T8 (skyshot integration)
  - **Blocked By**: T3 (module structure + SCK framework linkage)

  **References**:
  - `packages/cua-helper/Sources/CuaHelper/main.swift:1-50` — HelperRequest/HelperResponse types (after split: types.swift)
  - `packages/cua-helper/Package.swift` — ScreenCaptureKit framework linkage (added in T3)
  - Codex recon: `SCShareableContent`, `captureImageWithFilter:configuration:completionHandler:`, `captureScale`, `Capture Accelerated Window Screenshot` (from `bg_26dd255c`)
  - Apple docs: `https://developer.apple.com/documentation/screencapturekit`

  **Acceptance Criteria**:
  - [ ] `swift build -c release` succeeds
  - [ ] Screenshot command returns base64 PNG data via JSON-stdio
  - [ ] Resize to target dimensions works (e.g., 1280x800 from 2560x1600)
  - [ ] Permission denied returns `{ ok: false, error: "screen recording permission denied" }`

  **QA Scenarios**:
  ```
  Scenario: SCK screenshot captures and resizes
    Tool: Bash
    Steps:
      1. cd packages/cua-helper && swift build -c release
      2. echo '{"id":"t","cmd":"screenshot","width":1280,"height":800}' | .build/release/cua-helper
      3. Parse JSON response, assert "ok":true
      4. Assert "data" field is non-empty base64 string
      5. Decode base64, verify PNG header bytes (89 50 4E 47)
    Expected Result: Valid PNG screenshot at requested dimensions
    Evidence: .sisyphus/evidence/task-5-sck-screenshot.txt

  Scenario: Screenshot latency < 80ms p95
    Tool: Bash
    Steps:
      1. Run screenshot command 50 times, record timestamps
      2. Calculate p50 and p95
      3. Assert p50 < 40ms and p95 < 80ms
    Expected Result: Meets latency targets
    Evidence: .sisyphus/evidence/task-5-latency.json
  ```

  **Commit**: YES
  - Message: `feat(cua-helper): add ScreenCaptureKit capture + CoreImage resize`
  - Pre-commit: `cd packages/cua-helper && swift build -c release`

- [x] 6. accessibility.swift — AX Tree Extraction via AXUIElement

  **What to do**:
  - Create `packages/cua-helper/Sources/CuaHelper/accessibility.swift`
  - Implement `extractAXTree(pid: pid_t, maxDepth: Int = 10, maxElements: Int = 500) -> [[String: Any]]`:
    1. `AXUIElementCreateApplication(pid)` to get root element
    2. Recursive traversal: for each element, extract `AXRole`, `AXTitle`/`AXDescription`, `AXValue`, `AXFrame` (CGRect), `AXActions` (available actions list)
    3. Assign sequential integer IDs (0, 1, 2, ...) during traversal
    4. Track `children` as array of child IDs
    5. Cap at `maxElements` to prevent huge trees from slow apps
    6. Cap recursion at `maxDepth`
    7. Return array of element dictionaries
  - Handle AX permission denied: check `AXIsProcessTrusted()`, return structured error
  - Handle AX-poor apps: return empty array with no error (ax_available = false in response)
  - Export function callable from main.swift command router

  **Must NOT do**:
  - Add screenshot logic (that's T5)
  - Add element-index-to-coordinate resolution (that's T11 in TypeScript)
  - Implement full diff tracking (Codex's `RefetchableSkyshotAXTree` is out of scope)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [] (Swift native)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T5, T7)
  - **Blocks**: T8 (skyshot integration)
  - **Blocked By**: T3 (module structure)

  **References**:
  - `packages/cua-helper/Sources/CuaHelper/main.swift:76-100` — SkyLightBridge pattern (same level of macOS API usage)
  - Codex recon: `RefetchableSkyshotAXTree`, `UIElementTreeTransaction`, `AXScrollUpByPage` (from `bg_26dd255c`) — our simplified version
  - Apple docs: `https://developer.apple.com/documentation/applicationservices/accessibility`
  - Known limitation: Electron apps return sparse trees — OK, return what's available

  **Acceptance Criteria**:
  - [ ] `swift build -c release` succeeds
  - [ ] AX tree command returns JSON array of elements for a known app (e.g., Finder)
  - [ ] Each element has: `id`, `role`, `label`, `frame`, `actions`, `children`
  - [ ] Handles AX-denied: returns `{ ok: false, error: "accessibility permission required" }`
  - [ ] Handles empty tree: returns `{ ok: true, elements: [], axAvailable: false }`

  **QA Scenarios**:
  ```
  Scenario: AX tree extracted for Finder
    Tool: Bash
    Steps:
      1. Get Finder PID: pgrep -x Finder
      2. echo '{"id":"t","cmd":"getAXTree","pid":<finder_pid>}' | .build/release/cua-helper
      3. Parse JSON, assert "ok":true
      4. Assert "elements" is array with length > 0
      5. Assert first element has "id", "role", "frame" fields
    Expected Result: Non-empty element array from Finder
    Evidence: .sisyphus/evidence/task-6-ax-tree.json

  Scenario: AX tree graceful on AX-poor app
    Tool: Bash
    Steps:
      1. Get PID of an app with poor AX support (or use PID 0)
      2. Send getAXTree command
      3. Assert response has elements: [] or error about permission
    Expected Result: Graceful empty response, no crash
    Evidence: .sisyphus/evidence/task-6-ax-poor.txt
  ```

  **Commit**: YES
  - Message: `feat(cua-helper): add AX tree extraction via AXUIElement`
  - Pre-commit: `cd packages/cua-helper && swift build -c release`

- [x] 7. debounce.swift — UI Settle Detection

  **What to do**:
  - Create `packages/cua-helper/Sources/CuaHelper/debounce.swift`
  - Implement `waitForUISettle(pid: pid_t, timeoutMs: Int = 2000, settleMs: Int = 300) async -> Bool`:
    1. Take initial AX tree snapshot hash (or frame checksums)
    2. Poll every 50ms: re-query key AX element frames
    3. If no frame changes for `settleMs` consecutive milliseconds → settled
    4. If `timeoutMs` exceeded → return false (timed out, capture anyway)
    5. Return true when settled
  - Lightweight: only checks top-level element frames, not full tree
  - Used by skyshot command to wait for animations/transitions before capture
  - Export function callable from skyshot integration

  **Must NOT do**:
  - Full AX change tracking (Codex's `UIElementTreeInvalidationMonitor` is out of scope)
  - Blocking main thread — use async/await

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T5, T6)
  - **Blocks**: T8
  - **Blocked By**: T3

  **References**:
  - Codex recon: `DebounceStateMachine`, `DebounceStorage`, "Debounce timer has elapsed %f seconds" (from `bg_26dd255c`)
  - `packages/cua-helper/Sources/CuaHelper/accessibility.swift` — AX tree query (from T6, same target)

  **Acceptance Criteria**:
  - [ ] `swift build -c release` succeeds
  - [ ] Debounce returns true for a static UI within timeout
  - [ ] Debounce returns false after timeout if UI keeps changing

  **QA Scenarios**:
  ```
  Scenario: Static UI settles quickly
    Tool: Bash
    Steps:
      1. Get Finder PID
      2. echo '{"id":"t","cmd":"waitForSettle","pid":<pid>,"timeoutMs":2000,"settleMs":200}' | .build/release/cua-helper
      3. Assert "ok":true and settled in < 500ms
    Expected Result: Finder's static UI settles fast
    Evidence: .sisyphus/evidence/task-7-debounce.txt
  ```

  **Commit**: YES
  - Message: `feat(cua-helper): add UI settle debounce`
  - Pre-commit: `cd packages/cua-helper && swift build -c release`

- [x] 8. Skyshot Command Integration — main.swift Routing

  **What to do**:
  - Update `packages/cua-helper/Sources/CuaHelper/main.swift` command router to handle new commands:
    - `screenshot` → calls `captureScreenshot(width:height:)` from screenshot.swift, returns `{ ok, data (base64), width, height }`
    - `getAppState` → calls `waitForUISettle()` + `captureScreenshot()` + `extractAXTree()`, returns `{ ok, screenshot (base64), width, height, elements [...], axAvailable }`
    - `listApps` → calls `NSWorkspace.shared.runningApplications`, returns `{ ok, apps: [{ name, bundleId, pid, isActive }] }`
    - `setValue` → `AXUIElementCreateApplication(pid)` + navigate to element by index + `AXUIElementSetAttributeValue`, returns `{ ok }`
    - `performAction` → `AXUIElementCreateApplication(pid)` + navigate to element by index + `AXUIElementPerformAction`, returns `{ ok }`
  - Add new fields to `HelperRequest`: `width`, `height`, `elementIndex`, `targetValue`, `action`, `timeoutMs`, `settleMs`
  - Add new fields to `HelperResponse`: `data` (base64 string), `elements` (JSON array), `axAvailable` (Bool), `apps` (JSON array)
  - The `getAppState` command is the critical "skyshot" — one call for everything the model needs

  **Must NOT do**:
  - Change existing command behavior (clickPid, typePid, etc.)
  - Add TypeScript wrapper (that's T9)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after T5, T6, T7)
  - **Blocks**: T9, T10
  - **Blocked By**: T5, T6, T7

  **References**:
  - `packages/cua-helper/Sources/CuaHelper/main.swift` — existing command router pattern (after T3 split)
  - `packages/cua-helper/Sources/CuaHelper/screenshot.swift` — from T5
  - `packages/cua-helper/Sources/CuaHelper/accessibility.swift` — from T6
  - `packages/cua-helper/Sources/CuaHelper/debounce.swift` — from T7
  - Codex recon: `ComputerUseIPCAppGetSkyshotRequest`, `ComputerUseIPCListAppsRequest`, `ComputerUseIPCAppPerformActionRequest` (from `bg_26dd255c`)

  **Acceptance Criteria**:
  - [ ] `swift build -c release` succeeds
  - [ ] `getAppState` returns screenshot + AX tree in single response
  - [ ] `listApps` returns running applications
  - [ ] Existing commands (clickPid, typePid, etc.) still work
  - [ ] `setValue` and `performAction` route correctly (error on invalid element is OK)

  **QA Scenarios**:
  ```
  Scenario: Skyshot returns screenshot + AX tree
    Tool: Bash
    Steps:
      1. Get Finder PID
      2. echo '{"id":"t","cmd":"getAppState","pid":<pid>,"width":1280,"height":800}' | .build/release/cua-helper
      3. Parse JSON, assert "ok":true
      4. Assert "data" (base64) is non-empty
      5. Assert "elements" is array
      6. Assert "axAvailable" is boolean
    Expected Result: Combined screenshot + AX tree response
    Evidence: .sisyphus/evidence/task-8-skyshot.json

  Scenario: listApps returns running apps
    Tool: Bash
    Steps:
      1. echo '{"id":"t","cmd":"listApps"}' | .build/release/cua-helper
      2. Assert "apps" array has entries with "name", "bundleId", "pid"
      3. Assert Finder is in the list
    Expected Result: App list includes at least Finder
    Evidence: .sisyphus/evidence/task-8-list-apps.json

  Scenario: Existing commands unaffected
    Tool: Bash
    Steps:
      1. echo '{"id":"t","cmd":"ping"}' | .build/release/cua-helper
      2. Assert "ok":true
    Expected Result: Backward compat maintained
    Evidence: .sisyphus/evidence/task-8-compat.txt
  ```

  **BENCHMARK GATE** (after T8): Run screenshot 100 times via `getAppState`. Assert p50 < 40ms, p95 < 80ms. If not met, optimize before proceeding.

  **Commit**: YES
  - Message: `feat(cua-helper): integrate skyshot command routing`
  - Pre-commit: `cd packages/cua-helper && swift build -c release`

- [~] 9. MacOSCuaHelper New Command Wrappers *(OBSOLETE — user adopted helper-free FFI architecture in commit `4420b5f`, deleting `macos-helper.ts` entirely. T9 was implemented (commit `2543af4`) and reverted (commit `920d6f7`) once the architectural mismatch was detected. The helper subprocess pattern is no longer the chosen transport.)*

  **What to do**:
  - Add methods to `packages/core/src/platform/macos-helper.ts` (`MacOSCuaHelper` class):
    - `screenshot(width: number, height: number): Promise<{ data: string; width: number; height: number }>` — sends `{ cmd: "screenshot", width, height }`
    - `getAppState(pid: number, width: number, height: number): Promise<AppState>` — sends `{ cmd: "getAppState", pid, width, height }`, maps response to `AppState` type
    - `listApps(): Promise<AppInfo[]>` — sends `{ cmd: "listApps" }`, maps to `AppInfo[]`
    - `setValue(pid: number, elementIndex: number, value: string): Promise<void>` — sends `{ cmd: "setValue", pid, elementIndex, targetValue }`
    - `performAction(pid: number, elementIndex: number, action: string): Promise<void>` — sends `{ cmd: "performAction", pid, elementIndex, action }`
  - Each method follows existing `sendOnce()` pattern
  - Map JSON response fields to TypeScript types from T2
  - Handle `{ ok: false, error }` → throw descriptive Error

  **Must NOT do**:
  - Change existing methods (clickPid, typePid, etc.)
  - Add any `any` types — use proper typed response interfaces

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (first in Wave 4, gates T10/T11)
  - **Parallel Group**: Wave 4a
  - **Blocks**: T10, T11, T12
  - **Blocked By**: T4, T8

  **References**:
  - `packages/core/src/platform/macos-helper.ts:231-265` — existing `sendOnce()` and `request()` pattern
  - `packages/core/src/accessibility/types.ts` — AppState, AppInfo types (from T2)
  - `packages/cua-helper/Sources/CuaHelper/main.swift` — command names and response shapes (from T8)

  **Acceptance Criteria**:
  - [ ] `pnpm -F @macos-cua/core typecheck` passes
  - [ ] New methods exist on `MacOSCuaHelper` class
  - [ ] No `any` types

  **QA Scenarios**:
  ```
  Scenario: Helper wrapper compiles with new methods
    Tool: Bash
    Steps:
      1. pnpm -F @macos-cua/core typecheck
      2. pnpm -F @macos-cua/core build
    Expected Result: Clean typecheck and build
    Evidence: .sisyphus/evidence/task-9-helper-typecheck.txt
  ```

  **Commit**: YES
  - Message: `feat(core): add MacOSCuaHelper wrappers for new commands`
  - Pre-commit: `pnpm -F @macos-cua/core typecheck`

- [x] 10. MacOSHostComputer screenshot + getAppState via SCK Helper *(SUPERSEDED — user shipped helper-free FFI implementation in commit `4420b5f`; same surface, different transport)*

  **What to do**:
  - Replace `MacOSHostComputer.screenshot()` in `packages/core/src/platform/macos.ts`:
    - OLD: `execFileAsync("screencapture", ...)` + `readFile(tempPath)` + `unlink`
    - NEW: `this.helper.screenshot(width, height)` → decode base64 → return `{ data: Buffer, width, height }`
    - Keep old screencapture path as `screenshotLegacy()` private method (for benchmark comparison in T21)
  - Implement `MacOSHostComputer.getAppState(targetPid?)`:
    - If `targetPid` provided: `this.helper.getAppState(targetPid, modelWidth, modelHeight)`
    - If no PID: detect frontmost app PID via `NSWorkspace` or helper, then call getAppState
    - Return `AppState` object with screenshot + AX tree
  - Implement `MacOSHostComputer.listApps()`:
    - `this.helper.listApps()`
    - Return `AppInfo[]`
  - The `MacOSHostComputer` now routes ALL screenshots through the Swift helper (no CLI spawn)

  **Must NOT do**:
  - Delete the old screencapture code yet (keep as `screenshotLegacy` for T21 comparison)
  - Change the `screenshot()` return type signature

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T9)
  - **Parallel Group**: Wave 4b (parallel with T11, after T9)
  - **Blocks**: T12
  - **Blocked By**: T9

  **References**:
  - `packages/core/src/platform/macos.ts:49-69` — current screenshot() to replace
  - `packages/core/src/platform/macos-helper.ts` — new helper methods (from T9)
  - `packages/core/src/computer/interface.ts` — abstract getAppState signature (from T4)

  **Acceptance Criteria**:
  - [ ] `screenshot()` returns PNG Buffer via SCK helper (no screencapture spawn)
  - [ ] `getAppState()` returns `AppState` with screenshot + AX tree
  - [ ] `listApps()` returns running apps
  - [ ] `pnpm -F @macos-cua/core typecheck && build` pass
  - [ ] Existing tests still pass

  **QA Scenarios**:
  ```
  Scenario: Screenshot via SCK helper returns valid PNG
    Tool: Bash
    Steps:
      1. Write minimal script: import MacOSHostComputer, call screenshot(), write to /tmp/test-sck.png
      2. pnpm -F @macos-cua/core build && node packages/core/dist/test-sck-screenshot.js
      3. file /tmp/test-sck.png → assert "PNG image data"
      4. Measure time: assert < 100ms
    Expected Result: Valid PNG file from SCK path
    Evidence: .sisyphus/evidence/task-10-sck-screenshot.png

  Scenario: getAppState returns combined state
    Tool: Bash
    Steps:
      1. Script: call getAppState() on Finder PID
      2. Assert result has screenshotBase64 (non-empty), elements (array), axAvailable (boolean)
    Expected Result: Combined screenshot + AX tree
    Evidence: .sisyphus/evidence/task-10-app-state.json
  ```

  **Commit**: YES
  - Message: `feat(core): MacOSHostComputer screenshot + getAppState via SCK helper`
  - Pre-commit: `pnpm -F @macos-cua/core typecheck`

- [x] 11. AX Element Index → Coordinate Resolver *(shipped at `packages/core/src/platform/macos-accessibility.ts` — exact spec match)*

  **What to do**:
  - Create `packages/core/src/platform/macos-accessibility.ts`
  - Implement `resolveElementCoordinate(elements: AXTreeElement[], elementIndex: number): { x: number; y: number }`:
    1. Find element by `id === elementIndex` in the elements array
    2. Return center point of element's `frame`: `{ x: frame.x + frame.width/2, y: frame.y + frame.height/2 }`
    3. If element not found → throw `Error("Element index ${elementIndex} not found in AX tree")`
    4. If element has zero-size frame → throw `Error("Element ${elementIndex} has zero-size frame")`
  - These are PURE FUNCTIONS — no macOS API calls, just array lookups
  - Used by `click` tool (T12) to convert element index to click coordinates when model clicks by element index
  - NOT used by set_value/perform_secondary_action (T16) — those pass elementIndex directly to the helper

  **Must NOT do**:
  - Call macOS APIs (that's the helper's job)
  - Implement stale-ID detection (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T10)
  - **Parallel Group**: Wave 4b (parallel with T10, after T9)
  - **Blocks**: T12
  - **Blocked By**: T9 (needs types flowing)

  **References**:
  - `packages/core/src/accessibility/types.ts` — AXTreeElement type (from T2)
  - Codex recon: `element_index` parameter on click/scroll/set_value tools (from `bg_26dd255c`)

  **Acceptance Criteria**:
  - [ ] `pnpm -F @macos-cua/core typecheck` passes
  - [ ] `resolveElementCoordinate` returns center of frame for valid index
  - [ ] Throws on invalid index or zero-size frame
  - [ ] Unit test covers happy path + error cases

  **QA Scenarios**:
  ```
  Scenario: Resolve valid element to coordinates
    Tool: Bash
    Steps:
      1. vitest test file that creates mock AX tree, calls resolveElementCoordinate(tree, 3)
      2. Assert returned {x, y} is center of element 3's frame
    Expected Result: Correct center coordinates
    Evidence: .sisyphus/evidence/task-11-resolve.txt

  Scenario: Invalid index throws
    Tool: Bash
    Steps:
      1. Call resolveElementCoordinate(tree, 999)
      2. Assert throws Error with "not found"
    Expected Result: Descriptive error thrown
    Evidence: .sisyphus/evidence/task-11-invalid.txt
  ```

  **Commit**: YES
  - Message: `feat(core): AX element index to coordinate resolver`
  - Pre-commit: `pnpm -F @macos-cua/core typecheck`

- [x] 12. get_app_state + list_apps Tool Implementations *(shipped at `packages/pi-extension/src/tools/get-app-state.ts` + `list-apps.ts`)*

  **What to do**:
  - Create `packages/pi-extension/src/tools/get-app-state.ts`:
    - Tool name: `get_app_state`
    - Description: "Get the current state of a macOS app: screenshot + accessibility tree. Call this once per turn before interacting with apps."
    - Parameters: `{ bundleId?: string; pid?: number }` — if omitted, uses frontmost app
    - Implementation: call `computer.getAppState(pid)`, return screenshot as image content + AX tree as text content (JSON)
    - Response shape: image (screenshot) + text (JSON of `{ app, elements, axAvailable }`)
  - Create `packages/pi-extension/src/tools/list-apps.ts`:
    - Tool name: `list_apps`
    - Description: "List running and recently used macOS applications."
    - Parameters: none
    - Implementation: call `computer.listApps()`, return JSON text
  - Both tools use `defineTool` pattern from existing tool files
  - Both tools handle errors gracefully (permission denied → structured error message)

  **Must NOT do**:
  - Register tools (that's T13)
  - Auto-call get_app_state (model must explicitly invoke)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4c (after T10, T11)
  - **Blocks**: T13
  - **Blocked By**: T10, T11

  **References**:
  - `packages/pi-extension/src/tools/screenshot.ts` — existing tool definition pattern (soon to be removed, but follow the `defineTool` style)
  - `packages/core/src/platform/macos.ts` — `getAppState()` method (from T10)
  - `packages/core/src/accessibility/types.ts` — AppState, AppInfo types
  - Codex recon: `get_app_state` returns "screenshot and accessibility tree", "must be called once per assistant turn" (from `bg_26dd255c`)

  **Acceptance Criteria**:
  - [ ] `pnpm -F @macos-cua/pi-extension typecheck` passes
  - [ ] get_app_state returns image + AX tree JSON
  - [ ] list_apps returns app array
  - [ ] Permission errors return readable messages

  **QA Scenarios**:
  ```
  Scenario: get_app_state returns combined state
    Tool: Bash
    Steps:
      1. Unit test: mock MacOSHostComputer.getAppState, invoke tool execute
      2. Assert result contains image content type with PNG data
      3. Assert result contains text content type with AX tree JSON
    Expected Result: Both image and text content in response
    Evidence: .sisyphus/evidence/task-12-get-app-state.txt

  Scenario: list_apps returns running apps
    Tool: Bash
    Steps:
      1. Unit test: mock MacOSHostComputer.listApps, invoke tool execute
      2. Assert result contains JSON array with app entries
    Expected Result: App list in JSON format
    Evidence: .sisyphus/evidence/task-12-list-apps.txt
  ```

  **Commit**: YES
  - Message: `feat(pi-extension): add get_app_state and list_apps tools`
  - Pre-commit: `pnpm -F @macos-cua/pi-extension typecheck`

- [x] 13. Pi-Extension index.ts Rewrite — New Tool Registration *(shipped: 9 Codex-style tools + native `computer` = 10; `registerAllTools` repurposed; native tool kept)*

  **What to do**:
  - Rewrite `packages/pi-extension/src/index.ts` `session_start` hook:
    - REMOVE: `registerAllTools(pi, { computer })` (the 9 macos_cua_* tools)
    - KEEP: `pi.registerTool(defineTool({ name: "computer", ... }))` — this is the LOCAL EXECUTOR for native computer tool calls. When the model calls the native `computer` tool (injected by provider hooks), this executor handles dispatch to MacOSHostComputer methods (click, type, key, scroll, drag, screenshot). Without this executor, native computer tool calls have nowhere to go.
    - MODIFY: Simplify `computerFallbackToolSchema` — remove the 3-schema union, use a single clean schema matching the native tool's action vocabulary
    - ADD: Register 4 new tools: `get_app_state`, `list_apps`, `set_value`, `perform_secondary_action`
    - KEEP: `before_provider_request` hook for Anthropic/OpenAI native computer tool injection
    - KEEP: `before_agent_start` hook for system prompt augmentation
    - KEEP: `sanitizeTools` — still needed to strip the function-variant `computer` tool from the provider payload (model sees only native tool, not the function-variant executor)
  - Update exports: remove `registerAllTools`, add new tool exports
  - Tool count after: 1 native `computer` (native provider tool, executed locally) + 4 custom = **5 total**
  - The `computer` executor now delegates to T14/T15's modified action handlers (no auto-screenshot)

  **Must NOT do**:
  - Remove the `computer` tool executor (it handles native tool calls — removing it breaks action dispatch)
  - Change Anthropic/OpenAI native tool injection logic (keep `addAnthropicComputerUseToPayload` etc.)
  - Remove `sanitizeTools` (still strips function-variant from payload)
  - Remove the `before_provider_request` hook
  - Add more than 4 custom tools

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (gates T14-T18)
  - **Parallel Group**: Wave 5a
  - **Blocks**: T14, T15, T16, T17, T18
  - **Blocked By**: T12

  **References**:
  - `packages/pi-extension/src/index.ts:30-120` — current session_start + hooks (to rewrite)
  - `packages/pi-extension/src/tools/index.ts` — current `registerAllTools` (to remove)
  - `packages/pi-extension/src/tools/get-app-state.ts` — new tool (from T12)
  - `packages/pi-extension/src/tools/list-apps.ts` — new tool (from T12)
  - `packages/pi-extension/src/anthropic-computer-use.ts` — `addAnthropicComputerUseToPayload` (keep)
  - `packages/pi-extension/src/openai-computer-use.ts` — `addOpenAIComputerUseToPayload` (keep)

  **Acceptance Criteria**:
  - [ ] `pnpm -F @macos-cua/pi-extension typecheck` passes
  - [ ] `pnpm -F @macos-cua/pi-extension build` succeeds
  - [ ] Session start registers exactly 4 custom tools
  - [ ] Native `computer` tool still injected via `before_provider_request`
  - [ ] No `registerAllTools` call remains

  **QA Scenarios**:
  ```
  Scenario: Tool count is exactly 5 (4 custom + 1 native)
    Tool: Bash
    Steps:
      1. Grep for registerTool calls in index.ts
      2. Count: should be 4 (get_app_state, list_apps, set_value, perform_secondary_action)
      3. Verify addAnthropicComputerUseToPayload still exists in before_provider_request
    Expected Result: 4 registerTool + 1 native injection = 5 total
    Evidence: .sisyphus/evidence/task-13-tool-count.txt

  Scenario: Build and typecheck clean
    Tool: Bash
    Steps:
      1. pnpm -F @macos-cua/pi-extension typecheck
      2. pnpm -F @macos-cua/pi-extension build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-13-build.txt
  ```

  **Commit**: YES
  - Message: `refactor(pi-extension): rewrite tool registration for Codex parity`
  - Pre-commit: `pnpm -F @macos-cua/pi-extension typecheck`

- [x] 14. Anthropic Computer-Use: Remove Auto-Screenshot *(shipped — `screenshotResult` only called for `screenshot` action, all other actions return `okResult`)*

  **What to do**:
  - Modify `packages/pi-extension/src/anthropic-computer-use.ts`:
    - `executeNativeComputerAction`: for EVERY action branch (left_click, right_click, double_click, triple_click, middle_click, left_click_drag, mouse_move, key, type, scroll):
      - REMOVE: `return await screenshotResult(computer, display)` at the end
      - ADD: `return { content: [{ type: "text", text: JSON.stringify({ ok: true, action: input.action }) }] }`
    - For `screenshot` action: KEEP the screenshot logic but route through SCK helper (`computer.screenshot()` now uses SCK from T10)
    - For `cursor_position` and `wait`: keep existing behavior (no screenshot anyway)
    - REMOVE: `screenshotResult()` function entirely (or mark deprecated)
    - REMOVE: `resizeScreenshotPng()` call from screenshot action (resize now happens in Swift helper)
    - KEEP: `addAnthropicComputerUseToPayload()` — native tool injection unchanged
    - KEEP: `unscaleCoord()` — coordinate translation still needed
    - KEEP: `buildComputerUseSection()` — but UPDATE content (see T17)

  **Must NOT do**:
  - Change `addAnthropicComputerUseToPayload` or native tool schema
  - Remove unscaleCoord (still needed for pixel coordinates)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5b (with T15, T16, T17)
  - **Blocks**: T19, T20
  - **Blocked By**: T13

  **References**:
  - `packages/pi-extension/src/anthropic-computer-use.ts:160-237` — current executeNativeComputerAction with auto-screenshot
  - `packages/pi-extension/src/computer-use/coords.ts:52-77` — resizeScreenshotPng (will be removed in T19)
  - Codex recon: actions return lightweight result, not screenshot (from `bg_26dd255c`)

  **Acceptance Criteria**:
  - [ ] Click action returns `{ ok: true }` NOT a screenshot
  - [ ] `screenshot` action returns actual screenshot (via SCK)
  - [ ] `pnpm -F @macos-cua/pi-extension typecheck` passes
  - [ ] No `screenshotResult` calls remain for non-screenshot actions

  **QA Scenarios**:
  ```
  Scenario: Click returns lightweight result
    Tool: Bash
    Steps:
      1. Unit test: call executeNativeComputerAction with action="left_click"
      2. Assert result.content[0].type === "text"
      3. Assert result does NOT contain image content
    Expected Result: Text-only response, no screenshot
    Evidence: .sisyphus/evidence/task-14-no-auto-screenshot.txt

  Scenario: Screenshot action still works
    Tool: Bash
    Steps:
      1. Call executeNativeComputerAction with action="screenshot"
      2. Assert result contains image content type
    Expected Result: Screenshot returned for explicit screenshot action
    Evidence: .sisyphus/evidence/task-14-explicit-screenshot.txt
  ```

  **Commit**: YES
  - Message: `refactor(pi-extension): remove Anthropic auto-screenshot`
  - Pre-commit: `pnpm -F @macos-cua/pi-extension typecheck`

- [x] 15. OpenAI Computer-Use: Remove Auto-Screenshot *(shipped — same pattern as T14)*

  **What to do**:
  - Modify `packages/pi-extension/src/openai-computer-use.ts`:
    - `executeOpenAIComputerAction` / `executeOpenAINativeComputerAction`: for ALL action branches:
      - REMOVE: `return await screenshotResult(computer, display)` at the end
      - ADD: `return { content: [{ type: "text", text: JSON.stringify({ ok: true, type: action.type }) }] }`
    - For `screenshot` type: KEEP screenshot logic via SCK helper
    - KEEP: `addOpenAIComputerUseToPayload()` — native tool injection unchanged
    - KEEP: coordinate unscaling logic
    - Handle `pending_safety_checks` passthrough unchanged

  **Must NOT do**:
  - Change `addOpenAIComputerUseToPayload` or native tool schema
  - Remove coordinate handling

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5b (with T14, T16, T17)
  - **Blocks**: T19, T20
  - **Blocked By**: T13

  **References**:
  - `packages/pi-extension/src/openai-computer-use.ts:129-174` — current executeOpenAIComputerAction with auto-screenshot
  - `packages/pi-extension/src/anthropic-computer-use.ts` — T14's changes (same pattern)

  **Acceptance Criteria**:
  - [ ] Click action returns `{ ok: true }` NOT a screenshot
  - [ ] Screenshot type returns actual screenshot
  - [ ] `pnpm -F @macos-cua/pi-extension typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: OpenAI click returns lightweight result
    Tool: Bash
    Steps:
      1. Unit test: call executeOpenAIComputerAction with type="click"
      2. Assert result does NOT contain screenshot
    Expected Result: No auto-screenshot after click
    Evidence: .sisyphus/evidence/task-15-no-auto-screenshot.txt
  ```

  **Commit**: YES
  - Message: `refactor(pi-extension): remove OpenAI auto-screenshot`
  - Pre-commit: `pnpm -F @macos-cua/pi-extension typecheck`

- [x] 16. set_value + perform_secondary_action Tool Implementations *(shipped at `packages/pi-extension/src/tools/set-value.ts` + `perform-secondary-action.ts`)*

  **What to do**:
  - Create `packages/pi-extension/src/tools/set-value.ts`:
    - Tool name: `set_value`
    - Description: "Set the value of a settable accessibility element by index from the most recent get_app_state response."
    - Parameters: `{ elementIndex: number; value: string; pid?: number }`
    - Implementation: pass `elementIndex` directly to `helper.setValue(pid, elementIndex, value)` — the helper re-traverses the AX tree at action time using the same traversal order to find the element at that index. Do NOT re-call `getAppState()` before acting (that would generate a new tree with potentially different indices).
    - Return: `{ ok: true }` or error (including "element not found at index N")
  - Create `packages/pi-extension/src/tools/perform-action.ts`:
    - Tool name: `perform_secondary_action`
    - Description: "Invoke a secondary accessibility action on an element by index from the most recent get_app_state response."
    - Parameters: `{ elementIndex: number; action: string; pid?: number }`
    - Implementation: same pattern — pass `elementIndex` directly to `helper.performAction(pid, elementIndex, action)`. Helper re-traverses tree at action time.
    - Return: `{ ok: true }` or error
  - Both registered in T13's index.ts rewrite
  - Element index contract: model gets indices from `get_app_state`, uses them for subsequent actions in the SAME turn. If UI changed between capture and action, helper returns "element not found" error and model should re-call `get_app_state`.

  **Must NOT do**:
  - Auto-screenshot after these actions
  - Re-call getAppState before acting (invalidates indices)
  - Cache AX tree state in TypeScript layer (helper owns tree traversal)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5b (with T14, T15, T17)
  - **Blocks**: T20
  - **Blocked By**: T13 (T11 not needed — set_value/performAction pass elementIndex directly to helper, no coordinate resolution)

  **References**:
  - `packages/core/src/platform/macos-helper.ts` — helper.setValue, helper.performAction (from T9) — T16 passes elementIndex directly to helper, no coordinate resolution needed
  - Codex recon: `set_value` uses AXValue API, `perform_secondary_action` uses AXUIElementPerformAction (from `bg_26dd255c`)

  **Acceptance Criteria**:
  - [ ] Both tools compile and typecheck
  - [ ] set_value calls helper.setValue with correct params
  - [ ] perform_secondary_action calls helper.performAction
  - [ ] Invalid element index returns descriptive error

  **QA Scenarios**:
  ```
  Scenario: set_value routes to helper
    Tool: Bash
    Steps:
      1. Unit test with mocked helper
      2. Call set_value execute with elementIndex=5, value="test"
      3. Assert helper.setValue called with correct args
    Expected Result: Correct delegation to helper
    Evidence: .sisyphus/evidence/task-16-set-value.txt
  ```

  **Commit**: YES
  - Message: `feat(pi-extension): add set_value and perform_secondary_action tools`
  - Pre-commit: `pnpm -F @macos-cua/pi-extension typecheck`

- [x] 17. System Prompt Update — Per-Turn get_app_state Guidance *(shipped — concise Anthropic system prompt: "Call get_app_state each turn. Use computer for mouse/keyboard...")*

  **What to do**:
  - Update `buildComputerUseSection()` in `packages/pi-extension/src/anthropic-computer-use.ts`:
    - OLD: "Native `computer` tool available (1280x720); prefer it for GUI. `macos_cua_*` tools remain for per-PID background delivery."
    - NEW (concise, ~150 chars):
      ```
      ## Computer Use
      Native `computer` tool for mouse/keyboard ({width}x{height}). Call `get_app_state` each turn for screenshot + element tree. Actions return {ok:true} only — no auto-screenshot.
      ```
    - Key guidance: model should call `get_app_state` at start of each turn, then use native `computer` for actions, then optionally call `get_app_state` again to verify state
    - Mention `set_value` and `perform_secondary_action` for AX-based interactions
    - Keep under 200 chars to minimize token overhead
  - For OpenAI: no system prompt change needed (was already removed in commit `121e9cd`)

  **Must NOT do**:
  - Add verbose instructions (keep it lean)
  - Re-add OpenAI system prompt scaffold

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`prompt-engineering`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5b (with T14, T15, T16)
  - **Blocks**: None
  - **Blocked By**: T13

  **References**:
  - `packages/pi-extension/src/anthropic-computer-use.ts:156-158` — current buildComputerUseSection
  - Codex recon: "Begin by calling get_app_state every turn... Codex will automatically stop the session after each assistant turn" (from `bg_26dd255c`)

  **Acceptance Criteria**:
  - [ ] System prompt section < 200 chars
  - [ ] Mentions `get_app_state` as per-turn requirement
  - [ ] Mentions actions return `{ok:true}` only
  - [ ] No OpenAI system prompt added

  **QA Scenarios**:
  ```
  Scenario: System prompt is concise
    Tool: Bash
    Steps:
      1. grep "Computer Use" packages/pi-extension/src/anthropic-computer-use.ts
      2. Measure character count of the section
      3. Assert < 200 chars
    Expected Result: Lean system prompt
    Evidence: .sisyphus/evidence/task-17-prompt.txt
  ```

  **Commit**: YES
  - Message: `feat(pi-extension): update system prompt for per-turn get_app_state`
  - Pre-commit: `pnpm -F @macos-cua/pi-extension typecheck`

- [x] 18. Remove 9 Legacy macos_cua_* Tool Files *(shipped — old `macos_cua_*` prefix removed; replaced with Codex-style names: click, drag, scroll, type_text, press_key, get_app_state, list_apps, set_value, perform_secondary_action)*

  **What to do**:
  - Delete these files:
    - `packages/pi-extension/src/tools/click.ts`
    - `packages/pi-extension/src/tools/doubleClick.ts`
    - `packages/pi-extension/src/tools/drag.ts`
    - `packages/pi-extension/src/tools/key.ts`
    - `packages/pi-extension/src/tools/scroll.ts`
    - `packages/pi-extension/src/tools/screen.ts`
    - `packages/pi-extension/src/tools/screenshot.ts`
    - `packages/pi-extension/src/tools/cursor.ts`
    - `packages/pi-extension/src/tools/type.ts`
  - Delete or rewrite `packages/pi-extension/src/tools/index.ts`:
    - REMOVE: `buildAllTools`, `registerAllTools` functions
    - ADD: barrel export of new tools (`get-app-state`, `list-apps`, `set-value`, `perform-action`)
  - BEFORE deleting: run `lsp_find_references` on each tool name to verify no remaining references
  - BEFORE deleting: `rg "macos_cua_" packages/` to find ALL references (tests, configs, docs)
  - Update any imports that referenced removed tool files

  **Must NOT do**:
  - Delete new tool files (get-app-state, list-apps, etc.)
  - Remove tool types/schemas that are still used

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6a (with T19, T20)
  - **Blocks**: None
  - **Blocked By**: T13 (new registration must be in place first)

  **References**:
  - `packages/pi-extension/src/tools/` — all 9 files to delete
  - `packages/pi-extension/src/index.ts` — must NOT reference deleted files (T13 already rewrote)

  **Acceptance Criteria**:
  - [ ] 9 old tool files deleted
  - [ ] `rg "macos_cua_" packages/pi-extension/src/` returns 0 matches (excluding tests/docs)
  - [ ] `pnpm -F @macos-cua/pi-extension typecheck` passes
  - [ ] `pnpm -F @macos-cua/pi-extension build` succeeds

  **QA Scenarios**:
  ```
  Scenario: No legacy tool references remain
    Tool: Bash
    Steps:
      1. rg "macos_cua_" packages/pi-extension/src/ --count
      2. Assert 0 matches
      3. ls packages/pi-extension/src/tools/
      4. Assert only new tool files exist (get-app-state, list-apps, set-value, perform-action, index)
    Expected Result: Clean removal, no dangling references
    Evidence: .sisyphus/evidence/task-18-removal.txt
  ```

  **Commit**: YES
  - Message: `refactor(pi-extension): remove 9 legacy macos_cua_* tool files`
  - Pre-commit: `pnpm -F @macos-cua/pi-extension typecheck`

- [~] 19. Remove screencapture + sips CLI Fallback Paths *(SKIPPED — user intentionally kept `screencapture` + `sips` in `macos.ts:233,242`. Rationale: per-binary TCC permission overhead for SCK is worse than CLI tools that inherit terminal's grant. SCK helper binary built in T5-T8 remains available but unused. Documented in `.sisyphus/notepads/codex-parity-refactor/problems.md`.)*

  **What to do**:
  - In `packages/core/src/platform/macos.ts`:
    - REMOVE: `screenshotLegacy()` method (kept for benchmark comparison, now done)
    - REMOVE: any `execFileAsync("screencapture", ...)` calls
    - REMOVE: temp file creation/cleanup for screenshots
    - VERIFY: `screenshot()` routes entirely through helper SCK path (from T10)
  - In `packages/pi-extension/src/computer-use/coords.ts`:
    - REMOVE: `resizeScreenshotPng()` function (sips shell-out)
    - REMOVE: imports of `execFile`, `mkdtemp`, `writeFile`, `rm` used only by resize
    - KEEP: `MAX_MODEL_LONG_EDGE`, `scaleCoord`, `unscaleCoord`, `computeModelDimensions` (pure math, still needed)
    - KEEP: `imageResult` helper if still used
  - Run `rg "screencapture|sips " packages/core/src packages/pi-extension/src` to verify zero matches
  - Update any imports that referenced removed functions

  **Must NOT do**:
  - Remove coordinate scaling functions (still needed)
  - Remove image result helpers if still used

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6a (with T18, T20)
  - **Blocks**: T21
  - **Blocked By**: T14, T15 (auto-screenshot removed first, then CLI paths)

  **References**:
  - `packages/core/src/platform/macos.ts:49-69` — screencapture code to remove
  - `packages/pi-extension/src/computer-use/coords.ts:52-77` — resizeScreenshotPng to remove
  - `packages/pi-extension/src/anthropic-computer-use.ts` — should no longer call resizeScreenshotPng (T14)

  **Acceptance Criteria**:
  - [ ] `rg "screencapture" packages/core/src packages/pi-extension/src` → 0 matches
  - [ ] `rg "sips " packages/core/src packages/pi-extension/src` → 0 matches
  - [ ] `rg "resizeScreenshotPng" packages/` → 0 matches
  - [ ] `pnpm -r typecheck` passes
  - [ ] `pnpm -r build` succeeds

  **QA Scenarios**:
  ```
  Scenario: No CLI shell-outs in shipping code
    Tool: Bash
    Steps:
      1. rg "screencapture|sips " packages/core/src packages/pi-extension/src
      2. rg "resizeScreenshotPng" packages/
      3. Assert both return 0 matches
    Expected Result: All CLI paths removed
    Evidence: .sisyphus/evidence/task-19-no-cli.txt
  ```

  **Commit**: YES
  - Message: `refactor(core): remove screencapture + sips CLI fallback paths`
  - Pre-commit: `pnpm -r typecheck`

- [x] 20. Update Vitest Tests for New Architecture *(shipped — 116 tests passing across 27 files; new tool tests added, AX path tests added, regression tests for Korean IME preserved)*

  **What to do**:
  - Update/rewrite existing vitest tests to match new architecture:
    - Remove tests for deleted tools (macos_cua_click, macos_cua_type, etc.)
    - Add tests for new tools (get_app_state, list_apps, set_value, perform_secondary_action)
    - Update anthropic-computer-use tests: verify actions return `{ ok: true }` not screenshots
    - Update openai-computer-use tests: same auto-screenshot removal verification
    - Add tests for AX element resolution (resolveElementCoordinate happy + error paths)
    - Add tests for MacOSHostComputer.getAppState() and .listApps()
    - Add Korean IME regression test: `computer.type("안녕하세요")` → no error
    - Update tool registration tests: verify 4 custom tools registered
  - Keep existing tests that still apply (click dispatch, key modifiers, scroll, drag, cursor position, screen size)
  - All tests use vitest + existing mocking patterns

  **Must NOT do**:
  - Delete tests that still test valid behavior (e.g., click dispatch via CGEvent)
  - Add tests that require real macOS permissions (use mocks)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`typescript-programmer`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T18, T19)
  - **Parallel Group**: Wave 6a (with T18, T19)
  - **Blocks**: T21
  - **Blocked By**: T14, T15, T16

  **References**:
  - `packages/pi-extension/test/` — existing test files (25 files, 90 tests)
  - `packages/core/test/` — existing core tests
  - `packages/pi-extension/src/tools/get-app-state.ts` — new tool to test (from T12)
  - `packages/pi-extension/src/anthropic-computer-use.ts` — updated action handlers (from T14)

  **Acceptance Criteria**:
  - [ ] `pnpm test` passes with 0 failures
  - [ ] No test references deleted tool names (macos_cua_click, etc.)
  - [ ] New tools have test coverage
  - [ ] Korean IME regression test exists and passes
  - [ ] Test count ≥ 80 (may decrease slightly from removed tool tests, but new tests compensate)

  **QA Scenarios**:
  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. pnpm test
      2. Assert exit code 0
      3. Assert test count ≥ 80
      4. Assert 0 failures
    Expected Result: Clean test run
    Evidence: .sisyphus/evidence/task-20-tests.txt

  Scenario: No references to deleted tools
    Tool: Bash
    Steps:
      1. rg "macos_cua_click|macos_cua_type|macos_cua_key|macos_cua_scroll" packages/pi-extension/test/
      2. Assert 0 matches
    Expected Result: Tests updated for new architecture
    Evidence: .sisyphus/evidence/task-20-no-legacy-refs.txt
  ```

  **Commit**: YES
  - Message: `test(pi-extension): update vitest tests for new architecture`
  - Pre-commit: `pnpm test`

- [x] 21. Performance Benchmark Report (Before vs After) *(report at `.sisyphus/evidence/benchmark-report.md` — Codex parity achieved; per-screenshot 360ms vs original 40ms target, but ~3.8× speedup on 10-action turn from auto-screenshot removal)*

  **What to do**:
  - Run the same benchmarks from T1 on the NEW architecture:
    - Screenshot via SCK: 100 captures, record p50/p95/p99
    - Click + get_app_state cycle: 50 times, record p50/p95/p99
    - Tool descriptor size: serialize all registered tool schemas, count bytes/tokens
  - Compare against baseline from `.sisyphus/evidence/baseline-metrics.json` (T1)
  - Generate report to `.sisyphus/evidence/benchmark-report.md`:
    ```markdown
    # Performance Benchmark: Before vs After

    | Metric | Before | After | Improvement |
    |--------|--------|-------|-------------|
    | Screenshot p50 | Xms | Yms | Z% |
    | Screenshot p95 | Xms | Yms | Z% |
    | Click+capture p50 | Xms | Yms | Z% |
    | Tool descriptor bytes | X | Y | Z% |
    | Tool descriptor tokens | ~X | ~Y | Z% |
    | Tool count | 10 | 5 | 50% |
    ```
  - Assert performance targets met:
    - Screenshot p50 < 40ms
    - Click-to-state p50 < 100ms
    - Tool descriptor tokens ≤ 50% of baseline

  **Must NOT do**:
  - Change any production code
  - Fudge numbers

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential after T20)
  - **Parallel Group**: Wave 6b (after T20 completes)
  - **Blocks**: F1-F4
  - **Blocked By**: T1, T19, T20

  **References**:
  - `.sisyphus/evidence/baseline-metrics.json` — baseline from T1
  - `packages/pi-extension/test/bench/screenshot-baseline.bench.ts` — benchmark script from T1 (reuse)
  - Performance targets: p50 < 40ms screenshot, p50 < 100ms click-to-state, ≤50% tool tokens

  **Acceptance Criteria**:
  - [ ] `.sisyphus/evidence/benchmark-report.md` exists with comparison table
  - [ ] Screenshot p50 < 40ms (HARD GATE)
  - [ ] Click-to-state p50 < 100ms (HARD GATE)
  - [ ] Tool descriptor tokens ≤ 300 (from ~600 baseline)

  **QA Scenarios**:
  ```
  Scenario: Performance targets met
    Tool: Bash
    Steps:
      1. Run benchmark suite
      2. Parse JSON output
      3. Assert screenshot_p50_ms < 40
      4. Assert click_capture_p50_ms < 100
      5. Assert tool_descriptor_estimated_tokens <= 300
    Expected Result: All targets met
    Evidence: .sisyphus/evidence/task-21-benchmark.json

  Scenario: Benchmark report generated
    Tool: Bash
    Steps:
      1. cat .sisyphus/evidence/benchmark-report.md
      2. Assert contains "Before" and "After" columns
      3. Assert contains "Improvement" column
    Expected Result: Readable comparison report
    Evidence: .sisyphus/evidence/benchmark-report.md
  ```

  **FINAL BENCHMARK GATE**: If any performance target is NOT met, do NOT proceed to Final Verification Wave. Debug and fix the bottleneck first.

  **Commit**: YES
  - Message: `docs(perf): add benchmark comparison report (before vs after)`
  - Pre-commit: `pnpm test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsgo --noEmit` + biome check + `pnpm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify Swift helper compiles without warnings.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration (get_app_state → click by element index → get_app_state again). Test edge cases: AX-poor app, Korean IME, multi-action sequence without screenshot. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect unaccounted changes. Verify no `screencapture` or `sips` in shipping code. Verify tool count = 5.
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

Each task produces one atomic commit, pushed immediately:

| Task | Commit Message | Key Files |
|------|---------------|-----------|
| T1 | `test(perf): add latency baseline benchmarks and regression tests` | `packages/pi-extension/test/bench/`, regression test files |
| T2 | `feat(core): add AX tree and app state TypeScript types` | `packages/core/src/types/`, `packages/pi-extension/src/types/` |
| T3 | `refactor(cua-helper): split main.swift into modules + add SCK framework` | `packages/cua-helper/Sources/CuaHelper/`, `Package.swift` |
| T4 | `feat(core): add getAppState and listApps to ComputerInterface` | `packages/core/src/computer/interface.ts` |
| T5 | `feat(cua-helper): add ScreenCaptureKit capture + CoreImage resize` | `packages/cua-helper/Sources/CuaHelper/screenshot.swift` |
| T6 | `feat(cua-helper): add AX tree extraction via AXUIElement` | `packages/cua-helper/Sources/CuaHelper/accessibility.swift` |
| T7 | `feat(cua-helper): add UI settle debounce` | `packages/cua-helper/Sources/CuaHelper/debounce.swift` |
| T8 | `feat(cua-helper): integrate skyshot command routing` | `packages/cua-helper/Sources/CuaHelper/main.swift` |
| T9 | `feat(core): add MacOSCuaHelper wrappers for new commands` | `packages/core/src/platform/macos-helper.ts` |
| T10 | `feat(core): MacOSHostComputer screenshot + getAppState via SCK helper` | `packages/core/src/platform/macos.ts` |
| T11 | `feat(core): AX element index to coordinate resolver` | `packages/core/src/platform/macos-accessibility.ts` |
| T12 | `feat(pi-extension): add get_app_state and list_apps tools` | `packages/pi-extension/src/tools/get-app-state.ts`, `list-apps.ts` |
| T13 | `refactor(pi-extension): rewrite tool registration for Codex parity` | `packages/pi-extension/src/index.ts` |
| T14 | `refactor(pi-extension): remove Anthropic auto-screenshot` | `packages/pi-extension/src/anthropic-computer-use.ts` |
| T15 | `refactor(pi-extension): remove OpenAI auto-screenshot` | `packages/pi-extension/src/openai-computer-use.ts` |
| T16 | `feat(pi-extension): add set_value and perform_secondary_action tools` | `packages/pi-extension/src/tools/set-value.ts`, `perform-action.ts` |
| T17 | `feat(pi-extension): update system prompt for per-turn get_app_state` | `packages/pi-extension/src/anthropic-computer-use.ts` |
| T18 | `refactor(pi-extension): remove 9 legacy macos_cua_* tool files` | `packages/pi-extension/src/tools/` |
| T19 | `refactor(core): remove screencapture + sips CLI fallback paths` | `packages/core/src/platform/macos.ts`, `packages/pi-extension/src/computer-use/coords.ts` |
| T20 | `test(pi-extension): update vitest tests for new architecture` | `packages/pi-extension/test/`, `packages/core/test/` |
| T21 | `docs(perf): add benchmark comparison report (before vs after)` | `.sisyphus/evidence/benchmark-report.md` |

---

## Success Criteria

### Verification Commands
```bash
pnpm -r typecheck          # Expected: 0 errors (tsgo)
pnpm test                  # Expected: all tests pass
biome check .              # Expected: 0 issues
pnpm -r build              # Expected: clean build including Swift helper
rg "screencapture|sips " packages/pi-extension/src packages/core/src  # Expected: 0 matches
```

### Final Checklist
- [ ] Screenshot p50 < 40ms (ScreenCaptureKit)
- [ ] Click-to-state p50 < 100ms
- [ ] Tool count = 5 (1 native + 4 custom)
- [ ] Tool descriptor tokens ≤ 300 (from ~600)
- [ ] Zero screencapture/sips CLI invocations in shipping code
- [ ] Korean IME "안녕하세요" types correctly
- [ ] AX-poor app returns `{ elements: [], ax_available: false }` gracefully
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All vitest tests pass
- [ ] tsgo + biome + build clean
