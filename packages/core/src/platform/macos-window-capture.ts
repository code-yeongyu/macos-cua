import type { ScreenshotResult } from "../computer/interface.js";
import type { ScreenshotOptions, Size } from "../types/index.js";
import type { MacOSAppStateTargetWindow } from "./macos-desktop-session-types.js";

type CaptureScreenshot = (options?: ScreenshotOptions, windowId?: number) => Promise<ScreenshotResult>;

export async function captureMacOSAppStateWindowScreenshot(
	captureScreenshot: CaptureScreenshot,
	targetWindow: MacOSAppStateTargetWindow,
	size: Size,
): Promise<ScreenshotResult> {
	const regionOptions = { targetSize: size, format: "jpeg", region: targetWindow.bounds } satisfies ScreenshotOptions;
	if (targetWindow.id === undefined) {
		return await captureScreenshot(regionOptions);
	}
	try {
		return await captureScreenshot({ targetSize: size, format: "jpeg" }, targetWindow.id);
	} catch (error) {
		if (error instanceof Error) {
			return await captureScreenshot(regionOptions);
		}
		throw error;
	}
}
