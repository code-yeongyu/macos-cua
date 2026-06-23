import { describe, expect, it } from "vitest";
import type { AXTreeElement, DisplayInfo } from "../accessibility/types.js";
import type { ScreenshotResult } from "../computer/interface.js";
import type { Rect, Size } from "../types/index.js";
import type { RunningAppInfo } from "./app-list.js";
import type { MacOSDesktopSessionBackend } from "./macos-desktop-session-types.js";
import { MacOSDesktopSession } from "./macos-desktop-session.js";

const TARGET_PID = 1234;
const APP: RunningAppInfo = {
	bundleId: "com.apple.finder",
	isActive: true,
	isRunning: true,
	name: "Finder",
	path: "/System/Library/CoreServices/Finder.app",
	pid: TARGET_PID,
};
const WINDOW = { bounds: { x: 10, y: 20, width: 400, height: 200 }, id: 99 };
const DISPLAY: DisplayInfo = { width: 1440, height: 900, scaleFactor: 2 };

class CaptureFrameBackend implements MacOSDesktopSessionBackend {
	constructor(private readonly targetWindow: typeof WINDOW = WINDOW) {}

	async listApps(): Promise<readonly RunningAppInfo[]> {
		return [APP];
	}

	assertAppApproved(_app: RunningAppInfo): void {}

	async assertBrowserUrlAllowed(_app: RunningAppInfo): Promise<void> {}

	async resolveTargetWindow(_pid: number): Promise<typeof WINDOW> {
		return this.targetWindow;
	}

	async captureWindowScreenshot(_window: typeof WINDOW, size: Size): Promise<ScreenshotResult> {
		return { data: Buffer.from("screen"), height: size.height, mimeType: "image/jpeg", width: size.width };
	}

	extractAccessibilityTree(_pid: number): {
		readonly axAvailable: boolean;
		readonly elements: readonly AXTreeElement[];
	} {
		return { axAvailable: true, elements: [] };
	}

	resolveDisplayInfo(): DisplayInfo {
		return DISPLAY;
	}

	resolveAppInstructions(_appName: string, _bundleId: string): string | undefined {
		return undefined;
	}

	highlightWindow(_bounds: Rect): void {}

	async sleep(_milliseconds: number): Promise<void> {}
}

describe("#given capture-frame metadata #when coordinates are resolved later #then the captured viewport is reused", () => {
	it("#given get_app_state captured a window #when getScreenshotViewport is called #then it returns the same fresh capture frame", async () => {
		const session = new MacOSDesktopSession(new CaptureFrameBackend());

		const state = await session.getAppState(TARGET_PID, { settleMs: 0 });
		const viewport = await session.getScreenshotViewport(TARGET_PID);

		expect(viewport).toBe(state.captureFrame);
		expect(viewport).toMatchObject({
			captureId: "macos-capture-1",
			displayEpoch: "1440x900@2",
			model: { width: 800, height: 400 },
			windowBounds: WINDOW.bounds,
		});
		expect(state.screenshotMetadata).toMatchObject({
			byteLength: Buffer.from("screen").byteLength,
			captureId: "macos-capture-1",
			displayEpoch: "1440x900@2",
			height: 400,
			mimeType: "image/jpeg",
			originX: 0,
			originY: 0,
			scaleX: 2,
			scaleY: 2,
			width: 800,
		});
	});

	it("#given adaptive capture below native window pixels #when get_app_state captures the window #then downgrade metadata is surfaced", async () => {
		const largeWindow = { bounds: { x: 10, y: 20, width: 4000, height: 3000 }, id: 100 };
		const session = new MacOSDesktopSession(new CaptureFrameBackend(largeWindow));

		const state = await session.getAppState(TARGET_PID, { settleMs: 0 });

		expect(state.screenshotMetadata).toMatchObject({
			downgrade: {
				reason: "adaptive_target_downscale",
				original: { width: 8000, height: 6000 },
				format: "image/jpeg",
			},
			height: 1760,
			width: 2352,
		});
		expect(state.captureFrame?.screenshotMetadata.downgrade).toEqual(state.screenshotMetadata?.downgrade);
	});
});
