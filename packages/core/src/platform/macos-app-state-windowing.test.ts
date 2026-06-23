import { describe, expect, it } from "vitest";

import {
	TARGET_PID,
	WINDOW_BOUNDS,
	accessibilityMock,
	childProcessMock,
	fakePng,
	screenshotMock,
	windowMock,
} from "./macos-app-state.test-support.js";
import { MacOSHostComputer } from "./macos.js";

describe("#given a target window #when get_app_state captures it #then the screenshot is sized to the window aspect", () => {
	it("requests an adaptive window screenshot, not the full screen", async () => {
		const computer = new MacOSHostComputer();

		const state = await computer.getAppState(TARGET_PID, { settleMs: 0 });

		const screenshotCall = childProcessMock.execFile.mock.calls[1];
		expect(screenshotCall?.[1]).toEqual(expect.arrayContaining(["2576", "1616"]));
		expect(state.screenshotWidth).toBe(2576);
		expect(state.screenshotHeight).toBe(1616);
		expect(state.windowBounds).toEqual(WINDOW_BOUNDS);
	});
});

describe("#given a window-scoped screenshot #when get_app_state returns the tree #then frames share the screenshot pixel space", () => {
	it("remaps global accessibility frames into screenshot pixels", async () => {
		const computer = new MacOSHostComputer();

		const state = await computer.getAppState(TARGET_PID, { settleMs: 0 });

		expect(state.elements[0]?.frame).toEqual({ x: 503, y: 404, width: 201, height: 162 });
		expect(state.elements[0]?.id).toBe(5);
		expect(state.elements[0]?.actions).toEqual(["AXPress"]);
	});
});

describe("#given a prior get_app_state #when reading the screenshot viewport #then it maps pixels onto the window", () => {
	it("exposes the stored viewport for the target pid", async () => {
		const computer = new MacOSHostComputer();
		await computer.getAppState(TARGET_PID, { settleMs: 0 });

		const viewport = await computer.getScreenshotViewport(TARGET_PID);

		expect(viewport).toMatchObject({
			captureId: "macos-capture-1",
			windowBounds: WINDOW_BOUNDS,
			screenshotWidth: 2576,
			screenshotHeight: 1616,
		});
	});
});

describe("#given no prior get_app_state #when reading the screenshot viewport #then it derives one from the current window", () => {
	it("derives the viewport from the live target window", async () => {
		const computer = new MacOSHostComputer();

		const viewport = await computer.getScreenshotViewport(TARGET_PID);

		expect(viewport).toEqual({ windowBounds: WINDOW_BOUNDS, screenshotWidth: 1280, screenshotHeight: 800 });
	});

	it("returns undefined when the target app has no visible window", async () => {
		windowMock.openWindows.mockResolvedValue([]);
		const computer = new MacOSHostComputer();

		expect(await computer.getScreenshotViewport(TARGET_PID)).toBeUndefined();
	});
});

describe("#given no target window #when get_app_state runs #then it refuses to return a misleading full display", () => {
	it("throws without activating the target app", async () => {
		windowMock.openWindows.mockResolvedValue([]);
		childProcessMock.execFile.mockReset();
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
			callback(
				null,
				JSON.stringify([{ name: "Finder", bundleId: "com.apple.finder", pid: TARGET_PID, isActive: false }]),
				"",
			);
		});
		const computer = new MacOSHostComputer();

		await expect(computer.getAppState(TARGET_PID, { settleMs: 0 })).rejects.toThrow(
			"No visible target window found for 'Finder'",
		);

		expect(childProcessMock.execFile).toHaveBeenCalledTimes(1);
		expect(screenshotMock.captureMainDisplayPng).not.toHaveBeenCalled();
	});

	it("throws before returning a full-screen screenshot for the target app", async () => {
		windowMock.openWindows.mockResolvedValue([]);
		childProcessMock.execFile.mockReset();
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
			callback(
				null,
				JSON.stringify([{ name: "Finder", bundleId: "com.apple.finder", pid: TARGET_PID, isActive: true }]),
				"",
			);
		});
		const computer = new MacOSHostComputer();

		await expect(computer.getAppState(TARGET_PID, { settleMs: 0 })).rejects.toThrow(
			"No visible target window found for 'Finder'",
		);
		expect(childProcessMock.execFile).toHaveBeenCalledTimes(1);
		expect(screenshotMock.captureMainDisplayPng).not.toHaveBeenCalled();
		expect(await computer.getScreenshotViewport(TARGET_PID)).toBeUndefined();
	});
});

describe("#given window enumeration lacks Screen Recording #when System Events can read bounds #then get_app_state stays window scoped", () => {
	it("captures the target bounds as a region and remaps frames", async () => {
		windowMock.openWindows.mockRejectedValue(
			new Error(
				"get-windows requires the screen recording permission in “System Settings › Privacy & Security › Screen Recording”.",
			),
		);
		childProcessMock.execFile.mockReset();
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
			callback(
				null,
				JSON.stringify([{ name: "Finder", bundleId: "com.apple.finder", pid: TARGET_PID, isActive: true }]),
				"",
			);
		});
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
			callback(null, "300\t150\t2560\t1600", "");
		});
		const computer = new MacOSHostComputer();

		const state = await computer.getAppState(TARGET_PID, { settleMs: 0 });
		const viewport = await computer.getScreenshotViewport(TARGET_PID);

		expect(screenshotMock.captureDisplayRectPng).toHaveBeenCalledWith(WINDOW_BOUNDS, 2576);
		expect(state.windowBounds).toEqual(WINDOW_BOUNDS);
		expect(state.elements[0]?.frame).toEqual({ x: 503, y: 404, width: 201, height: 162 });
		expect(viewport).toMatchObject({
			captureId: "macos-capture-1",
			windowBounds: WINDOW_BOUNDS,
			screenshotWidth: 2576,
			screenshotHeight: 1616,
		});
	});
});

describe("#given a window on a secondary display #when get_app_state remaps frames #then negative origins are handled", () => {
	it("offsets frames by the negative window origin", async () => {
		const negativeBounds = { x: -1920, y: -200, width: 960, height: 600 };
		windowMock.openWindows.mockResolvedValue([{ id: 99, owner: { processId: TARGET_PID }, bounds: negativeBounds }]);
		accessibilityMock.extractAccessibilityTree.mockReturnValue({
			axAvailable: true,
			elements: [
				{
					id: 5,
					role: "AXButton",
					label: "Open",
					value: null,
					frame: { x: -1440, y: 100, width: 96, height: 60 },
					actions: ["AXPress"],
					children: [],
				},
			],
		});
		childProcessMock.execFile.mockReset();
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
			callback(
				null,
				JSON.stringify([{ name: "Finder", bundleId: "com.apple.finder", pid: TARGET_PID, isActive: true }]),
				"",
			);
		});
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
			callback(null, fakePng(960, 600), "");
		});
		const computer = new MacOSHostComputer();

		const state = await computer.getAppState(TARGET_PID, { settleMs: 0 });

		expect(state.windowBounds).toEqual(negativeBounds);
		expect(state.elements[0]?.frame).toEqual({ x: 480, y: 300, width: 96, height: 60 });
	});
});
