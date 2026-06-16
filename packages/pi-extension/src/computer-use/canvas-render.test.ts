/// <reference path="./pngjs.d.ts" />

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import { renderTestCard } from "./canvas-render.js";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47] as const;

describe("#given a canvas test card #when rendering to PNG #then the signature and dimensions match", () => {
	it("returns a PNG buffer with the requested size", () => {
		const png = renderTestCard(120, 40, "12");

		expect([...png.subarray(0, PNG_SIGNATURE.length)]).toEqual(PNG_SIGNATURE);

		const decoded = PNG.sync.read(png);
		expect(decoded.width).toBe(120);
		expect(decoded.height).toBe(40);
	});
});
