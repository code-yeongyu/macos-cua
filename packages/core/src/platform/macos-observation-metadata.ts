import type { AXTreeElement, AxTreeChangeSummary, DisplayInfo, ObservationMetadata } from "../accessibility/types.js";
import type { CaptureFrame } from "../computer/capture-frame.js";
import type { ScreenshotResult } from "../computer/interface.js";
import type { Point } from "../types/index.js";
import type { RunningAppInfo } from "./app-list.js";
import { macOSDisplayEpoch, macOSNativeDisplaySize } from "./macos-desktop-session-signature.js";
import type { MacOSAppStateTargetWindow } from "./macos-desktop-session-types.js";

type MacOSObservationMetadataInput = {
	readonly app: RunningAppInfo;
	readonly targetWindow: MacOSAppStateTargetWindow;
	readonly display: DisplayInfo;
	readonly screenshot: ScreenshotResult;
	readonly captureFrame: CaptureFrame;
	readonly axAvailable: boolean;
	readonly elements: readonly AXTreeElement[];
	readonly axChangeSummary?: AxTreeChangeSummary;
	readonly cursor?: Point;
};

export function createMacOSObservationMetadata(input: MacOSObservationMetadataInput): ObservationMetadata {
	const displayEpoch = macOSDisplayEpoch(input.display);
	return {
		app: {
			bundleId: input.app.bundleId,
			frontmost: input.app.isActive,
			name: input.app.name,
			pid: input.app.pid,
		},
		ax: {
			available: input.axAvailable,
			elementCount: input.elements.length,
			...(input.axChangeSummary !== undefined ? { changeSummary: input.axChangeSummary } : {}),
		},
		capture: {
			captureId: input.captureFrame.captureId,
			capturedAt: input.captureFrame.capturedAt,
			coordinateFrame: input.captureFrame.screenshotMetadata,
			displayEpoch: input.captureFrame.displayEpoch,
			model: input.captureFrame.model,
			screenshot: {
				height: input.screenshot.height,
				...(input.screenshot.mimeType !== undefined ? { mimeType: input.screenshot.mimeType } : {}),
				width: input.screenshot.width,
			},
			target: {
				bundleId: input.app.bundleId,
				name: input.app.name,
				pid: input.app.pid,
			},
		},
		...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
		display: {
			epoch: displayEpoch,
			logical: { height: input.display.height, width: input.display.width, x: 0, y: 0 },
			native: macOSNativeDisplaySize(input.display),
			scaleFactor: input.display.scaleFactor,
		},
		freshness: {
			captureId: input.captureFrame.captureId,
			displayEpoch,
			stale: input.captureFrame.displayEpoch !== displayEpoch,
		},
		window: {
			...(input.targetWindow.id !== undefined ? { id: input.targetWindow.id } : {}),
			bounds: input.targetWindow.bounds,
		},
	};
}
