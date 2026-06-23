import type { DisplayInfo } from "../accessibility/types.js";
import type { ScreenshotDowngradeStatus } from "../computer/capture-frame.js";
import type { ScreenshotResult } from "../computer/interface.js";
import type { Rect, Size } from "../types/index.js";

export function adaptiveScreenshotDowngrade(
	windowBounds: Rect,
	display: DisplayInfo,
	size: Size,
	screenshot: ScreenshotResult,
): ScreenshotDowngradeStatus | undefined {
	const original = {
		width: Math.round(windowBounds.width * display.scaleFactor),
		height: Math.round(windowBounds.height * display.scaleFactor),
	};
	if (size.width >= original.width && size.height >= original.height) {
		return undefined;
	}
	return { reason: "adaptive_target_downscale", original, format: screenshot.mimeType };
}
