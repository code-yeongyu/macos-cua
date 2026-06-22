import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	FakeComputer,
	FakeIsolate,
	clearSandboxMocks,
	fakeIvm,
	importSandbox,
	resetSandboxModules,
} from "./sandbox-test-helpers.js";
import type { HostFunction } from "./sandbox-types.js";
import { ScreenshotStore } from "./screenshot-store.js";

beforeEach(() => {
	resetSandboxModules();
});

afterEach(() => {
	clearSandboxMocks();
});

describe("#given sandboxed code #when it calls host RPC methods #then screenshots are stored and surfaced", () => {
	it("#given sandboxed code #when it calls screenshot and getAppState #then handles and logs are returned", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const computer = new FakeComputer();
		const store = new ScreenshotStore();
		const sandbox = new CodeModeSandbox(computer, store, { memoryMb: 64 });

		const result = await sandbox.run(`
			console.log("hello", { step: 1 });
			const shot = await mac.screenshot({ format: "png" });
			const state = await mac.getAppState(123, { settleMs: 0 });
			surface(shot);
			surface(state.screenshot);
			return { shot, state };
		`);

		expect(fakeIvm.memoryLimits).toEqual([64]);
		expect(result.logs).toEqual(['hello {"step":1}']);
		expect(result.result).toMatchObject({
			shot: { id: "shot_1", width: 20, height: 10 },
			state: { screenshot: { id: "shot_2", width: 30, height: 15 } },
		});
		expect(result.surfaced).toEqual(["shot_1", "shot_2"]);
		expect(result.actions).toEqual(["mac.screenshot()", "mac.getAppState(123)"]);
		expect(store.get("shot_1").data.toString()).toBe("screen");
		expect(store.get("shot_2").data.toString()).toBe("app-state-screen");
		expect(computer.appStateCalls).toEqual([{ targetPid: 123, options: { settleMs: 0 } }]);
	});
});

describe("#given isolated-vm applySyncPromise semantics #when sandbox globals invoke host refs #then unsupported result options are not passed", () => {
	it("#given a strict Reference fake #when code logs calls mac and surfaces #then calls resolve without result options", async () => {
		vi.doMock("isolated-vm", () => ({ Isolate: FakeIsolate, Reference: StrictApplySyncPromiseReference }));
		const { CodeModeSandbox } = await import("./sandbox.js");
		const sandbox = new CodeModeSandbox(new FakeComputer(), new ScreenshotStore());

		await expect(
			sandbox.run(`
				console.log("strict");
				const shot = await mac.screenshot();
				surface(shot);
				return shot.id;
			`),
		).resolves.toMatchObject({ logs: ["strict"], result: "shot_1", surfaced: ["shot_1"] });
	});
});

describe("#given sandbox options #when memory limit is omitted #then the default isolate limit is used", () => {
	it("#given default sandbox options #when code runs #then isolated-vm receives 128 MB", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const sandbox = new CodeModeSandbox(new FakeComputer(), new ScreenshotStore());

		await expect(sandbox.run("return 1")).resolves.toMatchObject({ result: 1 });

		expect(fakeIvm.memoryLimits).toEqual([128]);
	});
});

class StrictApplySyncPromiseReference {
	constructor(private readonly value: HostFunction) {}

	applySyncPromise(_receiver?: unknown, args: readonly unknown[] = [], options?: unknown): unknown {
		if (typeof options === "object" && options !== null && "result" in options) {
			throw new TypeError("`result` options are not available for `applySyncPromise`");
		}
		return this.value(...args);
	}
}
