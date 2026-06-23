import { afterEach, describe, expect, it, vi } from "vitest";

import { type ComputerActionDriver, ComputerUseError, executeNativeComputerAction } from "./anthropic-computer-use.js";
import type { DisplayConfig } from "./computer-use/coords.js";

const DEFAULT_DOWNSCALE = {
	logicalWidth: 2560,
	logicalHeight: 1440,
	modelWidth: 1280,
	modelHeight: 720,
} satisfies DisplayConfig;

const ONE_TO_ONE_DOWNSCALE = {
	logicalWidth: 100,
	logicalHeight: 80,
	modelWidth: 100,
	modelHeight: 80,
} satisfies DisplayConfig;

const STALE_DISPLAY = {
	logicalWidth: 100,
	logicalHeight: 80,
	modelWidth: 100,
	modelHeight: 80,
	captureId: "capture-1",
	displayEpoch: "display-1",
} satisfies DisplayConfig;

function createComputer(): ComputerActionDriver {
	return {
		capabilities: {
			supportsScreenshot: true,
			supportsInput: true,
			supportsAccessibility: true,
			supportsClipboard: true,
		},
		screenshot: vi.fn<ComputerActionDriver["screenshot"]>().mockResolvedValue({
			data: Buffer.from("png"),
			mimeType: "image/png",
			width: 100,
			height: 80,
		}),
		setTarget: vi.fn<ComputerActionDriver["setTarget"]>(),
		move: vi.fn<ComputerActionDriver["move"]>().mockResolvedValue(undefined),
		click: vi.fn<ComputerActionDriver["click"]>().mockResolvedValue(undefined),
		rightClick: vi.fn<ComputerActionDriver["rightClick"]>().mockResolvedValue(undefined),
		middleClick: vi.fn<ComputerActionDriver["middleClick"]>().mockResolvedValue(undefined),
		doubleClick: vi.fn<ComputerActionDriver["doubleClick"]>().mockResolvedValue(undefined),
		type: vi.fn<ComputerActionDriver["type"]>().mockResolvedValue(undefined),
		key: vi.fn<ComputerActionDriver["key"]>().mockResolvedValue(undefined),
		scroll: vi.fn<ComputerActionDriver["scroll"]>().mockResolvedValue(undefined),
		drag: vi.fn<ComputerActionDriver["drag"]>().mockResolvedValue(undefined),
		getCursorPosition: vi.fn<ComputerActionDriver["getCursorPosition"]>().mockResolvedValue({ x: 7, y: 9 }),
		getScreenSize: vi.fn<ComputerActionDriver["getScreenSize"]>().mockResolvedValue({ width: 100, height: 80 }),
		getScreenshotViewport: vi.fn<ComputerActionDriver["getScreenshotViewport"]>().mockResolvedValue(undefined),
		getAppState: vi.fn<ComputerActionDriver["getAppState"]>().mockResolvedValue({
			app: "TestApp",
			bundleId: "com.test.app",
			pid: 1234,
			frontmost: true,
			axAvailable: true,
			elements: [],
			screenshotBase64: "",
			screenshotWidth: 100,
			screenshotHeight: 80,
		}),
		listApps: vi.fn<ComputerActionDriver["listApps"]>().mockResolvedValue([]),
		setValue: vi.fn<ComputerActionDriver["setValue"]>().mockResolvedValue(undefined),
		performAction: vi.fn<ComputerActionDriver["performAction"]>().mockResolvedValue(undefined),
		pressAtPosition: vi.fn<ComputerActionDriver["pressAtPosition"]>().mockResolvedValue(false),
		typeIntoFocused: vi.fn<ComputerActionDriver["typeIntoFocused"]>().mockResolvedValue(false),
		close: vi.fn<ComputerActionDriver["close"]>().mockResolvedValue(undefined),
	};
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("#given screenshot action #when executed #then image content is returned", () => {
	it("returns PNG mime content", async () => {
		const computer = createComputer();

		const result = await executeNativeComputerAction({ action: "screenshot" }, computer, ONE_TO_ONE_DOWNSCALE);

		expect(result.content).toEqual([
			{ type: "image", data: Buffer.from("png").toString("base64"), mimeType: "image/png" },
		]);
	});
});

describe("#given left_click action #when executed #then click runs once and lightweight result is returned", () => {
	it("dispatches click to the computer", async () => {
		const computer = createComputer();

		const result = await executeNativeComputerAction(
			{ action: "left_click", coordinate: [10, 20] },
			computer,
			ONE_TO_ONE_DOWNSCALE,
		);

		expect(computer.click).toHaveBeenCalledTimes(1);
		expect(computer.click).toHaveBeenCalledWith({ x: 10, y: 20 });
		expect(JSON.parse(result.content[0]?.type === "text" ? result.content[0].text : "")).toMatchObject({
			ok: true,
			action: "left_click",
			code: "ACTION_COMPLETED",
			recoveryHint: "Call get_app_state to fetch the updated UI state.",
		});
	});
});

describe("#given Anthropic stale coordinates #when native computer use rejects them #then code and hint match code-mode", () => {
	it("#given a stale capture marker #when left_click executes #then STALE_CAPTURE is preserved", async () => {
		const computer = createComputer();

		await expect(
			executeNativeComputerAction({ action: "left_click", coordinate: [10, 20] }, computer, STALE_DISPLAY, {
				captureId: "capture-2",
				displayEpoch: "display-1",
			}),
		).rejects.toMatchObject({
			code: "STALE_CAPTURE",
			message: expect.stringContaining("captureId capture-1"),
			recoveryHint: expect.stringContaining("fresh screenshot"),
		});
		expect(computer.click).not.toHaveBeenCalled();
	});

	it("#given an out-of-bounds coordinate #when left_click executes #then valid frame and corrective action are reported", async () => {
		const computer = createComputer();

		await expect(
			executeNativeComputerAction({ action: "left_click", coordinate: [101, 20] }, computer, ONE_TO_ONE_DOWNSCALE),
		).rejects.toMatchObject({
			code: "OUT_OF_BOUNDS_COORDINATE",
			message: expect.stringContaining("valid x range [0, 100] and y range [0, 80]"),
			recoveryHint: expect.stringContaining("Capture a fresh screenshot"),
		});
		expect(computer.click).not.toHaveBeenCalled();
	});
});

describe("#given key combo action #when executed #then combo is split into key and modifiers", () => {
	it("splits cmd+shift+t", async () => {
		const computer = createComputer();

		await executeNativeComputerAction({ action: "key", text: "cmd+shift+t" }, computer, ONE_TO_ONE_DOWNSCALE);

		expect(computer.key).toHaveBeenCalledWith("t", { modifiers: ["command", "shift"] });
	});

	it("normalizes Anthropic modifier aliases to the canonical core names", async () => {
		const computer = createComputer();

		await executeNativeComputerAction(
			{ action: "key", text: "ctrl+alt+command+return" },
			computer,
			ONE_TO_ONE_DOWNSCALE,
		);

		expect(computer.key).toHaveBeenCalledWith("return", { modifiers: ["control", "option", "command"] });
	});
});

describe("#given triple_click action #when executed #then click runs three times", () => {
	it("dispatches three clicks", async () => {
		const computer = createComputer();

		await executeNativeComputerAction({ action: "triple_click", coordinate: [3, 4] }, computer, ONE_TO_ONE_DOWNSCALE);

		expect(computer.click).toHaveBeenCalledTimes(3);
		expect(computer.click).toHaveBeenNthCalledWith(1, { x: 3, y: 4 });
		expect(computer.click).toHaveBeenNthCalledWith(2, { x: 3, y: 4 });
		expect(computer.click).toHaveBeenNthCalledWith(3, { x: 3, y: 4 });
	});
});

describe("#given wait action #when executed #then it resolves after duration", () => {
	it("uses the provided seconds duration", async () => {
		vi.useFakeTimers();
		const computer = createComputer();

		const resultPromise = executeNativeComputerAction(
			{ action: "wait", duration: 0.25 },
			computer,
			ONE_TO_ONE_DOWNSCALE,
		);
		await vi.advanceTimersByTimeAsync(250);

		await expect(resultPromise).resolves.toEqual({
			content: [{ type: "text", text: "wait complete" }],
			details: undefined,
		});
		expect(computer.screenshot).not.toHaveBeenCalled();
	});
});

describe("#given unsupported mouse phase action #when executed #then tagged error is thrown", () => {
	it("throws ComputerUseError with unsupported_action kind", async () => {
		const computer = createComputer();

		await expect(
			executeNativeComputerAction({ action: "left_mouse_down" }, computer, ONE_TO_ONE_DOWNSCALE),
		).rejects.toBeInstanceOf(ComputerUseError);
		await expect(
			executeNativeComputerAction({ action: "left_mouse_down" }, computer, ONE_TO_ONE_DOWNSCALE),
		).rejects.toMatchObject({
			action: "left_mouse_down",
			kind: "unsupported_action",
			message: "Use click or drag tools for fine-grained mouse phases",
		});
	});
});

describe("#given scaled Anthropic coordinates #when left click executes #then logical screen points are clicked", () => {
	it("unscales model-space coordinates before dispatch", async () => {
		const computer = createComputer();

		await executeNativeComputerAction({ action: "left_click", coordinate: [640, 360] }, computer, DEFAULT_DOWNSCALE);

		expect(computer.click).toHaveBeenCalledWith({ x: 1280, y: 720 });
	});
});

describe("#given a screenshot action #when screenshot action executes #then requested model dimensions are captured", () => {
	it("passes target dimensions into the screenshot call", async () => {
		const computer = createComputer();

		await executeNativeComputerAction({ action: "screenshot" }, computer, DEFAULT_DOWNSCALE);

		expect(computer.screenshot).toHaveBeenCalledWith({ targetSize: { width: 1280, height: 720 } });
	});
});
