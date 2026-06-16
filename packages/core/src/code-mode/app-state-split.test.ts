import { describe, expect, it } from "vitest";

import type { AppState } from "../accessibility/types.js";
import { splitAppState } from "./app-state-split.js";

const PNG_BASE64 = Buffer.from("png-bytes").toString("base64");

function appStateWith(overrides: Partial<AppState> = {}): AppState {
	return {
		app: "Finder",
		bundleId: "com.apple.finder",
		pid: 123,
		frontmost: true,
		axAvailable: true,
		elements: [],
		screenshotBase64: PNG_BASE64,
		screenshotWidth: 640,
		screenshotHeight: 480,
		display: { width: 1440, height: 900, scaleFactor: 2 },
		...overrides,
	};
}

describe("#given an AppState with screenshot data #when splitting app state #then structured data omits base64", () => {
	it("#given an AppState with screenshot data #when splitting app state #then structured data omits screenshotBase64", () => {
		// given
		const state = appStateWith();

		// when
		const { structured } = splitAppState(state);

		// then
		expect("screenshotBase64" in structured).toBe(false);
		expect(structured.app).toBe(state.app);
		expect(structured.screenshotWidth).toBe(state.screenshotWidth);
	});
});

describe("#given an AppState screenshot #when splitting app state #then bytes roundtrip from base64", () => {
	it("#given an AppState screenshot #when splitting app state #then ScreenshotResult data roundtrips to original base64", () => {
		// given
		const state = appStateWith({ screenshotMimeType: "image/jpeg" });

		// when
		const { screenshotBytes } = splitAppState(state);

		// then
		expect(screenshotBytes.data.toString("base64")).toBe(state.screenshotBase64);
		expect(screenshotBytes.width).toBe(state.screenshotWidth);
		expect(screenshotBytes.height).toBe(state.screenshotHeight);
		expect(screenshotBytes.mimeType).toBe("image/jpeg");
	});
});

describe("#given an AppState without screenshot mime type #when splitting app state #then png is the default", () => {
	it("#given an AppState without screenshot mime type #when splitting app state #then screenshotBytes mimeType defaults to image/png", () => {
		// given
		const state = appStateWith();

		// when
		const { screenshotBytes } = splitAppState(state);

		// then
		expect(screenshotBytes.mimeType).toBe("image/png");
	});
});
