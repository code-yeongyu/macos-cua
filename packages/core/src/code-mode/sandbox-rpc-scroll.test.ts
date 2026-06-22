import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeComputer, clearSandboxMocks, importSandbox, resetSandboxModules } from "./sandbox-test-helpers.js";
import { ScreenshotStore } from "./screenshot-store.js";

beforeEach(() => {
	resetSandboxModules();
});

afterEach(() => {
	clearSandboxMocks();
});

describe("#given code-mode scroll without an element index #when scrolling vertically #then page keys are used", () => {
	it("#given no element index #when scrolling down two pages #then page_down is pressed twice without wheel input", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const computer = new FakeComputer();
		const sandbox = new CodeModeSandbox(computer, new ScreenshotStore());

		await sandbox.run('await mac.scroll("Finder", { direction: "down", amount: 2 })');

		expect(computer.keyCalls).toEqual([
			{ key: "page_down", options: undefined },
			{ key: "page_down", options: undefined },
		]);
		expect(computer.scrollCalls).toEqual([]);
	});
});
