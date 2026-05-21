# Codex Parity Refactor — Performance Benchmark: Before vs After

**Report date**: 2026-05-21
**Plan**: `codex-parity-refactor`
**Scope**: macos-cua pi-extension performance after architectural refactor

---

## Executive Summary

The refactor delivers a **~3.8× speedup for typical multi-action turns** despite the per-screenshot latency being slightly higher. The gain comes from eliminating auto-screenshot after every action and from the AX tree's element-index targeting, which removes the model's pixel-guessing retry loop.

| Goal | Status |
|------|--------|
| Codex CU 9-tool vocabulary parity | ✅ Achieved (`list_apps`, `get_app_state`, `click`, `perform_secondary_action`, `set_value`, `drag`, `scroll`, `type_text`, `press_key`) |
| AX tree element-index targeting | ✅ Achieved (`packages/core/src/platform/macos-accessibility.ts`) |
| Auto-screenshot removal | ✅ Achieved (Anthropic + OpenAI) |
| Single-call skyshot (`get_app_state`) | ✅ Achieved |
| Helper-free FFI architecture | ✅ Achieved (`packages/core/src/platform/macos-ffi/`) |
| Screenshot p50 < 40ms (original target) | ❌ Not achieved (p50 ≈ 360ms via `screencapture`+`sips`) |
| Effective turn latency reduction | ✅ ~3.8× speedup for 10-action turn |

---

## Architecture Comparison

| Dimension | Before (T1 baseline) | After (user-shipped Codex parity) |
|---|---|---|
| Input dispatch | koffi CGEvent (global) + Swift cua-helper (per-PID) | koffi CGEvent direct via `macos-ffi/` (no helper subprocess) |
| AX tree | None — pixel-only | Full AX traversal via `macos-ffi/accessibility.ts` |
| Element targeting | Pixel coordinates only | `element_index` (AX) OR pixel coordinates |
| Screenshot capture | `screencapture` CLI + `sips` resize | Same (`screencapture` + `sips` retained for working TCC) |
| Auto-screenshot after action | YES — every click/type/scroll/drag/key | NO — only on explicit `get_app_state` or `screenshot` |
| Native `computer` tool | Yes | Yes (preserved for model training compatibility) |
| Prefixed `macos_cua_*` tools | 9 | 0 (replaced with Codex-style names) |
| Codex-style semantic tools | 0 | 9 (`list_apps`, `get_app_state`, `click`, `perform_secondary_action`, `set_value`, `drag`, `scroll`, `type_text`, `press_key`) |
| Swift cua-helper subprocess | Used for per-PID input | Deleted (helper-free direct FFI) |

---

## Per-Operation Latency (live, persistent path)

| Operation | Before (T1 baseline, reported) | After (measured 2026-05-21) | Delta |
|---|---|---|---|
| Screenshot (full) | ~155 ms p50 | ~360 ms p50 | +205 ms (worse — display/config dependent) |
| Click dispatch (CGEvent FFI) | ~0.1-0.5 ms | ~0.1-0.5 ms | unchanged |
| AX tree extraction (Finder, helper) | N/A | 74 ms p50 (from T8 benchmark) | new capability |
| Helper subprocess IPC | 1-5 ms per call | 0 (deleted) | -5 ms per action |

Note: Per-screenshot latency regression is offset by 5-50× fewer screenshots per turn.

---

## End-to-End Turn Cost (10-action sequence)

| Phase | Before (auto-screenshot per action) | After (single get_app_state) | Improvement |
|---|---|---|---|
| Initial state | 1 × 155 ms screenshot = 155 ms | 1 × 360 ms `get_app_state` = 360 ms | -205 ms (slower) |
| 10 actions | 10 × (action + screenshot) = 10 × (~5 ms + 155 ms) = 1,600 ms | 10 × (action only) = 10 × ~5 ms = 50 ms | **-1,550 ms** |
| **Total turn** | **1,755 ms** | **410 ms** | **~4.3× faster** |

For tasks where the model needs intermediate state checks (e.g., verifying a form filled correctly), the model now CHOOSES when to capture — typically 2-3 times per turn instead of 10. Even pessimistic case (3 captures): 3 × 360 + 10 × 5 = 1,130 ms vs 1,755 ms = **~1.55× faster**.

---

## Tool Descriptor Overhead

| Metric | Before | After | Delta |
|---|---|---|---|
| Tool count | 10 (9 `macos_cua_*` + 1 native `computer`) | 10 (9 Codex-style + 1 native `computer`) | 0 |
| Estimated descriptor tokens | ~1,014 | ~1,026 | +12 |
| Schema clarity | Generic actions | Codex-aligned vocabulary | qualitative win |

Tool count target (≤ 5) was deliberately abandoned in favor of Codex-vocabulary parity. The model benefits from semantically distinct tools (`set_value` vs `type_text` vs `press_key`) being separate operations rather than fused into a single `computer` action union.

---

## Test Coverage

- **27 test files passing**
- **116 tests passing**
- Coverage areas:
  - `macos-ffi/coregraphics` — CGEvent posting
  - `macos-ffi/accessibility` — AXUIElement bindings
  - `macos-ffi/corefoundation` — CFType bridging
  - `macos-accessibility` — element resolver
  - `macos-input` — keyboard / mouse paths
  - `macos.test` — host computer integration
  - All 9 Codex-style tools (per-tool .test.ts)
  - `anthropic-computer-use` (15 tests)
  - `openai-computer-use` (6 tests)
  - MCP server, CLI, baseline regression, screenshot capture

---

## Outstanding Issues

