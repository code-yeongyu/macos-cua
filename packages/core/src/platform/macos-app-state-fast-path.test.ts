import { beforeEach, describe, expect, it, vi } from "vitest";

const appListMock = vi.hoisted(() => ({
	getRunningMacOSApps: vi.fn(),
}));
vi.mock("./app-list.js", () => appListMock);

const accessibilityMock = vi.hoisted(() => ({
	extractAccessibilityTree: vi.fn(),
}));
vi.mock("./macos-ffi/accessibility.js", () => accessibilityMock);

const screenshotMock = vi.hoisted(() => ({
	getMainDisplayLogicalSize: vi.fn(),
	getMainDisplayNativePixelSize: vi.fn(),
}));
vi.mock("./macos-ffi/screenshot.js", () => screenshotMock);

import type { ScreenshotResult } from "../computer/interface.js";
import { MacOSAppStateController } from "./macos-app-state.js";

const TARGET_PID = 1234;
const WINDOW_BOUNDS = { x: 300, y: 150, width: 2560, height: 1600 };

function createScreenshot(): ScreenshotResult {
	return {
		data: Buffer.from("screenshot"),
		mimeType: "image/jpeg",
		width: 2576,
		height: 1616,
	};
}

beforeEach(() => {
	appListMock.getRunningMacOSApps.mockReset();
	accessibilityMock.extractAccessibilityTree.mockReset();
	screenshotMock.getMainDisplayLogicalSize.mockReset();
	screenshotMock.getMainDisplayNativePixelSize.mockReset();

	appListMock.getRunningMacOSApps.mockResolvedValue([
		{ name: "Finder", bundleId: "com.apple.finder", pid: TARGET_PID, isActive: true, isRunning: true, path: "" },
	]);
	accessibilityMock.extractAccessibilityTree.mockReturnValue({
		axAvailable: true,
		elements: [],
	});
	screenshotMock.getMainDisplayLogicalSize.mockReturnValue({ width: 1920, height: 1080 });
	screenshotMock.getMainDisplayNativePixelSize.mockReturnValue({ width: 3840, height: 2160 });
});

describe("#given an app name #when get_app_state captures it #then app lookup is not repeated", () => {
	it("lists apps once and reuses the resolved app for capture", async () => {
		const captureScreenshot = vi.fn().mockResolvedValue(createScreenshot());
		const controller = new MacOSAppStateController({
			captureScreenshot,
			overlay: { set: vi.fn(), highlight: vi.fn(), hide: vi.fn(), close: vi.fn() },
			resolveTargetWindow: vi.fn().mockResolvedValue({ id: 99, bounds: WINDOW_BOUNDS }),
			urlBlocklist: [],
		});

		const state = await controller.getAppStateForApp("Finder", { settleMs: 0 });

		expect(state.pid).toBe(TARGET_PID);
		expect(appListMock.getRunningMacOSApps).toHaveBeenCalledOnce();
		expect(captureScreenshot).toHaveBeenCalledWith({ targetSize: { width: 2576, height: 1616 }, format: "jpeg" }, 99);
	});
});
