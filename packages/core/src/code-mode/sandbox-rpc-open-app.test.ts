import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeComputer, clearSandboxMocks, importSandbox, resetSandboxModules } from "./sandbox-test-helpers.js";
import { ScreenshotStore } from "./screenshot-store.js";

beforeEach(() => {
	resetSandboxModules();
});

afterEach(() => {
	clearSandboxMocks();
});

describe("#given code-mode app launch #when openApp is called #then the host opens the app", () => {
	it("#given a Safari URL #when code opens the app #then openApp forwards the URL and returns app info", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const computer = new FakeComputer();
		const sandbox = new CodeModeSandbox(computer, new ScreenshotStore());

		const result = await sandbox.run(`
			const app = await mac.openApp("Safari", { url: "https://search.brave.com/search?q=fable%205" });
			return { app, calls: await mac.listApps() };
		`);

		expect(computer.openAppCalls).toEqual([
			{ appName: "Safari", options: { url: "https://search.brave.com/search?q=fable%205" } },
		]);
		expect(result.result).toEqual({
			app: { name: "Safari", bundleId: "com.apple.Safari", pid: 777, isRunning: true, isFrontmost: true },
			calls: [{ name: "Safari", bundleId: "com.apple.Safari", pid: 777, isRunning: true, isFrontmost: true }],
		});
	});
});
