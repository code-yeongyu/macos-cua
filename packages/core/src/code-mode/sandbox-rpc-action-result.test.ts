import { Buffer } from "node:buffer";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaptureFrame } from "../computer/capture-frame.js";
import {
	FakeComputer,
	appStateWith,
	clearSandboxMocks,
	importSandbox,
	resetSandboxModules,
} from "./sandbox-test-helpers.js";
import { ScreenshotStore } from "./screenshot-store.js";

beforeEach(() => {
	resetSandboxModules();
});

afterEach(() => {
	clearSandboxMocks();
});

describe("#given code-mode app state #when capture metadata is returned #then screenshot bytes stay behind handles", () => {
	it("#given app state has a capture frame #when code reads it #then capture metadata includes a screenshot handle without base64 JSON", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const computer = new FakeComputer();
		const captureFrame = createCaptureFrame({
			captureId: "capture-1",
			capturedAt: "2026-06-18T00:00:00.000Z",
			displayEpoch: "display-1",
			target: { pid: 321, bundleId: "com.apple.finder", appName: "Finder" },
			windowBounds: { x: 300, y: 150, width: 1000, height: 800 },
			screenshot: { width: 500, height: 400 },
			model: { width: 500, height: 400 },
			display: {
				logical: { x: 0, y: 0, width: 1728, height: 1117 },
				native: { width: 3456, height: 2234 },
				scaleFactor: 2,
			},
		});
		computer.appState = appStateWith({ captureFrame });
		const sandbox = new CodeModeSandbox(computer, new ScreenshotStore());

		const result = await sandbox.run(`
			const state = await mac.getAppState("Finder");
			return {
				captureId: state.captureFrame.captureId,
				displayEpoch: state.captureFrame.displayEpoch,
				screenshot: state.captureFrame.screenshot,
				topLevelScreenshot: state.screenshot,
				hasScreenshotBase64: Object.prototype.hasOwnProperty.call(state, "screenshotBase64"),
				json: JSON.stringify(state),
			};
		`);

		expect(result.result).toEqual({
			captureId: "capture-1",
			displayEpoch: "display-1",
			screenshot: { id: "shot_1", width: 30, height: 15, mimeType: "image/png" },
			topLevelScreenshot: { id: "shot_1", width: 30, height: 15, mimeType: "image/png" },
			hasScreenshotBase64: false,
			json: expect.not.stringContaining(Buffer.from("app-state-screen").toString("base64")),
		});
	});
});

describe("#given code-mode action methods #when an element click mutates the app #then an action result carries a post-action screenshot handle", () => {
	it("#given an element index #when code clicks it #then result is lightweight and handle-based", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const computer = new FakeComputer();
		const sandbox = new CodeModeSandbox(computer, new ScreenshotStore());

		const result = await sandbox.run(`
			const action = await mac.click("Finder", { elementIndex: 7 });
			return {
				actionId: action.actionId,
				method: action.method,
				postAction: action.postAction,
				json: JSON.stringify(action),
			};
		`);

		expect(result.result).toEqual({
			actionId: "code-mode-click:321",
			method: "axPress",
			postAction: {
				elementCount: 0,
				screenshot: { id: "shot_1", width: 30, height: 15, mimeType: "image/png" },
			},
			json: expect.not.stringContaining(Buffer.from("app-state-screen").toString("base64")),
		});
	});
});
