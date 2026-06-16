import { beforeEach, describe, expect, it, vi } from "vitest";

const screenshotMock = vi.hoisted(() => ({
	captureDisplayRectPng: vi.fn(),
	captureMainDisplayPng: vi.fn(),
	getMainDisplayLogicalSize: vi.fn(),
	getMainDisplayNativePixelSize: vi.fn(),
}));

vi.mock("./macos-ffi/screenshot.js", () => screenshotMock);

import { MacOSHostComputer } from "./macos.js";
import { captureMacOSScreenshot } from "./macos.js";

function fakePng(width: number, height: number): Buffer {
	const data = globalThis.Buffer.alloc(24);
	data.write("\u0089PNG\r\n\u001a\n", 0, "latin1");
	data.writeUInt32BE(width, 16);
	data.writeUInt32BE(height, 20);
	return data;
}

beforeEach(() => {
	screenshotMock.captureDisplayRectPng.mockReset();
	screenshotMock.captureMainDisplayPng.mockReset();
	screenshotMock.getMainDisplayLogicalSize.mockReset();
	screenshotMock.getMainDisplayNativePixelSize.mockReset();
});

describe("#given a macOS region screenshot request #when screenshot captures a region #then it returns PNG metadata", () => {
	it("routes the region through the display-rect capture helper", async () => {
		const region = { x: 100, y: 100, width: 300, height: 200 };
		screenshotMock.captureDisplayRectPng.mockReturnValue({ data: fakePng(300, 200), width: 300, height: 200 });
		const computer = new MacOSHostComputer();

		const result = await computer.screenshot({ region });

		expect(screenshotMock.captureDisplayRectPng).toHaveBeenCalledWith(region, 300);
		expect(result).toEqual({
			data: fakePng(300, 200),
			mimeType: "image/png",
			width: 300,
			height: 200,
		});
	});
});

describe("#given a macOS region screenshot helper request #when captureMacOSScreenshot receives a region #then it uses region capture", () => {
	it("routes through display-rect capture with target max pixel size", async () => {
		const region = { x: 100, y: 100, width: 300, height: 200 };
		screenshotMock.captureDisplayRectPng.mockReturnValue({ data: fakePng(150, 100), width: 150, height: 100 });

		const result = await captureMacOSScreenshot({ width: 150, height: 100 }, undefined, "png", 72, region);

		expect(result).toEqual(fakePng(150, 100));
		expect(screenshotMock.captureDisplayRectPng).toHaveBeenCalledWith(region, 150);
		expect(screenshotMock.captureMainDisplayPng).not.toHaveBeenCalled();
	});
});
