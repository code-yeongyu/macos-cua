import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaptureFrame } from "../computer/capture-frame.js";
import { FakeComputer, clearSandboxMocks, importSandbox, resetSandboxModules } from "./sandbox-test-helpers.js";
import { ScreenshotStore } from "./screenshot-store.js";

beforeEach(() => {
	resetSandboxModules();
});

afterEach(() => {
	clearSandboxMocks();
});

describe("#given code-mode stale coordinates #when the sandbox catches the host error #then surface vocabulary is stable", () => {
	it("#given a stale capture id #when code catches the error #then code hint and stack-safe fields are exposed", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const computer = new FakeComputer();
		computer.screenshotViewport = createCaptureFrame({
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
		const sandbox = new CodeModeSandbox(computer, new ScreenshotStore());

		const result = await sandbox.run(`
			try {
				await mac.click("Finder", { x: 250, y: 200, captureId: "capture-2", displayEpoch: "display-1" });
			} catch (error) {
				return {
					name: error.name,
					code: error.code,
					recoveryHint: error.recoveryHint,
					stack: error.stack,
				};
			}
		`);

		expect(result.result).toEqual({
			name: "ComputerUseError",
			code: "STALE_CAPTURE",
			recoveryHint: "Call get_app_state or capture a fresh screenshot before retrying within the latest frame.",
			stack: undefined,
		});
	});
});
