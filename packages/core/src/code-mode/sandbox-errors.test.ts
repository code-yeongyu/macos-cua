import { describe, expect, it } from "vitest";

import { serializeHostError } from "./sandbox-errors.js";

class HintError extends Error {
	readonly name = "ComputerUseError";
	readonly code = "OUT_OF_BOUNDS_COORDINATE";
	readonly recoveryHint = "Choose a point inside the capture frame.";
}

describe("#given a typed Computer Use error #when serializing across code-mode #then recovery hints are preserved", () => {
	it("#given a host error with a recovery hint #when serialized #then code and hint are visible to code-mode", () => {
		expect(serializeHostError(new HintError("point outside capture frame"))).toEqual({
			name: "ComputerUseError",
			message: "point outside capture frame",
			code: "OUT_OF_BOUNDS_COORDINATE",
			recoveryHint: "Choose a point inside the capture frame.",
		});
	});
});
