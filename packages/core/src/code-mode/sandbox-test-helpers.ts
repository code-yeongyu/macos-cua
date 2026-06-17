import { Buffer } from "node:buffer";
import { createContext, runInContext } from "node:vm";
import { vi } from "vitest";

import type { AppInfo, AppState } from "../accessibility/types.js";
import type { ComputerInterface, ScreenshotResult } from "../computer/interface.js";
import type { ScreenshotViewport } from "../computer/viewport.js";
import type {
	AppStateOptions,
	ComputerCapabilities,
	DragOptions,
	KeyOptions,
	Point,
	ScreenshotOptions,
	ScrollOptions,
	SelectTextOptions,
} from "../types/index.js";
import type { HostFunction } from "./sandbox-types.js";

type SandboxModule = typeof import("./sandbox.js");

type FakeRunOptions = {
	readonly promise?: boolean;
	readonly timeout?: number;
};

type FakeContext = {
	readonly values: Record<string, unknown>;
	readonly global: {
		set(name: string, value: unknown): Promise<void>;
	};
};

class FakeIvmState {
	disposedCount = 0;
	memoryLimits: number[] = [];
	runCount = 0;
	neverResolve = false;
	blocker: Promise<void> | undefined;
	resolveBlocker: (() => void) | undefined;

	reset(): void {
		this.disposedCount = 0;
		this.memoryLimits = [];
		this.runCount = 0;
		this.neverResolve = false;
		this.blocker = undefined;
		this.resolveBlocker = undefined;
	}

	blockNextRun(): void {
		let resolveBlocker: (() => void) | undefined;
		this.blocker = new Promise<void>((resolve) => {
			resolveBlocker = resolve;
		});
		if (resolveBlocker === undefined) {
			throw new Error("failed to create blocker");
		}
		this.resolveBlocker = resolveBlocker;
	}
}

export const fakeIvm = new FakeIvmState();

export class FakeReference {
	constructor(private readonly value: HostFunction) {}

	applySyncPromise(_receiver?: unknown, args: readonly unknown[] = []): unknown {
		return this.value(...args);
	}
}

export class FakeIsolate {
	constructor(options: { readonly memoryLimit?: number } = {}) {
		if (options.memoryLimit !== undefined) {
			fakeIvm.memoryLimits.push(options.memoryLimit);
		}
	}

	async createContext(): Promise<FakeContext> {
		const values: Record<string, unknown> = {};
		return {
			values,
			global: {
				async set(name: string, value: unknown): Promise<void> {
					values[name] = value;
				},
			},
		};
	}

	async compileScript(
		code: string,
	): Promise<{ run(context: FakeContext, options?: FakeRunOptions): Promise<unknown> }> {
		return {
			async run(context: FakeContext, options?: FakeRunOptions): Promise<unknown> {
				fakeIvm.runCount += 1;
				if (fakeIvm.neverResolve) {
					return await new Promise<unknown>(() => {});
				}
				if (fakeIvm.blocker !== undefined) {
					await fakeIvm.blocker;
				}
				const result = runInContext(code, createContext(context.values), { timeout: options?.timeout });
				if (options?.promise === true && result instanceof Promise) {
					return await result;
				}
				return result;
			},
		};
	}

	dispose(): void {
		fakeIvm.disposedCount += 1;
	}
}

export class FakeComputer implements ComputerInterface {
	readonly capabilities: ComputerCapabilities = {
		supportsAccessibility: true,
		supportsClipboard: true,
		supportsInput: true,
		supportsScreenshot: true,
	};

	readonly screenshotCalls: ScreenshotOptions[] = [];
	readonly appStateCalls: { readonly targetPid: number | undefined; readonly options: AppStateOptions | undefined }[] =
		[];
	readonly clickCalls: Point[] = [];
	readonly moveCalls: Point[] = [];
	readonly rightClickCalls: Point[] = [];
	readonly dragCalls: DragOptions[] = [];
	screenshotViewport: ScreenshotViewport | undefined;
	appState: AppState | undefined;
	failScreenshotWith: Error | undefined;

	async screenshot(options?: ScreenshotOptions): Promise<ScreenshotResult> {
		if (this.failScreenshotWith !== undefined) {
			throw this.failScreenshotWith;
		}
		if (options !== undefined) {
			this.screenshotCalls.push(options);
		}
		return { data: Buffer.from("screen"), mimeType: "image/png", width: 20, height: 10 };
	}

	setTarget(_pid?: number): void {}
	async move(position: Point): Promise<void> {
		this.moveCalls.push(position);
	}
	async click(position: Point): Promise<void> {
		this.clickCalls.push(position);
	}
	async rightClick(position: Point): Promise<void> {
		this.rightClickCalls.push(position);
	}
	async middleClick(_position: Point): Promise<void> {}
	async doubleClick(_position: Point): Promise<void> {}
	async type(_text: string): Promise<void> {}
	async key(_key: string, _options?: KeyOptions): Promise<void> {}
	async scroll(_options: ScrollOptions): Promise<void> {}
	async drag(options: DragOptions): Promise<void> {
		this.dragCalls.push(options);
	}
	async getCursorPosition(): Promise<Point> {
		return { x: 1, y: 2 };
	}
	async getScreenSize(): Promise<{ width: number; height: number }> {
		return { width: 100, height: 80 };
	}
	async getAppState(targetPid?: number, options?: AppStateOptions): Promise<AppState> {
		this.appStateCalls.push({ targetPid, options });
		return this.appState ?? appStateWith({ pid: targetPid ?? 321 });
	}
	async getScreenshotViewport(_targetPid: number): Promise<ScreenshotViewport | undefined> {
		return this.screenshotViewport;
	}
	async listApps(): Promise<AppInfo[]> {
		return [{ name: "Finder", bundleId: "com.apple.finder", pid: 321, isRunning: true }];
	}
	async setValue(_targetPid: number, _elementIndex: number, _value: string): Promise<void> {}
	async selectText(_targetPid: number, _elementIndex: number, _options: SelectTextOptions): Promise<void> {}
	async performAction(_targetPid: number, _elementIndex: number, _action: string): Promise<void> {}
	async pressAtPosition(): Promise<boolean> {
		return true;
	}
	async typeIntoFocused(): Promise<boolean> {
		return true;
	}
	async close(): Promise<void> {}
}

export function appStateWith(overrides: Partial<AppState> = {}): AppState {
	return {
		app: "Finder",
		bundleId: "com.apple.finder",
		pid: 321,
		frontmost: true,
		axAvailable: true,
		elements: [],
		screenshotBase64: Buffer.from("app-state-screen").toString("base64"),
		screenshotWidth: 30,
		screenshotHeight: 15,
		display: { width: 100, height: 80, scaleFactor: 2 },
		...overrides,
	};
}

export async function importSandbox(): Promise<SandboxModule> {
	vi.doMock("isolated-vm", () => ({ Isolate: FakeIsolate, Reference: FakeReference }));
	return await import("./sandbox.js");
}

export function resetSandboxModules(): void {
	fakeIvm.reset();
	vi.resetModules();
}

export function clearSandboxMocks(): void {
	vi.doUnmock("isolated-vm");
}
