import { type CaptureFrame, type Rect, createCaptureFrame } from "@macos-cua/core";

export function captureFrameFixture(
	windowBounds: Rect,
	model: { readonly width: number; readonly height: number },
): CaptureFrame {
	return createCaptureFrame({
		captureId: "capture-test-1",
		capturedAt: "2026-06-18T00:00:00.000Z",
		displayEpoch: "test-display-1",
		target: { pid: 1234, bundleId: "com.apple.finder", appName: "Finder" },
		windowBounds,
		screenshot: model,
		model,
		display: { logical: windowBounds, native: model, scaleFactor: 1 },
	});
}
