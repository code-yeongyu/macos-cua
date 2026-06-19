import type { CaptureFrame, ComputerInterface, Rect } from "@macos-cua/core";
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";

import type { ExtensionContext } from "../pi/index.js";
import { createZoomTool } from "./zoom.js";

const TEST_CONTEXT = {} as ExtensionContext;

describe("#given capture-frame metadata #when zooming #then app-local coordinates stay bounded to that capture", () => {
	it("#given AX contains frames outside the captured window #when zooming a toolbar region #then out-of-capture elements are ignored", async () => {
		const computer = createComputer();
		const frame = captureFrame({
			captureId: "macos-capture-6",
			displayEpoch: "2560x1440@2",
			windowBounds: { x: 0, y: 30, width: 1280, height: 1410 },
			model: { width: 1161, height: 1280 },
			display: { width: 2560, height: 1440, scaleFactor: 2 },
		});
		vi.mocked(computer.getAppState).mockResolvedValue({
			app: "Safari",
			bundleId: "com.apple.Safari",
			pid: 1234,
			frontmost: false,
			axAvailable: true,
			elements: [
				{
					id: 1,
					role: "AXWindow",
					label: "Search",
					value: null,
					frame: { x: 0, y: 0, width: 1161, height: 1280 },
					actions: ["AXRaise"],
					children: [],
				},
				{
					id: 22,
					role: "AXButton",
					label: "Off-screen result",
					value: null,
					frame: { x: 1161, y: 3983, width: 80, height: 30 },
					actions: ["AXPress"],
					children: [],
				},
			],
			captureFrame: frame,
			screenshotBase64: "",
			screenshotWidth: 1161,
			screenshotHeight: 1280,
			screenshotMimeType: "image/png",
			display: { width: 2560, height: 1440, scaleFactor: 2 },
			windowBounds: frame.windowBounds,
		});
		vi.mocked(computer.getScreenshotViewport).mockResolvedValue(frame);
		const tool = createZoomTool(computer);

		const result = await tool.execute(
			"call",
			{ app: "Finder", region: { x: 350, y: 0, width: 400, height: 40 } },
			undefined,
			undefined,
			TEST_CONTEXT,
		);

		expect(result.details.marks.map((mark) => mark.id)).not.toContain(22);
		expect(computer.screenshot).toHaveBeenCalledWith({ region: { x: 386, y: 30, width: 441, height: 44 } });
	});

	it("#given get_app_state returned capture metadata #when viewport cache is empty #then zoom uses the state capture frame", async () => {
		const computer = createComputer();
		const state = await computer.getAppState(1234);
		const frame = captureFrame({
			captureId: "capture-state",
			displayEpoch: "display-state",
			windowBounds: { x: 300, y: 150, width: 1000, height: 800 },
			model: { width: 500, height: 400 },
			display: { width: 1728, height: 1117, scaleFactor: 2 },
		});
		vi.mocked(computer.getAppState).mockResolvedValue({ ...state, captureFrame: frame });
		vi.mocked(computer.getScreenshotViewport).mockResolvedValue(undefined);
		const tool = createZoomTool(computer);

		await tool.execute(
			"call",
			{ app: "Finder", region: { x: 50, y: 25, width: 200, height: 100 } },
			undefined,
			undefined,
			TEST_CONTEXT,
		);

		expect(computer.screenshot).toHaveBeenCalledWith({ region: { x: 400, y: 200, width: 400, height: 200 } });
	});
});

function captureFrame(input: {
	readonly captureId: string;
	readonly displayEpoch: string;
	readonly windowBounds: Rect;
	readonly model: { readonly width: number; readonly height: number };
	readonly display: { readonly width: number; readonly height: number; readonly scaleFactor: number };
}): CaptureFrame {
	return {
		captureId: input.captureId,
		capturedAt: "2026-06-18T00:00:00.000Z",
		displayEpoch: input.displayEpoch,
		target: { pid: 1234, bundleId: "com.apple.finder", appName: "Finder" },
		windowBounds: input.windowBounds,
		screenshot: input.model,
		model: input.model,
		display: {
			logical: { x: 0, y: 0, width: input.display.width, height: input.display.height },
			native: {
				width: input.display.width * input.display.scaleFactor,
				height: input.display.height * input.display.scaleFactor,
			},
			scaleFactor: input.display.scaleFactor,
		},
		screenshotWidth: input.model.width,
		screenshotHeight: input.model.height,
	};
}

function createComputer(): ComputerInterface {
	return {
		capabilities: {
			supportsScreenshot: true,
			supportsInput: true,
			supportsAccessibility: true,
			supportsClipboard: true,
		},
		screenshot: vi.fn<ComputerInterface["screenshot"]>().mockResolvedValue({
			data: fixturePng(),
			mimeType: "image/png",
			width: 800,
			height: 400,
		}),
		setTarget: vi.fn<ComputerInterface["setTarget"]>(),
		move: vi.fn<ComputerInterface["move"]>(),
		click: vi.fn<ComputerInterface["click"]>(),
		rightClick: vi.fn<ComputerInterface["rightClick"]>(),
		middleClick: vi.fn<ComputerInterface["middleClick"]>(),
		doubleClick: vi.fn<ComputerInterface["doubleClick"]>(),
		type: vi.fn<ComputerInterface["type"]>(),
		key: vi.fn<ComputerInterface["key"]>(),
		scroll: vi.fn<ComputerInterface["scroll"]>(),
		drag: vi.fn<ComputerInterface["drag"]>(),
		getCursorPosition: vi.fn<ComputerInterface["getCursorPosition"]>(),
		getScreenSize: vi.fn<ComputerInterface["getScreenSize"]>(),
		getAppState: vi.fn<ComputerInterface["getAppState"]>().mockResolvedValue({
			app: "Finder",
			bundleId: "com.apple.finder",
			pid: 1234,
			frontmost: true,
			axAvailable: true,
			elements: [
				{
					id: 9,
					role: "AXButton",
					label: "Open",
					value: null,
					frame: { x: 100, y: 50, width: 50, height: 25 },
					actions: ["AXPress"],
					children: [],
				},
			],
			screenshotBase64: "",
			screenshotWidth: 500,
			screenshotHeight: 400,
			display: { width: 1000, height: 800, scaleFactor: 2 },
			windowBounds: { x: 300, y: 150, width: 1000, height: 800 },
		}),
		getScreenshotViewport: vi.fn<ComputerInterface["getScreenshotViewport"]>().mockResolvedValue({
			windowBounds: { x: 300, y: 150, width: 1000, height: 800 },
			screenshotWidth: 500,
			screenshotHeight: 400,
		}),
		listApps: vi
			.fn<ComputerInterface["listApps"]>()
			.mockResolvedValue([{ name: "Finder", bundleId: "com.apple.finder", pid: 1234, isRunning: true }]),
		setValue: vi.fn<ComputerInterface["setValue"]>(),
		selectText: vi.fn<ComputerInterface["selectText"]>(),
		performAction: vi.fn<ComputerInterface["performAction"]>(),
		pressAtPosition: vi.fn<ComputerInterface["pressAtPosition"]>(),
		typeIntoFocused: vi.fn<ComputerInterface["typeIntoFocused"]>(),
		close: vi.fn<ComputerInterface["close"]>(),
	};
}

function fixturePng(): Buffer {
	const canvas = createCanvas(800, 400);
	const context = canvas.getContext("2d");
	context.fillStyle = "#ffffff";
	context.fillRect(0, 0, 800, 400);
	return canvas.toBuffer("image/png");
}
