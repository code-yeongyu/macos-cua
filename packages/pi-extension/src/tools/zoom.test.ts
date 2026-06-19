import type { ComputerInterface, ScreenshotViewport } from "@macos-cua/core";
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";

import type { ExtensionContext } from "../pi/index.js";
import { createAppStateCache } from "./app-state-cache.js";
import { createZoomTool, cropScreenRect, remapFrameToCrop } from "./zoom.js";

const SOURCE_VIEWPORT = {
	windowBounds: { x: 300, y: 150, width: 1000, height: 800 },
	screenshotWidth: 500,
	screenshotHeight: 400,
} satisfies ScreenshotViewport;

const TEST_CONTEXT = {} as ExtensionContext;

describe("#given screenshot crop rect #when converted to screen #then it maps both corners through the viewport", () => {
	it("returns the host screen rect for a screenshot-pixel crop", () => {
		const rect = cropScreenRect({ x: 50, y: 25, width: 200, height: 100 }, SOURCE_VIEWPORT);

		expect(rect).toEqual({ x: 400, y: 200, width: 400, height: 200 });
	});
});

describe("#given an element frame in source screenshot pixels #when remapped into a crop #then it uses crop pixel dimensions", () => {
	it("returns crop-local pixel coordinates", () => {
		const screenRect = cropScreenRect({ x: 50, y: 25, width: 200, height: 100 }, SOURCE_VIEWPORT);
		const frame = remapFrameToCrop({ x: 100, y: 50, width: 50, height: 25 }, SOURCE_VIEWPORT, screenRect, {
			width: 800,
			height: 400,
		});

		expect(frame).toEqual({ x: 200, y: 100, width: 200, height: 100 });
	});
});

describe("#given zoom target parameters #when target count is not exactly one #then execution rejects", () => {
	it("rejects missing and ambiguous targets", async () => {
		const tool = createZoomTool(createComputer());

		await expect(tool.execute("call", { app: "Finder" }, undefined, undefined, TEST_CONTEXT)).rejects.toThrow(
			"zoom requires exactly one of element_index or region",
		);
		await expect(
			tool.execute(
				"call",
				{ app: "Finder", element_index: "9", region: { x: 0, y: 0, width: 10, height: 10 } },
				undefined,
				undefined,
				TEST_CONTEXT,
			),
		).rejects.toThrow("zoom requires exactly one of element_index or region");
	});
});

describe("#given zoom tool with fake computer #when zooming a region #then it captures high-res crop and returns annotated image", () => {
	it("maps the crop to screen coordinates and labels intersecting elements", async () => {
		const computer = createComputer();
		const screenshot = vi.spyOn(computer, "screenshot");
		const tool = createZoomTool(computer);

		const result = await tool.execute(
			"call",
			{ app: "Finder", region: { x: 50, y: 25, width: 200, height: 100 } },
			undefined,
			undefined,
			TEST_CONTEXT,
		);

		expect(screenshot).toHaveBeenCalledWith({ region: { x: 400, y: 200, width: 400, height: 200 } });
		expect(result.content[0]).toMatchObject({ type: "image", mimeType: "image/png" });
		expect(textContent(result.content)).toContain("zoom numbers are element_index values");
		expect(textContent(result.content)).toContain("click element_index=<number>");
		expect(result.details).toMatchObject({
			rect: {
				source: { x: 50, y: 25, width: 200, height: 100 },
				screen: { x: 400, y: 200, width: 400, height: 200 },
			},
			marks: [{ id: 9, box: { x: 200, y: 100, width: 200, height: 100 } }],
		});
	});

	it("uses the cached get_app_state instead of capturing a fresh app state", async () => {
		const computer = createComputer();
		const cachedState = await computer.getAppState(1234);
		const cache = createAppStateCache();
		cache.store({
			...cachedState,
			captureFrame: {
				captureId: "cached-capture",
				capturedAt: "2026-06-19T00:00:00.000Z",
				displayEpoch: "cached-display",
				target: { pid: 1234, bundleId: "com.apple.finder", appName: "Finder" },
				windowBounds: { x: 10, y: 20, width: 100, height: 100 },
				screenshot: { width: 100, height: 100 },
				model: { width: 100, height: 100 },
				display: {
					logical: { x: 0, y: 0, width: 500, height: 500 },
					native: { width: 1000, height: 1000 },
					scaleFactor: 2,
				},
				screenshotWidth: 100,
				screenshotHeight: 100,
			},
		});
		vi.mocked(computer.getAppState).mockClear();
		const tool = createZoomTool(computer, cache);

		await tool.execute(
			"call",
			{ app: "Finder", region: { x: 10, y: 10, width: 20, height: 20 } },
			undefined,
			undefined,
			TEST_CONTEXT,
		);

		expect(computer.getAppState).not.toHaveBeenCalled();
		expect(computer.screenshot).toHaveBeenCalledWith({ region: { x: 20, y: 30, width: 20, height: 20 } });
	});

	it("skips source AX elements with zero-size frames", async () => {
		const computer = createComputer();
		vi.mocked(computer.getAppState).mockResolvedValue({
			app: "Finder",
			bundleId: "com.apple.finder",
			pid: 1234,
			frontmost: true,
			axAvailable: true,
			elements: [
				{
					id: 7,
					role: "AXButton",
					label: "Hidden",
					value: null,
					frame: { x: 0, y: 0, width: 0, height: 0 },
					actions: ["AXPress"],
					children: [],
				},
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
			windowBounds: SOURCE_VIEWPORT.windowBounds,
		});
		const tool = createZoomTool(computer);

		const result = await tool.execute(
			"call",
			{ app: "Finder", element_index: "9" },
			undefined,
			undefined,
			TEST_CONTEXT,
		);

		expect(result.details).toMatchObject({
			marks: [{ id: 9 }],
		});
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
	const canvas = createCanvas(800, 400);
	const context = canvas.getContext("2d");
	context.fillStyle = "#ffffff";
	context.fillRect(0, 0, 800, 400);
	return canvas.toBuffer("image/png");
}

function textContent(content: readonly { readonly type: string }[]): string {
	return content.map((entry) => (entry.type === "text" && "text" in entry ? String(entry.text) : "")).join("\n");
}
