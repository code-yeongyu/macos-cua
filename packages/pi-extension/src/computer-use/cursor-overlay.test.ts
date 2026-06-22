/// <reference path="./pngjs.d.ts" />

import { PNG } from "pngjs";
import { describe, expect, it, vi } from "vitest";

import { type ComputerActionDriver, executeNativeComputerAction } from "../anthropic-computer-use.js";
import { executeOpenAIComputerAction } from "../openai-computer-use.js";
import type { DisplayConfig } from "./coords.js";
import { drawCursorOnWindowScreenshot } from "./screenshot-result.js";

const DISPLAY = {
	logicalWidth: 200,
	logicalHeight: 100,
	modelWidth: 100,
	modelHeight: 50,
} satisfies DisplayConfig;

const CURSOR_RED = [255, 59, 48, 255] as const;

function createPng(width: number, height: number): Buffer {
	const png = new PNG({ width, height });
	for (let offset = 0; offset < png.data.length; offset += 4) {
		png.data[offset] = 12;
		png.data[offset + 1] = 16;
		png.data[offset + 2] = 20;
		png.data[offset + 3] = 255;
	}
	return PNG.sync.write(png);
}

function createComputer(cursor: { readonly x: number; readonly y: number }): ComputerActionDriver {
	return {
		capabilities: {
			supportsScreenshot: true,
			supportsInput: true,
			supportsAccessibility: true,
			supportsClipboard: true,
		},
		screenshot: vi.fn<ComputerActionDriver["screenshot"]>().mockResolvedValue({
			data: createPng(DISPLAY.modelWidth, DISPLAY.modelHeight),
			mimeType: "image/png",
			width: DISPLAY.modelWidth,
			height: DISPLAY.modelHeight,
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
		getCursorPosition: vi.fn<ComputerActionDriver["getCursorPosition"]>().mockResolvedValue(cursor),
		selectText: vi.fn<ComputerActionDriver["selectText"]>().mockResolvedValue(undefined),
		getScreenSize: vi.fn<ComputerActionDriver["getScreenSize"]>().mockResolvedValue({
			width: DISPLAY.logicalWidth,
			height: DISPLAY.logicalHeight,
		}),
		getAppState: vi.fn<ComputerActionDriver["getAppState"]>(),
		getScreenshotViewport: vi.fn<ComputerActionDriver["getScreenshotViewport"]>().mockResolvedValue(undefined),
		listApps: vi.fn<ComputerActionDriver["listApps"]>(),
		setValue: vi.fn<ComputerActionDriver["setValue"]>(),
		performAction: vi.fn<ComputerActionDriver["performAction"]>(),
		pressAtPosition: vi.fn<ComputerActionDriver["pressAtPosition"]>(),
		typeIntoFocused: vi.fn<ComputerActionDriver["typeIntoFocused"]>(),
		close: vi.fn<ComputerActionDriver["close"]>().mockResolvedValue(undefined),
	};
}

function imageDataFrom(result: Awaited<ReturnType<typeof executeNativeComputerAction>>): PNG {
	const first = result.content[0];
	expect(first?.type).toBe("image");
	if (first?.type !== "image") {
		throw new Error("expected image result");
	}
	return PNG.sync.read(Buffer.from(first.data, "base64"));
}

function pixelAt(png: PNG, x: number, y: number): readonly number[] {
	const offset = (png.width * y + x) * 4;
	return [png.data[offset], png.data[offset + 1], png.data[offset + 2], png.data[offset + 3]];
}

describe("#given native computer screenshots #when Anthropic screenshot executes #then cursor is drawn into returned PNG", () => {
	it("renders the scaled cursor center in screenshot pixels", async () => {
		const computer = createComputer({ x: 100, y: 50 });

		const result = await executeNativeComputerAction({ action: "screenshot" }, computer, DISPLAY);

		expect(computer.getCursorPosition).toHaveBeenCalledTimes(1);
		expect(pixelAt(imageDataFrom(result), 50, 25)).toEqual(CURSOR_RED);
	});
});

describe("#given native computer screenshots #when OpenAI screenshot executes #then cursor overlay matches Anthropic", () => {
	it("renders the scaled cursor center in screenshot pixels", async () => {
		const computer = createComputer({ x: 100, y: 50 });

		const result = await executeOpenAIComputerAction({ type: "screenshot" }, computer, DISPLAY);

		expect(computer.getCursorPosition).toHaveBeenCalledTimes(1);
		expect(pixelAt(imageDataFrom(result), 50, 25)).toEqual(CURSOR_RED);
	});
});

describe("#given a cursor outside the display #when screenshot executes #then overlay is omitted", () => {
	it("leaves the capture pixels unchanged instead of clamping the cursor to an edge", async () => {
		const computer = createComputer({ x: 999, y: -20 });

		const result = await executeNativeComputerAction({ action: "screenshot" }, computer, DISPLAY);

		expect(pixelAt(imageDataFrom(result), 99, 0)).toEqual([12, 16, 20, 255]);
	});
});

describe("#given a cursor outside the target window #when drawing on a window screenshot #then overlay is omitted", () => {
	it("returns the original image bytes", async () => {
		const imageBytes = createPng(80, 40);

		const result = await drawCursorOnWindowScreenshot(
			imageBytes,
			{ x: 500, y: 50 },
			{ x: 10, y: 10, width: 200, height: 100 },
		);

		expect(result).toBe(imageBytes);
	});
});

describe("#given malformed screenshot bytes #when screenshot executes #then raw screenshot behavior is preserved", () => {
	it("returns the original image bytes without throwing", async () => {
		const computer = createComputer({ x: 100, y: 50 });
		vi.mocked(computer.screenshot).mockResolvedValue({
			data: Buffer.from("png"),
			mimeType: "image/png",
			width: DISPLAY.modelWidth,
			height: DISPLAY.modelHeight,
		});

		const result = await executeNativeComputerAction({ action: "screenshot" }, computer, DISPLAY);

		const first = result.content[0];
		expect(first).toEqual({ type: "image", data: Buffer.from("png").toString("base64"), mimeType: "image/png" });
	});
});

describe("#given native screenshot dimensions differ from display #when screenshot executes #then result is resized to model dimensions", () => {
	it("returns an image matching the selected display dimensions", async () => {
		const computer = createComputer({ x: 100, y: 50 });
		vi.mocked(computer.screenshot).mockResolvedValue({
			data: createPng(80, 40),
			mimeType: "image/png",
			width: 80,
			height: 40,
		});

		const result = await executeNativeComputerAction({ action: "screenshot" }, computer, DISPLAY);
		const image = imageDataFrom(result);

		expect(image.width).toBe(DISPLAY.modelWidth);
		expect(image.height).toBe(DISPLAY.modelHeight);
		expect(pixelAt(image, 50, 25)).toEqual(CURSOR_RED);
	});
});
