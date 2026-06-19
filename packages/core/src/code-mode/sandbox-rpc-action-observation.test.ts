import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeComputer, clearSandboxMocks, importSandbox, resetSandboxModules } from "./sandbox-test-helpers.js";
import { ScreenshotStore } from "./screenshot-store.js";

beforeEach(() => {
	resetSandboxModules();
});

afterEach(() => {
	clearSandboxMocks();
});

describe("#given code-mode action results #when scrolling #then post action observation avoids full app state", () => {
	it("#given a scroll action #when it completes #then only a lightweight screenshot is captured", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const computer = new FakeComputer();
		const sandbox = new CodeModeSandbox(computer, new ScreenshotStore());

		await sandbox.run('await mac.scroll("Finder", { direction: "down", amount: 1 })');

		expect(computer.appStateCalls).toEqual([]);
	});
});

describe("#given repeated code-mode app name targets #when actions resolve the app #then the pid lookup is cached", () => {
	it("#given two actions against Finder #when they run #then running apps are listed once", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const computer = new FakeComputer();
		const sandbox = new CodeModeSandbox(computer, new ScreenshotStore());

		await sandbox.run(`
			await mac.scroll("Finder", { direction: "down", amount: 1 });
			await mac.pressKeys("Finder", ["page_down"]);
		`);

		expect(computer.listAppsCallCount).toBe(1);
	});
});
