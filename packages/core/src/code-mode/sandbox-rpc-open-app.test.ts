import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ComputerUseError } from "../computer/errors.js";
import type { AppStateOptions } from "../types/index.js";
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

	it("#given a browser window appears late #when getAppState first misses it #then code mode refreshes after settling", async () => {
		const { CodeModeSandbox } = await importSandbox();
		const computer = new LateWindowComputer();
		const sandbox = new CodeModeSandbox(computer, new ScreenshotStore());

		const result = await sandbox.run(`
			await mac.openApp("Safari", { url: "https://search.brave.com/search?q=fable%205" });
			const state = await mac.getAppState("Safari");
			return { app: state.app, pid: state.pid };
		`);

		expect(result.result).toEqual({ app: "Safari", pid: 777 });
		expect(computer.appStateCalls).toEqual([
			{ targetPid: 777, options: undefined },
			{ targetPid: 777, options: { refresh: true, settleMs: 750 } },
		]);
	});
});

class LateWindowComputer extends FakeComputer {
	private missedWindow = false;

	override async getAppState(targetPid?: number, options?: AppStateOptions) {
		this.appStateCalls.push({ targetPid, options });
		if (!this.missedWindow) {
			this.missedWindow = true;
			throw new ComputerUseError("MISSING_TARGET_WINDOW", "No visible target window found for 'Safari'");
		}
		return appStateWith({
			app: "Safari",
			bundleId: "com.apple.Safari",
			pid: targetPid ?? 777,
		});
	}
}