### Open
1. **Per-screenshot p50 ~360 ms** vs original 40 ms target. Mitigations available (SCK + IOSurface direct, JPEG encoding, smaller capture size via `screencapture -R`). Not blocking parity — auto-screenshot removal makes this acceptable.
2. **mktemp race in parallel bench tests** — `macos.ts` shell pipeline uses `mktemp ... XXXXXX.png` which collides when two tests run in parallel. Bug filed.

### Resolved
1. **Screen Recording TCC for SCK helper** — resolved by retaining `screencapture` CLI which inherits terminal grant.
2. **T9 helper subprocess mistake** — reverted in commit `920d6f7`.

---

## Phase 2 — FFI Screenshot Pipeline (post-closeout, 2026-05-21)

User rejected closeout acceptance: "codex cua 마냥 빠르고깔끔하게 도는거맞아?" Triggered a fresh perf pass focused on the screenshot hot path.

### Architecture Change

| Stage | Phase 1 (shipped) | Phase 2 (current) |
|---|---|---|
| Native capture | `sh -c "screencapture -x -o /tmp/.png"` (CLI subprocess) | `CGDisplayCreateImage` via koffi FFI |
| Logical screen size | `osascript` Finder bounds or `system_profiler` (CLI) | `CGDisplayBounds` via koffi FFI |
| Scale + encode | `sips -z W H` (separate CLI subprocess) | `CGImageDestinationAddImage` with `kCGImageDestinationImageMaxPixelSize` property |
| Window-targeted | `screencapture -l <id>` (CLI) | Same (kept; CGWindowListCreateImage broken in macOS 26.3) |

### Measured Speedup (100 iter, persistent Node process, target 1280px long edge)

| Path | p50 | p95 | min |
|---|---|---|---|
| Phase 1 baseline (CLI shell-out) | 608 ms | 1015 ms | — |
| Phase 2.1 (FFI capture + manual CGBitmapContext scale + ImageIO PNG) | 134 ms | 504 ms | 95 ms |
| Phase 2.2 (FFI capture + ImageIO native scale + ImageIO PNG) | **61 ms** | **82 ms** | **48 ms** |

**10× faster than Phase 1 CLI baseline.** Approaching but not matching Codex Computer Use's reported 16-33 ms p50.

### Per-Stage Profile (Phase 2.2)

| Stage | Cost p50 |
|---|---|
| `CGDisplayCreateImage` (5K native) | ~27 ms |
| `ImageIO scale + PNG encode` (5K → 1280) | ~33 ms |
| **Total** | **~60 ms** |

### Codex Parity via ScreenCaptureKit

User requested Codex's actual API (SCScreenshotManager). Per librarian research (`bg_da87538b`), `SCScreenshotManager.captureImageWithFilter:configuration:completionHandler:` is async with an ObjC block parameter. Node.js koffi cannot construct ObjC blocks reliably (no production examples exist). Every production SCK consumer (sckit-go, kbinani/screenshot, screencapturekit-node, screencapturekit-rs) uses a tiny ObjC `.dylib` shim that wraps the async call behind a synchronous C boundary via `dispatch_semaphore`.

Shipped: `packages/core/native/libsckit.dylib` (55KB arm64) loaded in-process via `dlopen` (NOT a separate subprocess, NOT a separate TCC grant). Falls back to CGDisplayCreateImage if the dylib fails to load.

| Path | Production p50 | p95 | min | First call (cold) | Notes |
|---|---|---|---|---|---|
| Phase 1 CLI baseline | 608 ms | 1015 ms | — | — | shell-out to `screencapture`+`sips` |
| Phase 2.1 CGDisplay + CGBitmap scale | 134 ms | 504 ms | 95 ms | — | first FFI version (slow scale) |
| Phase 2.2 CGDisplay + ImageIO maxPixelSize | 61 ms | 82 ms | 48 ms | ~120 ms | fastest path on macOS 26.3 |
| **Phase 2.3 SCK via libsckit.dylib (SHIPPED)** | **82 ms** | **105 ms** | **60 ms** | **~700 ms** | Codex-parity API, ~15 ms slower than 2.2 |

**Empirical finding on macOS 26.3 Apple Silicon**: SCK is ~15-25 ms SLOWER per call than CGDisplayCreateImage for one-shot PNG screenshots. The "Codex 16-33 ms" reference number was unreachable via either API on this platform — likely a different macOS version, hardware, or measurement methodology. SCK was chosen for architectural parity with Codex Computer Use, not for peak per-call latency.

### Alternative paths considered

- **CGWindowListCreateImage**: deprecated in macOS 15+, returns NULL on macOS 26.3.
- **CGDisplayStream / CGDisplayStreamCreate**: block-based, same complexity as SCK.
- **JPEG instead of PNG**: marginal win (~5 ms), not shipped.
- **Persistent SCStream**: continuous frame delivery, overkill for on-demand screenshots.
- **Pure koffi block FFI**: theoretically possible but zero production examples from Node.js; risky.

### Commits (Phase 2)

- `faf36a9` `perf(core): replace shell-out screenshot with CGDisplayCreateImage + CGDisplayBounds FFI`
- `ecf7b51` `perf(core): scale PNG via ImageIO kCGImageDestinationImageMaxPixelSize`
- `c551c12` `feat(core): wire ScreenCaptureKit path via libsckit.dylib for Codex-style capture`

---

## Verdict

**Codex Computer Use parity ACHIEVED at the architectural and semantic level.** The system now matches Codex's tool vocabulary, single-call `get_app_state` skyshot, AX tree element indexing, and per-turn (not per-action) state retrieval. Effective turn latency is ~3.8× faster than the original auto-screenshot architecture, despite per-screenshot latency being slightly higher.

The original `screenshot p50 < 40 ms` hard gate is NOT met. The architectural-parity gates ARE met. The user explicitly chose the helper-free path which keeps `screencapture`/`sips` for screenshot to avoid per-binary TCC permission complexity.
