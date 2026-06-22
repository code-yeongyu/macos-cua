import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeComputer, clearSandboxMocks, importSandbox, resetSandboxModules } from "./sandbox-test-helpers.js";
import { ScreenshotStore } from "./screenshot-store.js";

class TypeTrackingComputer extends FakeComputer {
	readonly setTargetCalls: Array<number | undefined> = [];
	readonly typeCalls: string[] = [];
	readonly typeIntoFocusedCalls: { readonly targetPid: number; readonly text: string }[] = [];
	typeIntoFocusedResult = true;

	setTarget(pid?: number): void {
		this.setTargetCalls.push(pid);
	}

	async type(text: string): Promise<void> {
		this.typeCalls.push(text);
	}

	async typeIntoFocused(targetPid: number, text: string): Promise<boolean> {
		this.typeIntoFocusedCalls.push({ targetPid, text });
		return this.typeIntoFocusedResult;
	}
}

beforeEach(() => {
	resetSandboxModules();
});

afterEach(() => {
	clearSandboxMocks();
});

describe("#given code-mode type action #when focused element accepts text #then synthetic typing is skipped", () => {
	it("#given Finder focus accepts text #when mac.type runs #then it uses typeIntoFocused before computer.type", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const computer = new TypeTrackingComputer();
		const sandbox = new CodeModeSandbox(computer, new ScreenshotStore());

		await sandbox.run('await mac.type("Finder", "hello")');

		expect(computer.typeIntoFocusedCalls).toEqual([{ targetPid: 321, text: "hello" }]);
		expect(computer.typeCalls).toEqual([]);
		expect(computer.setTargetCalls).toEqual([]);
	});

	it("#given Finder focus rejects text #when mac.type runs #then it falls back to targeted computer.type", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const computer = new TypeTrackingComputer();
		computer.typeIntoFocusedResult = false;
		const sandbox = new CodeModeSandbox(computer, new ScreenshotStore());

		await sandbox.run('await mac.type("Finder", "fallback")');

		expect(computer.typeIntoFocusedCalls).toEqual([{ targetPid: 321, text: "fallback" }]);
		expect(computer.setTargetCalls).toEqual([321, undefined]);
		expect(computer.typeCalls).toEqual(["fallback"]);
	});
});
