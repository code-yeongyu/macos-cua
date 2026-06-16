import { describe, expect, it } from "vitest";
import { captureDisplayRectPng, computeCropPixels } from "./screenshot.js";

describe("#given a logical screenshot rect #when computing crop pixels #then native pixel bounds contain the rect", () => {
	it("floors the origin and ceils the far edge at the display scale", () => {
		const crop = computeCropPixels({ x: 10.25, y: 20.5, width: 30.25, height: 40.25 }, 2);

		expect(crop).toEqual({ x: 20, y: 41, width: 61, height: 81 });
	});
});

describe("#given a malformed logical screenshot rect #when computing crop pixels #then input is rejected before capture", () => {
	it("requires a finite positive scale factor", () => {
		expect(() => computeCropPixels({ x: 0, y: 0, width: 100, height: 100 }, 0)).toThrow(
			"computeCropPixels requires a finite positive scaleFactor",
		);
	});
});

describe("#given an invalid display rect #when capturing a region screenshot #then input is rejected before capture", () => {
	it("requires positive rect dimensions", () => {
		expect(() => captureDisplayRectPng({ x: 0, y: 0, width: 0, height: 100 })).toThrow(
			"captureDisplayRectPng requires positive rect dimensions",
		);
	});
});

describe("#given a malformed display rect #when capturing a region screenshot #then finite values are required", () => {
	it("requires finite coordinates and dimensions", () => {
		expect(() => captureDisplayRectPng({ x: Number.NaN, y: 0, width: 100, height: 100 })).toThrow(
			"captureDisplayRectPng requires finite rect coordinates and dimensions",
		);
	});
});
