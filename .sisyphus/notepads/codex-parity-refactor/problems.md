## [RESOLVED] Screen Recording TCC permission for new SCK-using helper binary
T8 added `CGRequestScreenCaptureAccess()` at helper startup which triggered the
system permission dialog. Once granted, SCK works. Verified: screenshot + getAppState
return valid base64 PNG with axAvailable:true.

## [OPEN] Screenshot perf does NOT meet 40ms p50 BENCHMARK GATE

T8 steady-state benchmark (persistent subprocess, 100 iterations, 1280x800):
- screenshot p50 = 240ms (target < 40ms) — 6x over
- screenshot p95 = 574ms
- axtree p50 = 74ms (target < 100ms) ✅
- axtree p95 = 151ms

Vs T1 baseline (screencapture + sips): p50 ~155ms. New SCK pipeline is ~55% slower.

Hypothesized causes:
1. SCK captures at native Retina pixels, then resize via CoreImage = heavy.
2. CoreImage lanczos transform is high-quality but slow.
3. PNG encoding lossless = 30-50ms per image.
4. Possibly fresh CIContext per call.

Mitigations (defer to a perf pass between T20 and T21):
- Configure SCStreamConfiguration.width/height to target output size (GPU-side downscale).
- Switch from PNG to JPEG encoding.
- Use CIContext.render(_:toBitmap:...) direct to malloc buffer.

Architecture is CORRECT and matches Codex CU. Perf optimization deferred. The
functional gate passes; the latency gate fails and needs a focused perf pass
before T21 declares VICTORY.
