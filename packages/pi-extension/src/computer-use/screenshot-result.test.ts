/// <reference path="./pngjs.d.ts" />

import { PNG } from "pngjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DisplayConfig } from "./coords.js";
import { screenshotResultWithCursor } from "./screenshot-result.js";

const DISPLAY = {
	logicalWidth: 200,
	logicalHeight: 100,
	modelWidth: 100,
	modelHeight: 50,
} satisfies DisplayConfig;

const CURSOR_RED = [255, 59, 48, 255] as const;

type ScreenshotResultComputer = Parameters<typeof screenshotResultWithCursor>[0];

afterEach(() => {
	process.env["MACOS_CUA_DEBUG"] = undefined;
	vi.restoreAllMocks();
});

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

function createComputer(width: number, height: number): ScreenshotResultComputer {
	return {
		screenshot: vi.fn<ScreenshotResultComputer["screenshot"]>().mockResolvedValue({
			data: createPng(width, height),
			mimeType: "image/png",
			width,
			height,
		}),
		getCursorPosition: vi.fn<ScreenshotResultComputer["getCursorPosition"]>().mockResolvedValue({ x: 100, y: 50 }),
	};
}

function imageDataFrom(result: Awaited<ReturnType<typeof screenshotResultWithCursor>>): PNG {
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

describe("#given exact capture dimensions #when screenshot result is built #then image dimensions are preserved", () => {
	it("returns a cursor-annotated PNG at the display model size", async () => {
		const computer = createComputer(DISPLAY.modelWidth, DISPLAY.modelHeight);

		const result = await screenshotResultWithCursor(computer, DISPLAY);
		const image = imageDataFrom(result);

		expect(computer.screenshot).toHaveBeenCalledWith({ targetSize: { width: 100, height: 50 } });
		expect(image.width).toBe(DISPLAY.modelWidth);
		expect(image.height).toBe(DISPLAY.modelHeight);
		expect(pixelAt(image, 50, 25)).toEqual(CURSOR_RED);
	});
});

describe("#given mismatched capture dimensions #when screenshot result is built #then image is resized to model dimensions", () => {
	it("returns an exact model-sized PNG and logs the mismatch", async () => {
		process.env["MACOS_CUA_DEBUG"] = "1";
		const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		const computer = createComputer(80, 40);

		const result = await screenshotResultWithCursor(computer, DISPLAY);
		const image = imageDataFrom(result);

		expect(image.width).toBe(DISPLAY.modelWidth);
		expect(image.height).toBe(DISPLAY.modelHeight);
		expect(pixelAt(image, 50, 25)).toEqual(CURSOR_RED);
		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				'"scope":"coords","event":"screenshot-dimensions-mismatch","actualWidth":80,"actualHeight":40,"expectedWidth":100,"expectedHeight":50',
			),
		);
	});
});
