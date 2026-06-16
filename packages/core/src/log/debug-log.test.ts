import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDebugLog } from "../index.js";

type StderrWrite = (
	chunk: string | Uint8Array,
	encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
	callback?: (err?: Error | null) => void,
) => boolean;

describe("#given debug logging is disabled #when a logger records an event #then stderr is untouched", () => {
	it("does not write when MACOS_CUA_DEBUG is unset", () => {
		const writes = captureStderrWrites();
		const log = createDebugLog("coords");

		log("unscale", { x: 1 });

		expect(writes).toEqual([]);
	});
});

describe("#given debug logging is enabled #when a logger records coordinates #then a JSON line is emitted", () => {
	it("writes scope, event, and short fields to stderr", () => {
		vi.stubEnv("MACOS_CUA_DEBUG", "on");
		const writes = captureStderrWrites();
		const log = createDebugLog("coords");

		log("unscale", { x: 640, y: 400, role: "AXButton" });

		expect(writes).toHaveLength(1);
		expect(JSON.parse(writes[0] ?? "")).toEqual({
			scope: "coords",
			event: "unscale",
			x: 640,
			y: 400,
			role: "AXButton",
		});
	});
});

describe("#given a long string field #when debug logging emits it #then only length-based redaction is applied", () => {
	it("redacts strings longer than 256 characters without leaking raw content", () => {
		vi.stubEnv("MACOS_CUA_DEBUG", "true");
		const writes = captureStderrWrites();
		const log = createDebugLog("capture");
		const raw = "A".repeat(257);

		log("shot", { b64: raw });

		expect(writes[0]).toContain("<redacted len=257>");
		expect(writes[0]).not.toContain(raw);
	});
});

describe("#given a short base64-like value #when debug logging emits it #then regex-like redaction is not used", () => {
	it("preserves short strings that are useful for QA", () => {
		vi.stubEnv("MACOS_CUA_DEBUG", "yes");
		const writes = captureStderrWrites();
		const log = createDebugLog("overlay");

		log("mark", { role: "AXButton", tok: "QUJDREVG" });

		expect(JSON.parse(writes[0] ?? "")).toEqual({
			scope: "overlay",
			event: "mark",
			role: "AXButton",
			tok: "QUJDREVG",
		});
	});
});

describe("#given nested debug fields #when debug logging emits them #then nested JSON-safe data is preserved", () => {
	it("serializes nested objects and recursively redacts long strings", () => {
		vi.stubEnv("MACOS_CUA_DEBUG", "1");
		const writes = captureStderrWrites();
		const log = createDebugLog("display");

		log("resolve", {
			requested: { width: 1280, height: 800 },
			actual: [{ width: 1024, height: 640, label: "B".repeat(300) }],
		});

		expect(JSON.parse(writes[0] ?? "")).toEqual({
			scope: "display",
			event: "resolve",
			requested: { width: 1280, height: 800 },
			actual: [{ width: 1024, height: 640, label: "<redacted len=300>" }],
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
