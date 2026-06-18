import { describe, expect, it } from "vitest";

import type { Point } from "../types/index.js";
import { createCaptureFrame, createCaptureFrameTransform } from "./capture-frame.js";
import { screenshotPointToScreen } from "./viewport.js";

const CAPTURE_FRAME = createCaptureFrame({
	captureId: "capture-1",
	capturedAt: "2026-06-18T00:00:00.000Z",
	displayEpoch: "display-1",
	target: { pid: 321, bundleId: "com.apple.finder", appName: "Finder" },
	windowBounds: { x: 300, y: 150, width: 1000, height: 800 },
	screenshot: { width: 1000, height: 800 },
	model: { width: 500, height: 400 },
	display: {
		logical: { x: 0, y: 0, width: 1728, height: 1117 },
		native: { width: 3456, height: 2234 },
		scaleFactor: 2,
	},
});

describe("#given a capture frame #when mapping an inside model point #then it resolves to global screen coordinates", () => {
	it("#given a scaled window capture #when point is inside the model dimensions #then transform metadata maps it", () => {
		const transform = createCaptureFrameTransform(CAPTURE_FRAME);

		expect(
			transform.modelPointToScreen(
				{ x: 250, y: 200 },
				{
					captureId: "capture-1",
					displayEpoch: "display-1",
				},
			),
		).toEqual<Point>({ x: 800, y: 550 });
	});
});

describe("#given a stale capture frame #when mapping a model point #then it rejects with typed recovery guidance", () => {
	it("#given the display epoch changed #when point is mapped #then stale capture is rejected", () => {
		expect(() =>
			screenshotPointToScreen({ x: 250, y: 200 }, CAPTURE_FRAME, {
				captureId: "capture-1",
				displayEpoch: "display-2",
			}),
		).toThrowError(
			expect.objectContaining({
				name: "ComputerUseError",
				code: "STALE_CAPTURE",
				recoveryHint: expect.stringContaining("refresh the capture"),
			}),
		);
	});

	it("#given the requested capture id changed #when point is mapped #then stale capture is rejected", () => {
		expect(() =>
			screenshotPointToScreen({ x: 250, y: 200 }, CAPTURE_FRAME, {
				captureId: "capture-2",
				displayEpoch: "display-1",
			}),
		).toThrowError(
			expect.objectContaining({
				name: "ComputerUseError",
				code: "STALE_CAPTURE",
				recoveryHint: expect.stringContaining("refresh the capture"),
			}),
		);
	});
});

describe("#given malformed model coordinates #when mapping through a capture frame #then it rejects without clamping", () => {
	it("#given a negative model coordinate #when point is mapped #then out-of-bounds is rejected", () => {
		expect(() =>
			screenshotPointToScreen({ x: -1, y: 200 }, CAPTURE_FRAME, {
				captureId: "capture-1",
				displayEpoch: "display-1",
			}),
		).toThrowError(
			expect.objectContaining({
				name: "ComputerUseError",
				code: "OUT_OF_BOUNDS_COORDINATE",
				recoveryHint: expect.stringContaining("inside the capture frame"),
			}),
		);
	});

	it("#given a coordinate beyond model dimensions #when point is mapped #then out-of-bounds is rejected", () => {
		expect(() =>
			screenshotPointToScreen({ x: 501, y: 200 }, CAPTURE_FRAME, {
				captureId: "capture-1",
				displayEpoch: "display-1",
			}),
		).toThrowError(
			expect.objectContaining({
				name: "ComputerUseError",
				code: "OUT_OF_BOUNDS_COORDINATE",
				recoveryHint: expect.stringContaining("inside the capture frame"),
			}),
		);
	});

	it("#given a NaN coordinate #when point is mapped #then malformed input is rejected", () => {
		expect(() =>
			screenshotPointToScreen({ x: Number.NaN, y: 200 }, CAPTURE_FRAME, {
				captureId: "capture-1",
				displayEpoch: "display-1",
			}),
		).toThrowError(
			expect.objectContaining({
				name: "ComputerUseError",
				code: "OUT_OF_BOUNDS_COORDINATE",
				recoveryHint: expect.stringContaining("inside the capture frame"),
			}),
		);
	});
});

describe("#given a capture frame outside the display #when mapping a model point #then it rejects the stale transform", () => {
	it("#given the target window no longer fits the display #when point is mapped #then out-of-bounds is rejected", () => {
		const offscreenFrame = createCaptureFrame({
			...CAPTURE_FRAME,
			windowBounds: { x: 1700, y: 1000, width: 1000, height: 800 },
		});

		expect(() =>
			screenshotPointToScreen({ x: 250, y: 200 }, offscreenFrame, {
				captureId: "capture-1",
				displayEpoch: "display-1",
			}),
		).toThrowError(
			expect.objectContaining({
				name: "ComputerUseError",
				code: "OUT_OF_BOUNDS_COORDINATE",
				recoveryHint: expect.stringContaining("inside the capture frame"),
			}),
		);
	});
});
