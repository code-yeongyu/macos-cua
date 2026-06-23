import { describe, expect, it } from "vitest";

import { CoordinateValidationError, displayProfileForModel, resolveDisplayConfig, unscaleCoord } from "./coords.js";

type ExpectedCoordinateValidationError = {
	readonly code: CoordinateValidationError["code"];
	readonly message: string;
	readonly recoveryHint: string;
	readonly details?: Readonly<Record<string, unknown>>;
};

function expectCoordinateValidationError(action: () => unknown, expected: ExpectedCoordinateValidationError): void {
	const error = captureThrown(action);

	expect(error).toBeInstanceOf(CoordinateValidationError);
	expect(error).toMatchObject({
		name: "ComputerUseError",
		code: expected.code,
		message: expect.stringContaining(expected.message),
		recoveryHint: expect.stringContaining(expected.recoveryHint),
		...(expected.details === undefined ? {} : { details: expect.objectContaining(expected.details) }),
	});
}

function captureThrown(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected action to throw");
}

describe("#given a small screen #when resolving display config #then model dimensions pass through", () => {
	it("keeps logical dimensions unchanged", () => {
		const display = resolveDisplayConfig({ width: 1024, height: 700 });

		expect(display).toEqual({ logicalWidth: 1024, logicalHeight: 700, modelWidth: 1024, modelHeight: 700 });
	});
});

describe("#given a large 16:9 screen #when resolving display config #then dimensions follow the byte budget", () => {
	it("keeps higher fidelity than the old blanket 1280 cap while preserving aspect ratio", () => {
		const display = resolveDisplayConfig({ width: 2560, height: 1440 });

		expect(display).toEqual({ logicalWidth: 2560, logicalHeight: 1440, modelWidth: 2158, modelHeight: 1214 });
	});
});

describe("#given a large non-16:9 screen #when resolving display config #then dimensions follow the byte budget", () => {
	it("keeps higher fidelity than the old blanket 1280 cap while preserving aspect ratio", () => {
		const display = resolveDisplayConfig({ width: 2560, height: 1600 });

		expect(display).toEqual({ logicalWidth: 2560, logicalHeight: 1600, modelWidth: 2048, modelHeight: 1280 });
	});
});

describe("#given a 1024 display profile #when resolving display config #then the long edge follows the profile", () => {
	it("preserves aspect ratio against the 1024 long edge", () => {
		const display = resolveDisplayConfig({ width: 2560, height: 1600 }, { maxLongEdge: 1024 });

		expect(display).toEqual({ logicalWidth: 2560, logicalHeight: 1600, modelWidth: 1024, modelHeight: 640 });
	});
});

describe("#given model ids #when resolving display profiles #then Anthropic native keeps its hard cap and OpenAI uses budget", () => {
	it("distinguishes Anthropic native from other providers", () => {
		const anthropicProfile = displayProfileForModel("anthropic-messages", "claude-sonnet-4-5");
		const openaiProfile = displayProfileForModel("openai-responses", "gpt-5.1");

		expect(anthropicProfile).toMatchObject({ maxLongEdge: 1024 });
		expect(openaiProfile.maxLongEdge).toBeUndefined();
	});
});

describe("#given a scaled display #when unscaling model coordinates #then logical points are rounded", () => {
	it("returns rounded logical coordinates", () => {
		const display = { logicalWidth: 2560, logicalHeight: 1440, modelWidth: 1280, modelHeight: 720 };

		const point = unscaleCoord({ x: 640.4, y: 360.4 }, display);

		expect(point).toEqual({ x: 1281, y: 721 });
	});
});

describe("#given an unscaled display #when unscaling model coordinates #then coordinates are idempotent", () => {
	it("returns the same rounded coordinates", () => {
		const display = { logicalWidth: 800, logicalHeight: 600, modelWidth: 800, modelHeight: 600 };

		const point = unscaleCoord({ x: 12.3, y: 45.5 }, display);

		expect(point).toEqual({ x: 12, y: 46 });
	});
});

describe("#given malformed model coordinates #when unscaling #then typed coordinate guidance is thrown", () => {
	it("#given negative coordinates #when unscaling #then out-of-bounds is rejected", () => {
		const display = { logicalWidth: 2560, logicalHeight: 1440, modelWidth: 1280, modelHeight: 720 };

		expectCoordinateValidationError(() => unscaleCoord({ x: -1, y: 20 }, display), {
			code: "OUT_OF_BOUNDS_COORDINATE",
			message: "valid x range [0, 1280] and y range [0, 720]",
			recoveryHint: "Capture a fresh screenshot",
			details: { x: -1, y: 20, width: 1280, height: 720 },
		});
	});

	it("#given coordinates beyond model dimensions #when unscaling #then out-of-bounds is rejected", () => {
		const display = { logicalWidth: 2560, logicalHeight: 1440, modelWidth: 1280, modelHeight: 720 };

		expectCoordinateValidationError(() => unscaleCoord({ x: 1281, y: 20 }, display), {
			code: "OUT_OF_BOUNDS_COORDINATE",
			message: "received (1281, 20)",
			recoveryHint: "Capture a fresh screenshot",
			details: { x: 1281, y: 20, width: 1280, height: 720 },
		});
	});

	it("#given NaN coordinates #when unscaling #then malformed input is rejected", () => {
		const display = { logicalWidth: 2560, logicalHeight: 1440, modelWidth: 1280, modelHeight: 720 };

		expectCoordinateValidationError(() => unscaleCoord({ x: Number.NaN, y: 20 }, display), {
			code: "OUT_OF_BOUNDS_COORDINATE",
			message: "received (NaN, 20)",
			recoveryHint: "Capture a fresh screenshot",
			details: { x: "NaN", y: 20, width: 1280, height: 720 },
		});
	});
});

describe("#given a stale display capture #when unscaling #then typed stale guidance is thrown", () => {
	it("#given the capture id changed #when unscaling #then stale capture is rejected", () => {
		const display = {
			captureId: "capture-1",
			displayEpoch: "display-1",
			logicalWidth: 2560,
			logicalHeight: 1440,
			modelWidth: 1280,
			modelHeight: 720,
		};

		expectCoordinateValidationError(
			() => unscaleCoord({ x: 10, y: 20 }, display, { captureId: "capture-2", displayEpoch: "display-1" }),
			{
				code: "STALE_CAPTURE",
				message: "received captureId capture-2",
				recoveryHint: "fresh screenshot",
				details: {
					captureId: "capture-1",
					expectedCaptureId: "capture-2",
					displayEpoch: "display-1",
					expectedDisplayEpoch: "display-1",
				},
			},
		);
	});
});
