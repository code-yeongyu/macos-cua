import { describe, expect, it, vi } from "vitest";
import type { ScreenshotResult } from "../computer/interface.js";
import { captureMacOSAppStateWindowScreenshot } from "./macos-window-capture.js";

const SIZE = { width: 300, height: 200 };
const WINDOW = { id: 99, bounds: { x: 10, y: 20, width: 300, height: 200 } };
const SCREENSHOT = {
	data: Buffer.from("screen"),
	height: 200,
	mimeType: "image/jpeg",
	width: 300,
} satisfies ScreenshotResult;

describe("#given window-id app-state capture succeeds #when capturing a target window #then window capture is preserved", () => {
	it("uses screencapture window id before any region fallback", async () => {
		const captureScreenshot = vi.fn().mockResolvedValue(SCREENSHOT);

		const result = await captureMacOSAppStateWindowScreenshot(captureScreenshot, WINDOW, SIZE);

		expect(result).toBe(SCREENSHOT);
		expect(captureScreenshot).toHaveBeenCalledWith({ targetSize: SIZE, format: "jpeg" }, 99);
		expect(captureScreenshot).toHaveBeenCalledTimes(1);
	});
});

describe("#given window-id app-state capture fails #when capturing a target window #then region capture is used", () => {
	it("falls back to the target window bounds", async () => {
		const captureScreenshot = vi.fn().mockRejectedValueOnce(new Error("could not create image from window"));
		captureScreenshot.mockResolvedValueOnce(SCREENSHOT);

		const result = await captureMacOSAppStateWindowScreenshot(captureScreenshot, WINDOW, SIZE);

		expect(result).toBe(SCREENSHOT);
		expect(captureScreenshot).toHaveBeenNthCalledWith(1, { targetSize: SIZE, format: "jpeg" }, 99);
		expect(captureScreenshot).toHaveBeenNthCalledWith(2, {
			targetSize: SIZE,
			format: "jpeg",
			region: WINDOW.bounds,
		});
	});
});
