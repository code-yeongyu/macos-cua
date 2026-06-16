import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CodeModeError } from "./errors.js";
import {
	FakeComputer,
	clearSandboxMocks,
	fakeIvm,
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

describe("#given sandboxed code with an unknown API call #when it runs #then the host rejects the method", () => {
	it("#given an unknown mac method #when run invokes it #then CodeModeError details are surfaced", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const sandbox = new CodeModeSandbox(new FakeComputer(), new ScreenshotStore());

		await expect(sandbox.run("await mac.launchMissiles()")).rejects.toThrow(
			expect.objectContaining({ name: "CodeModeError", code: "COMPILE_ERROR" }),
		);
	});
});

describe("#given invalid host arguments #when sandboxed code catches the error #then details are serialized", () => {
	it("#given an invalid pointer target #when code catches it #then CodeModeError fields are visible", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const sandbox = new CodeModeSandbox(new FakeComputer(), new ScreenshotStore());

		const result = await sandbox.run(`
			try {
				await mac.click(123, { x: 1 });
			} catch (error) {
				return { name: error.name, message: error.message, code: error.code };
			}
		`);

		expect(result.result).toEqual({
			name: "CodeModeError",
			message: "pointer target must include both x and y",
			code: "COMPILE_ERROR",
		});
	});
});

describe("#given a host method throws #when sandboxed code catches it #then name message and code are serialized", () => {
	it("#given screenshot throws CodeModeError #when code catches it #then serialized error fields are visible", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const computer = new FakeComputer();
		computer.failScreenshotWith = new CodeModeError("HANDLE_STALE", "gone");
		const sandbox = new CodeModeSandbox(computer, new ScreenshotStore());

		const result = await sandbox.run(`
			try {
				await mac.screenshot();
			} catch (error) {
				return { name: error.name, message: error.message, code: error.code };
			}
		`);

		expect(result.result).toEqual({ name: "CodeModeError", message: "gone", code: "HANDLE_STALE" });
	});
});

describe("#given a running sandbox #when another run starts #then the second run fails busy", () => {
	it("#given one run is active #when a second run starts #then COMPUTER_BUSY is thrown", async () => {
		const { CodeModeSandbox } = await importSandbox();
		fakeIvm.blockNextRun();
		const sandbox = new CodeModeSandbox(new FakeComputer(), new ScreenshotStore());

		const firstRun = sandbox.run("return 1");
		await vi.waitFor(() => expect(fakeIvm.runCount).toBe(1));
		await expect(sandbox.run("return 2")).rejects.toThrow(expect.objectContaining({ code: "COMPUTER_BUSY" }));
		fakeIvm.resolveBlocker?.();
		await expect(firstRun).resolves.toMatchObject({ result: 1 });
	});
});

describe("#given sandboxed code exceeds wall clock #when timeout elapses #then isolate is disposed", () => {
	it("#given a hung script #when timeoutMs elapses #then RUN_TIMEOUT is thrown and isolate is disposed", async () => {
		const { CodeModeSandbox } = await importSandbox();
		fakeIvm.neverResolve = true;
		const sandbox = new CodeModeSandbox(new FakeComputer(), new ScreenshotStore(), { timeoutMs: 5 });

		await expect(sandbox.run("return 1")).rejects.toThrow(expect.objectContaining({ code: "RUN_TIMEOUT" }));
		expect(fakeIvm.disposedCount).toBe(1);
	});
});
