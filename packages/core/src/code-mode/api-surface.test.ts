import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CODE_MODE_API_DTS, CODE_MODE_METHOD_NAMES } from "./api-surface.js";
import type { CodeModeApi } from "./api-surface.js";

const API_SURFACE_SOURCE = readFileSync(new URL("./api-surface.ts", import.meta.url), "utf8");

const CURATED_METHOD_NAMES = [
	"screenshot",
	"getAppState",
	"listApps",
	"click",
	"doubleClick",
	"rightClick",
	"move",
	"drag",
	"scroll",
	"type",
	"pressKeys",
	"setValue",
	"selectText",
	"performAction",
	"getCursorPosition",
] as const satisfies readonly (keyof CodeModeApi)[];

describe("#given CodeModeApi surface #when checking the sandbox whitelist #then it excludes host-only methods", () => {
	it("does not expose host lifecycle, viewport, or capability methods", () => {
		// given
		const forbiddenMethods = ["close", "setTarget", "getScreenshotViewport", "capabilities"] as const;

		// then
		expect(CODE_MODE_METHOD_NAMES).toStrictEqual(CURATED_METHOD_NAMES);
		for (const methodName of forbiddenMethods) {
			expect(CODE_MODE_METHOD_NAMES).not.toContain(methodName);
		}
	});
});

describe("#given CodeModeApi DTS #when injected into the sandbox prompt #then it exposes mac and surface without Buffer", () => {
	it("contains the sandbox globals and omits raw byte types", () => {
		// then
		expect(CODE_MODE_API_DTS).toContain("declare const mac");
		expect(CODE_MODE_API_DTS).toContain("declare function surface");
		for (const forbiddenToken of ["Buffer", "network", "fs", "process"] as const) {
			expect(CODE_MODE_API_DTS).not.toContain(forbiddenToken);
		}
	});
});

describe("#given screenshot-store exists #when declaring CodeModeApi handles #then the surface imports its handle type", () => {
	it("uses the shared ScreenshotHandle type instead of redefining it locally", () => {
		// then
		expect(API_SURFACE_SOURCE).toContain('import type { ScreenshotHandle } from "./screenshot-store.js";');
		expect(API_SURFACE_SOURCE).not.toContain("export type ScreenshotHandle =");
	});
});
