/// <reference path="./pngjs.d.ts" />

import { createCanvas } from "@napi-rs/canvas";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SomMark } from "./som-layout.js";
import { renderSomOverlay } from "./som-render.js";

type StderrWrite = (
	chunk: string | Uint8Array,
	encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
	callback?: (err?: Error | null) => void,
) => boolean;

const BASE_MARK: SomMark = {
	id: 7,
	label: "7",
	colorIndex: 0,
	box: { x: 40, y: 35, width: 100, height: 60 },
	labelBox: { x: 40, y: 12, width: 24, height: 18 },
};

describe("#given no SoM marks #when rendering an overlay #then the original PNG bytes are returned exactly", () => {
	it("preserves buffer identity and bytes", async () => {
		const input = fixturePng(400, 300);

		const output = await renderSomOverlay(input, []);

		expect(output).toBe(input);
		expect(Buffer.compare(output, input)).toBe(0);
	});
});

describe("#given SoM marks with precomputed label boxes #when rendering an overlay #then marks are drawn onto the original image", () => {
	it("keeps dimensions and changes stroke plus label pixels", async () => {
		const input = fixturePng(400, 300);

		const output = await renderSomOverlay(input, [BASE_MARK]);

		expect(output).not.toBe(input);
		expect(Buffer.compare(output, input)).not.toBe(0);

		const original = PNG.sync.read(input);
		const rendered = PNG.sync.read(output);
		expect(rendered.width).toBe(400);
		expect(rendered.height).toBe(300);
		expect(pixelAt(rendered, 40, 35)).not.toEqual(pixelAt(original, 40, 35));
		expect(pixelAt(rendered, 42, 14)).not.toEqual(pixelAt(original, 42, 14));
	});

	it("keeps JPEG pixels visible instead of rendering a transparent black background", async () => {
		const input = fixtureJpeg(400, 300);

		const output = await renderSomOverlay(input, [BASE_MARK]);

		const rendered = PNG.sync.read(output);
		expect(rendered.width).toBe(400);
		expect(rendered.height).toBe(300);
		const backgroundPixel = pixelAt(rendered, 100, 100);
		expect(backgroundPixel[0]).toBeGreaterThan(200);
		expect(backgroundPixel[3]).toBe(255);
		expect(pixelAt(rendered, 40, 35)[0]).not.toBe(backgroundPixel[0]);
	});
});

describe("#given malformed image input #when rendering an overlay #then the original bytes are returned and a skip log is emitted", () => {
	it("logs the decode failure through the overlay debug scope", async () => {
		vi.stubEnv("MACOS_CUA_DEBUG", "1");
		const writes = captureStderrWrites();
		const input = Buffer.from("not a png");

		const output = await renderSomOverlay(input, [BASE_MARK]);

		expect(output).toBe(input);
		expect(Buffer.compare(output, input)).toBe(0);
		expect(writes).toHaveLength(1);
		expect(JSON.parse(writes[0] ?? "")).toMatchObject({
			scope: "overlay",
			event: "skip",
		});
	});
});

beforeEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

function fixturePng(width: number, height: number): Buffer {
	const canvas = createCanvas(width, height);
	const context = canvas.getContext("2d");
	context.fillStyle = "#f8fafc";
	context.fillRect(0, 0, width, height);
	return canvas.toBuffer("image/png");
}

function fixtureJpeg(width: number, height: number): Buffer {
	const canvas = createCanvas(width, height);
	const context = canvas.getContext("2d");
	context.fillStyle = "#f8fafc";
	context.fillRect(0, 0, width, height);
	return canvas.toBuffer("image/jpeg");
}

function pixelAt(png: PNG, x: number, y: number): readonly number[] {
	const offset = (png.width * y + x) * 4;
	return [png.data[offset], png.data[offset + 1], png.data[offset + 2], png.data[offset + 3]];
}

function captureStderrWrites(): readonly string[] {
	const writes: string[] = [];
	const write: StderrWrite = (chunk, encodingOrCallback, callback) => {
		writes.push(typeof chunk === "string" ? chunk : chunk.toString());
		if (typeof encodingOrCallback === "function") {
			encodingOrCallback();
		}
		callback?.();
		return true;
	};
	vi.spyOn(process.stderr, "write").mockImplementation(write);
	return writes;
}
