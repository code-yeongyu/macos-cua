import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import type { ScreenshotResult } from "../computer/interface.js";
import { assembleRunResult } from "./result.js";
import { ScreenshotStore } from "./screenshot-store.js";

function fakeScreenshot(data: string, mimeType: "image/png" | "image/jpeg" = "image/png"): ScreenshotResult {
	return {
		data: Buffer.from(data),
		mimeType,
		width: 10,
		height: 8,
	};
}

describe("#given surfaced screenshot handles #when assembling a run result #then images resolve in surface order", () => {
	it("keeps image bytes and mime types out of the text transcript", () => {
		const store = new ScreenshotStore();
		const first = store.put(fakeScreenshot("first image", "image/jpeg"));
		const second = store.put(fakeScreenshot("second image"));

		const result = assembleRunResult(
			{
				logs: ["before", "after"],
				result: { done: true },
				surfaced: [second.id, first.id],
			},
			store,
		);

		expect(result.images).toEqual([
			{ data: Buffer.from("second image"), mimeType: "image/png" },
			{ data: Buffer.from("first image"), mimeType: "image/jpeg" },
		]);
		expect(result.text).toBe('before\nafter\n{"done":true}');
	});
});

describe("#given a stale surfaced screenshot handle #when assembling a run result #then the note is appended without throwing", () => {
	it("omits the stale image and keeps the JSON result last", () => {
		const store = new ScreenshotStore();
		const visible = store.put(fakeScreenshot("visible image"));

		const result = assembleRunResult(
			{
				logs: ["log line"],
				result: { ok: false },
				surfaced: ["shot_missing", visible.id],
			},
			store,
		);

		expect(result.images).toEqual([{ data: Buffer.from("visible image"), mimeType: "image/png" }]);
		expect(result.text).toBe('log line\nsurface failed: SCREENSHOT_HANDLE_STALE shot_missing\n{"ok":false}');
	});
});

describe("#given a void run with no logs #when assembling a run result #then text reports ok", () => {
	it("uses the default ok JSON text", () => {
		const store = new ScreenshotStore();

		const result = assembleRunResult({ logs: [], result: undefined, surfaced: [] }, store);

		expect(result).toEqual({
			images: [],
			text: '{"ok":true}',
		});
	});
});

describe("#given a surfaced image with secret bytes #when assembling a run result #then text does not leak base64 data", () => {
	it("keeps image bytes only in the image attachment", () => {
		const store = new ScreenshotStore();
		const secret = Buffer.from("sensitive screenshot bytes");
		const handle = store.put({
			data: secret,
			mimeType: "image/png",
			width: 10,
			height: 8,
		});

		const result = assembleRunResult(
			{
				logs: ["captured"],
				result: undefined,
				surfaced: [handle.id],
			},
			store,
		);

		expect(result.images).toEqual([{ data: secret, mimeType: "image/png" }]);
		expect(result.text).toBe("captured");
		const secretBase64 = secret.toString("base64");
		expect(result.text).not.toContain(secretBase64);
	});
});
