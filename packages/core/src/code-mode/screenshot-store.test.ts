import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import type { ScreenshotResult } from "../computer/interface.js";
import { CodeModeError } from "./errors.js";
import { ScreenshotStore, createHandleView } from "./screenshot-store.js";

function fakeScreenshot(data: Buffer, width = 12, height = 8): ScreenshotResult {
	return {
		data,
		mimeType: "image/png",
		width,
		height,
	};
}

describe("#given a screenshot store #when a screenshot is put and read #then the handle resolves to the original result", () => {
	it("roundtrips through an opaque handle id", () => {
		const store = new ScreenshotStore();
		const result = fakeScreenshot(Buffer.from("roundtrip"));

		const handle = store.put(result);

		expect(handle.id).toBe("shot_1");
		expect(store.get(handle.id)).toBe(result);
		expect(store.size()).toBe(1);
		expect(store.totalBytes()).toBe(result.data.byteLength);
	});
});

describe("#given a screenshot store with eight screenshots #when another screenshot is put #then the oldest handle is evicted", () => {
	it("throws HANDLE_STALE for the evicted id", () => {
		const store = new ScreenshotStore();
		const first = store.put(fakeScreenshot(Buffer.from("first")));
		for (let index = 0; index < 8; index += 1) {
			store.put(fakeScreenshot(Buffer.from(`later-${index}`)));
		}

		expect(store.size()).toBe(8);
		expect(() => store.get(first.id)).toThrow(CodeModeError);
		expect(() => store.get(first.id)).toThrow(expect.objectContaining({ code: "HANDLE_STALE" }));
	});
});

describe("#given screenshots over the byte budget #when a new screenshot is put #then older bytes are evicted first", () => {
	it("keeps total bytes at or under the run-scoped budget", () => {
		const store = new ScreenshotStore();
		const first = store.put(fakeScreenshot(Buffer.alloc(32 * 1024 * 1024)));
		const second = store.put(fakeScreenshot(Buffer.alloc(32 * 1024 * 1024)));

		store.put(fakeScreenshot(Buffer.alloc(1)));

		expect(store.size()).toBe(2);
		expect(store.totalBytes()).toBe(32 * 1024 * 1024 + 1);
		expect(() => store.get(first.id)).toThrow(expect.objectContaining({ code: "HANDLE_STALE" }));
		expect(store.get(second.id).data.byteLength).toBe(32 * 1024 * 1024);
	});
});

describe("#given an unknown screenshot handle #when it is read #then HANDLE_STALE is thrown", () => {
	it("uses the typed CodeModeError code", () => {
		const store = new ScreenshotStore();

		expect(() => store.get("shot_foreign")).toThrow(expect.objectContaining({ code: "HANDLE_STALE" }));
	});
});

describe("#given a screenshot handle view #when it is serialized #then bytes are not exposed", () => {
	it("stringifies to a screenshot label without data or base64", () => {
		const result = fakeScreenshot(Buffer.from("secret screenshot bytes"), 640, 480);
		const base64Prefix = result.data.toString("base64").slice(0, 32);

		const view = createHandleView("shot_42", result);
		const serialized = JSON.stringify(view);
		const stringified = String(view);

		expect(Object.isFrozen(view)).toBe(true);
		expect(serialized).toContain("[screenshot shot_42 640x480]");
		expect(stringified).toBe("[screenshot shot_42 640x480]");
		expect(serialized).not.toContain("data");
		expect(serialized).not.toContain(base64Prefix);
		expect("data" in view).toBe(false);
	});
});
