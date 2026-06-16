import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureNodeSnapshotFlag, isNodeSnapshotFlagPresent } from "./reexec.js";

vi.mock("node:child_process", () => ({
	spawnSync: vi.fn(),
}));

class ProcessExit extends Error {
	readonly code: number | string | null | undefined;

	constructor(code: number | string | null | undefined) {
		super("process.exit called");
		this.code = code;
	}
}

const originalArgv = [...process.argv];
const originalExecArgv = [...process.execArgv];
const originalSentinel = process.env.MACOS_CUA_NODE_SNAPSHOT_REEXEC;
const sentinelEnvKey = "MACOS_CUA_NODE_SNAPSHOT_REEXEC";

function setProcessArgs(execArgv: readonly string[], argv: readonly string[]): void {
	Object.defineProperty(process, "execArgv", {
		configurable: true,
		value: [...execArgv],
	});
	Object.defineProperty(process, "argv", {
		configurable: true,
		value: [...argv],
	});
}

function restoreSentinel(): void {
	if (originalSentinel === undefined) {
		Reflect.deleteProperty(process.env, sentinelEnvKey);
		return;
	}
	process.env.MACOS_CUA_NODE_SNAPSHOT_REEXEC = originalSentinel;
}

function mockedSpawnSync(): ReturnType<typeof vi.mocked<typeof spawnSync>> {
	return vi.mocked(spawnSync);
}

describe("#given node already has --no-node-snapshot #when ensuring the flag #then no child process is spawned", () => {
	beforeEach(() => {
		mockedSpawnSync().mockReset();
		setProcessArgs(["--no-node-snapshot"], ["/node", "/app.js"]);
		Reflect.deleteProperty(process.env, sentinelEnvKey);
	});

	afterEach(() => {
		setProcessArgs(originalExecArgv, originalArgv);
		restoreSentinel();
	});

	it("returns true and reports the flag as present", () => {
		expect(isNodeSnapshotFlagPresent()).toBe(true);
		expect(ensureNodeSnapshotFlag()).toBe(true);
		expect(mockedSpawnSync()).not.toHaveBeenCalled();
	});
});

describe("#given node is missing --no-node-snapshot without the reexec sentinel #when ensuring the flag #then it re-execs with inherited stdio", () => {
	const exitSpy = vi.spyOn(process, "exit");

	beforeEach(() => {
		mockedSpawnSync().mockReset();
		mockedSpawnSync().mockReturnValue({
			error: undefined,
			output: [],
			pid: 123,
			signal: null,
			status: 7,
			stderr: "",
			stdout: "",
		});
		exitSpy.mockImplementation((code?: number | string | null | undefined): never => {
			throw new ProcessExit(code);
		});
		setProcessArgs([], ["/node", "/workspace/cli.js", "run", "--verbose"]);
		Reflect.deleteProperty(process.env, sentinelEnvKey);
	});

	afterEach(() => {
		exitSpy.mockRestore();
		setProcessArgs(originalExecArgv, originalArgv);
		restoreSentinel();
	});

	it("spawns the current script with a sentinel environment value and exits with the child status", () => {
		expect(isNodeSnapshotFlagPresent()).toBe(false);
		expect(() => ensureNodeSnapshotFlag()).toThrow(expect.objectContaining({ code: 7 }));
		expect(mockedSpawnSync()).toHaveBeenCalledWith(
			process.execPath,
			["--no-node-snapshot", "/workspace/cli.js", "run", "--verbose"],
			{
				env: {
					...process.env,
					MACOS_CUA_NODE_SNAPSHOT_REEXEC: "1",
				},
				stdio: "inherit",
			},
		);
		expect(exitSpy).toHaveBeenCalledWith(7);
	});
});

describe("#given node is missing --no-node-snapshot with the reexec sentinel #when ensuring the flag #then it does not loop", () => {
	beforeEach(() => {
		mockedSpawnSync().mockReset();
		setProcessArgs([], ["/node", "/app.js"]);
		process.env.MACOS_CUA_NODE_SNAPSHOT_REEXEC = "1";
	});

	afterEach(() => {
		setProcessArgs(originalExecArgv, originalArgv);
		restoreSentinel();
	});

	it("returns false without spawning", () => {
		expect(isNodeSnapshotFlagPresent()).toBe(false);
		expect(ensureNodeSnapshotFlag()).toBe(false);
		expect(mockedSpawnSync()).not.toHaveBeenCalled();
	});
});
