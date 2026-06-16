import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import type { AppInfo, AppState } from "../src/accessibility/types.js";
import { CodeModeError } from "../src/code-mode/errors.js";
import { CodeModeSandbox } from "../src/code-mode/sandbox.js";
import { ScreenshotStore } from "../src/code-mode/screenshot-store.js";
import type { ComputerInterface, ScreenshotResult } from "../src/computer/interface.js";
import type {
	AppStateOptions,
	ComputerCapabilities,
	DragOptions,
	KeyOptions,
	Point,
	ScreenshotOptions,
	ScrollOptions,
	SelectTextOptions,
} from "../src/types/index.js";

class MockComputer implements ComputerInterface {
	readonly capabilities: ComputerCapabilities = {
		supportsAccessibility: true,
		supportsClipboard: true,
		supportsInput: true,
		supportsScreenshot: true,
	};

	readonly apps: AppInfo[] = [{ name: "Finder", bundleId: "com.apple.finder", pid: 321, isRunning: true }];
	failScreenshotWith: Error | undefined;

	async screenshot(_options?: ScreenshotOptions): Promise<ScreenshotResult> {
		if (this.failScreenshotWith !== undefined) {
			throw this.failScreenshotWith;
		}
		return { data: Buffer.from("real-isolate-screen"), mimeType: "image/png", width: 20, height: 10 };
	}

	setTarget(_pid?: number): void {}
	async move(_position: Point): Promise<void> {}
	async click(_position: Point): Promise<void> {}
	async rightClick(_position: Point): Promise<void> {}
	async middleClick(_position: Point): Promise<void> {}
	async doubleClick(_position: Point): Promise<void> {}
	async type(_text: string): Promise<void> {}
	async key(_key: string, _options?: KeyOptions): Promise<void> {}
	async scroll(_options: ScrollOptions): Promise<void> {}
	async drag(_options: DragOptions): Promise<void> {}
	async getCursorPosition(): Promise<Point> {
		return { x: 1, y: 2 };
	}
	async getScreenSize(): Promise<{ readonly width: number; readonly height: number }> {
		return { width: 100, height: 80 };
	}
	async getAppState(targetPid?: number, _options?: AppStateOptions): Promise<AppState> {
		return {
			app: "Finder",
			bundleId: "com.apple.finder",
			pid: targetPid ?? 321,
			frontmost: true,
			axAvailable: true,
			elements: [],
			screenshotBase64: Buffer.from("state-screen").toString("base64"),
			screenshotWidth: 30,
			screenshotHeight: 15,
			display: { width: 100, height: 80, scaleFactor: 2 },
		};
	}
	async getScreenshotViewport(_targetPid: number): Promise<undefined> {
		return undefined;
	}
	async listApps(): Promise<AppInfo[]> {
		return this.apps;
	}
	async setValue(_targetPid: number, _elementIndex: number, _value: string): Promise<void> {}
	async selectText(_targetPid: number, _elementIndex: number, _options: SelectTextOptions): Promise<void> {}
	async performAction(_targetPid: number, _elementIndex: number, _action: string): Promise<void> {}
	async pressAtPosition(_targetPid: number, _position: Point): Promise<boolean> {
		return true;
	}
	async typeIntoFocused(_targetPid: number, _text: string): Promise<boolean> {
		return true;
	}
	async close(): Promise<void> {}
}

describe("#given the real isolated-vm runtime #when sandboxed code calls host APIs #then RPC results cross the isolate", () => {
	it("#given a mocked computer #when code lists apps logs and surfaces a screenshot #then observable results are returned", async () => {
		const computer = new MockComputer();
		const store = new ScreenshotStore();
		const sandbox = new CodeModeSandbox(computer, store, { memoryMb: 64, timeoutMs: 10_000 });

		const result = await sandbox.run(`
			const apps = await mac.listApps();
			console.log("apps", apps.length, apps[0].bundleId);
			const shot = await mac.screenshot();
			surface(shot);
			return { apps, shot };
		`);

		expect(result.logs).toEqual(["apps 1 com.apple.finder"]);
		expect(result.result).toEqual({
			apps: [{ name: "Finder", bundleId: "com.apple.finder", pid: 321, isRunning: true }],
			shot: { id: "shot_1", width: 20, height: 10, mimeType: "image/png" },
		});
		expect(result.surfaced).toEqual(["shot_1"]);
		expect(store.get("shot_1").data.toString()).toBe("real-isolate-screen");
	});
});

describe("#given a host method throws #when sandboxed code catches it #then the real isolate exposes the serialized error", () => {
	it("#given screenshot fails #when code catches the error #then name message and code are catchable", async () => {
		const computer = new MockComputer();
		computer.failScreenshotWith = new CodeModeError("HANDLE_STALE", "gone");
		const sandbox = new CodeModeSandbox(computer, new ScreenshotStore(), { memoryMb: 64, timeoutMs: 10_000 });

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
