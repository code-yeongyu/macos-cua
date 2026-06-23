import type { AXTreeElement, DisplayInfo } from "../accessibility/types.js";
import { ComputerUseError } from "../computer/errors.js";
import type { ScreenshotResult } from "../computer/interface.js";
import type { Point, Rect, Size } from "../types/index.js";
import type { RunningAppInfo } from "./app-list.js";
import type { MacOSDesktopSessionBackend } from "./macos-desktop-session-types.js";

export const TARGET_PID = 1234;
export const OTHER_PID = 5678;
export const APP: RunningAppInfo = {
	bundleId: "com.apple.finder",
	isActive: true,
	isRunning: true,
	name: "Finder",
	path: "/System/Library/CoreServices/Finder.app",
	pid: TARGET_PID,
};
export const OTHER_APP: RunningAppInfo = { ...APP, bundleId: "com.example.other", name: "Other", pid: OTHER_PID };
export const WINDOW: SessionWindow = { bounds: { x: 10, y: 20, width: 400, height: 200 }, id: 99 };
export const DISPLAY: DisplayInfo = { width: 1440, height: 900, scaleFactor: 2 };
export const ELEMENT: AXTreeElement = {
	actions: ["AXPress"],
	children: [],
	frame: { x: 30, y: 40, width: 100, height: 50 },
	id: 7,
	label: "Open",
	role: "AXButton",
	value: null,
};
export const CURSOR: Point = { x: 51, y: 62 };
export const SECRET_AX_VALUE = "typed-secret".repeat(80);

type SessionWindow = {
	readonly id?: number;
	readonly bounds: Rect;
};

export class FakeSessionBackend implements MacOSDesktopSessionBackend {
	apps: readonly RunningAppInfo[] = [APP, OTHER_APP];
	window: SessionWindow | undefined = WINDOW;
	display: DisplayInfo = DISPLAY;
	cursor: Point | undefined = CURSOR;
	elements: readonly AXTreeElement[] = [ELEMENT];
	resolveAppByName?: (appName: string) => Promise<RunningAppInfo>;
	approved = true;
	urlAllowed = true;
	readonly calls: string[] = [];
	private releaseQueue: Array<() => void> = [];
	private readonly startWaiters = new Map<string, () => void>();

	async listApps(): Promise<readonly RunningAppInfo[]> {
		this.calls.push("listApps");
		return this.apps;
	}

	assertAppApproved(app: RunningAppInfo): void {
		this.calls.push(`approve:${app.pid}`);
		if (!this.approved) {
			throw new ComputerUseError("UNAPPROVED_APP", `Computer Use needs your approval to use '${app.name}'.`);
		}
	}

	async assertBrowserUrlAllowed(app: RunningAppInfo): Promise<void> {
		this.calls.push(`url:${app.pid}`);
		if (!this.urlAllowed) {
			throw new ComputerUseError("BLOCKED_URL", "Computer Use is not allowed on the current browser URL.");
		}
	}

	async resolveTargetWindow(pid: number): Promise<SessionWindow | undefined> {
		this.calls.push(`window:${pid}`);
		return this.window;
	}

	async captureWindowScreenshot(_window: SessionWindow, size: Size): Promise<ScreenshotResult> {
		this.calls.push(`capture:${size.width}x${size.height}`);
		return { data: Buffer.from("screen"), height: size.height, mimeType: "image/jpeg", width: size.width };
	}

	extractAccessibilityTree(pid: number): {
		readonly axAvailable: boolean;
		readonly elements: readonly AXTreeElement[];
	} {
		this.calls.push(`ax:${pid}`);
		return { axAvailable: true, elements: this.elements };
	}

	resolveDisplayInfo(): DisplayInfo {
		this.calls.push("display");
		return this.display;
	}

	resolveAppInstructions(): string | undefined {
		return undefined;
	}

	async resolveCursorPosition(): Promise<Point | undefined> {
		this.calls.push("cursor");
		return this.cursor;
	}

	highlightWindow(bounds: Rect): void {
		this.calls.push(`highlight:${bounds.width}x${bounds.height}`);
	}

	async sleep(ms: number): Promise<void> {
		this.calls.push(`sleep:${ms}`);
	}

	async waitForQueueRelease(label: string): Promise<void> {
		this.calls.push(`start:${label}`);
		this.startWaiters.get(label)?.();
		await new Promise<void>((resolve) => {
			this.releaseQueue.push(resolve);
		});
		this.calls.push(`end:${label}`);
	}

	releaseNext(): void {
		const release = this.releaseQueue.shift();
		release?.();
	}

	async waitStarted(label: string): Promise<void> {
		if (this.calls.includes(`start:${label}`)) {
			return;
		}
		await new Promise<void>((resolve) => {
			this.startWaiters.set(label, resolve);
		});
	}
}

export function recordProperty(value: object, key: string): unknown {
	return Object.entries(value).find(([entryKey]) => entryKey === key)?.[1];
}
