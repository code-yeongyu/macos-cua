import type { ComputerInterface, ScreenshotViewport } from "@macos-cua/core";
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "../pi/index.js";
import { createZoomTool } from "./zoom.js";

const SOURCE_VIEWPORT = {
	windowBounds: { x: 300, y: 150, width: 1000, height: 800 },
	screenshotWidth: 500,
	screenshotHeight: 400,
} satisfies ScreenshotViewport;

const TEST_CONTEXT = {} as ExtensionContext;

describe("#given static text in a zoom crop #when pi-extension zoom returns marks #then text-only nodes are omitted", () => {
	it("returns marks for the actionable element only", async () => {
		const tool = createZoomTool(createComputer());

		const result = await tool.execute(
			"call",
			{ app: "Finder", region: { x: 50, y: 25, width: 200, height: 150 } },
			undefined,
			undefined,
			TEST_CONTEXT,
		);

		expect(result.details).toMatchObject({ marks: [{ id: 9 }] });
	});
});

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
			height: 600,
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
					id: 8,
					role: "AXStaticText",
					label: "Readable paragraph",
					value: null,
					frame: { x: 100, y: 50, width: 50, height: 25 },
					actions: [],
					children: [],
				},
				{
					id: 9,
					role: "AXButton",
					label: "Open",
					value: null,
					frame: { x: 100, y: 100, width: 50, height: 25 },
					actions: ["AXPress"],
					children: [],
				},
			],
			screenshotBase64: "",
			screenshotWidth: 500,
			screenshotHeight: 400,
			display: { width: 1000, height: 800, scaleFactor: 2 },
			windowBounds: SOURCE_VIEWPORT.windowBounds,
		}),
		getScreenshotViewport: vi.fn<ComputerInterface["getScreenshotViewport"]>().mockResolvedValue(SOURCE_VIEWPORT),
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
	const canvas = createCanvas(800, 600);
	const context = canvas.getContext("2d");
	context.fillStyle = "#ffffff";
	context.fillRect(0, 0, 800, 600);
	return canvas.toBuffer("image/png");
}
