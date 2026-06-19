import { beforeEach, describe, expect, it } from "vitest";
import type { AXTreeElement, DisplayInfo } from "../accessibility/types.js";
import { ComputerUseError } from "../computer/errors.js";
import type { ScreenshotResult } from "../computer/interface.js";
import type { Point, Rect, Size } from "../types/index.js";
import type { RunningAppInfo } from "./app-list.js";
import type { MacOSDesktopSessionBackend } from "./macos-desktop-session-types.js";
import { MacOSDesktopSession } from "./macos-desktop-session.js";

const TARGET_PID = 1234;
const OTHER_PID = 5678;
const APP: RunningAppInfo = {
	bundleId: "com.apple.finder",
	isActive: true,
	name: "Finder",
	path: "/System/Library/CoreServices/Finder.app",
	pid: TARGET_PID,
};
const OTHER_APP: RunningAppInfo = { ...APP, bundleId: "com.example.other", name: "Other", pid: OTHER_PID };
const WINDOW: SessionWindow = { bounds: { x: 10, y: 20, width: 400, height: 200 }, id: 99 };
const DISPLAY: DisplayInfo = { width: 1440, height: 900, scaleFactor: 2 };
const ELEMENT: AXTreeElement = {
	actions: ["AXPress"],
	children: [],
	frame: { x: 30, y: 40, width: 100, height: 50 },
	id: 7,
	label: "Open",
	role: "AXButton",
	value: null,
};
const CURSOR: Point = { x: 51, y: 62 };
const SECRET_AX_VALUE = "typed-secret".repeat(80);

type SessionWindow = {
	readonly id?: number;
	readonly bounds: Rect;
};

class FakeSessionBackend implements MacOSDesktopSessionBackend {
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

let backend: FakeSessionBackend;

beforeEach(() => {
	backend = new FakeSessionBackend();
});

describe("#given app approval and URL policies #when get_app_state is refused #then typed failures stop capture", () => {
	it("returns unapproved and blocked URL errors before taking screenshots", async () => {
		const session = new MacOSDesktopSession(backend);
		backend.approved = false;

		await expect(session.getAppState(TARGET_PID, { settleMs: 0 })).rejects.toMatchObject({
			code: "UNAPPROVED_APP",
			recoveryHint: "Approve the target app for Computer Use before retrying.",
		});
		expect(backend.calls).not.toContain("capture:1280x640");

		backend.calls.length = 0;
		backend.approved = true;
		backend.urlAllowed = false;

		await expect(session.getAppState(TARGET_PID, { settleMs: 0, refresh: true })).rejects.toMatchObject({
			code: "BLOCKED_URL",
		});
		expect(backend.calls).not.toContain("capture:1280x640");
	});
});

describe("#given no visible window #when get_app_state runs #then it fails without stale viewport", () => {
	it("invalidates cached viewport and returns a typed missing-window failure", async () => {
		const session = new MacOSDesktopSession(backend);
		await session.getAppState(TARGET_PID, { settleMs: 0 });
		backend.window = undefined;

		await expect(session.getAppState(TARGET_PID, { settleMs: 0, refresh: true })).rejects.toMatchObject({
			code: "MISSING_TARGET_WINDOW",
		});

		expect(await session.getScreenshotViewport(TARGET_PID)).toBeUndefined();
	});
});

describe("#given a warm same-target session #when get_app_state repeats #then reusable state remains valid", () => {
	it("reuses app lookup, carries AX diff state, and emits fresh capture ids", async () => {
		const session = new MacOSDesktopSession(backend);

		const first = await session.getAppState(TARGET_PID, { settleMs: 0 });
		const second = await session.getAppState(TARGET_PID, { settleMs: 0 });

		expect(backend.calls.filter((call) => call === "listApps")).toHaveLength(1);
		expect(first.axChangeSummary).toBeUndefined();
		expect(second.axChangeSummary).toEqual({ added: 0, changed: 0, removed: 0 });
		expect(first.captureFrame?.captureId).toBe("macos-capture-1");
		expect(second.captureFrame?.captureId).toBe("macos-capture-2");
	});

	it("reuses app-name lookup inside the warm session", async () => {
		const session = new MacOSDesktopSession(backend);

		await session.getAppStateForApp("Finder", { settleMs: 0 });
		await session.getAppStateForApp("com.apple.finder", { settleMs: 0 });

		expect(backend.calls.filter((call) => call === "listApps")).toHaveLength(1);
	});

	it("uses the direct app resolver before falling back to the full app list", async () => {
		const session = new MacOSDesktopSession(backend);
		backend.resolveAppByName = async (appName) => {
			backend.calls.push(`resolveApp:${appName}`);
			return APP;
		};

		await session.getAppStateForApp("Finder", { settleMs: 0 });
		await session.getAppStateForApp("com.apple.finder", { settleMs: 0 });

		expect(backend.calls).toContain("resolveApp:Finder");
		expect(backend.calls.filter((call) => call === "listApps")).toHaveLength(0);
		expect(backend.calls.filter((call) => call.startsWith("resolveApp:"))).toHaveLength(1);
	});
});

describe("#given a fake desktop observation #when get_app_state captures it #then metadata is rich and bounded", () => {
	it("#given first observation #when returned #then app window display cursor and capture metadata are present", async () => {
		const session = new MacOSDesktopSession(backend);

		const state = await session.getAppState(TARGET_PID, { settleMs: 0 });
		const metadata = recordProperty(state, "observation");

		expect(metadata).toMatchObject({
			app: { bundleId: APP.bundleId, frontmost: true, name: APP.name, pid: TARGET_PID },
			ax: { available: true, elementCount: 1 },
			capture: {
				captureId: "macos-capture-1",
				displayEpoch: "1440x900@2",
				model: { height: 200, width: 400 },
				screenshot: { height: 200, mimeType: "image/jpeg", width: 400 },
			},
			cursor: CURSOR,
			display: {
				epoch: "1440x900@2",
				logical: { height: 900, width: 1440, x: 0, y: 0 },
				native: { height: 1800, width: 2880 },
				scaleFactor: 2,
			},
			freshness: { captureId: "macos-capture-1", displayEpoch: "1440x900@2", stale: false },
			window: { bounds: WINDOW.bounds, id: WINDOW.id },
		});
		expect(JSON.stringify(metadata)).not.toContain(Buffer.from("screen").toString("base64"));
	});

	it("#given changed AX with large untrusted text #when recaptured #then only bounded diff metadata is included", async () => {
		const session = new MacOSDesktopSession(backend);
		await session.getAppState(TARGET_PID, { settleMs: 0 });
		backend.elements = [{ ...ELEMENT, value: SECRET_AX_VALUE }];

		const state = await session.getAppState(TARGET_PID, { settleMs: 0 });
		const metadata = recordProperty(state, "observation");

		expect(metadata).toMatchObject({
			ax: { available: true, changeSummary: { added: 0, changed: 1, removed: 0 }, elementCount: 1 },
		});
		expect(JSON.stringify(metadata)).not.toContain(SECRET_AX_VALUE);
	});

	it("#given display and window changed #when recaptured #then capture metadata is refreshed", async () => {
		const session = new MacOSDesktopSession(backend);
		await session.getAppState(TARGET_PID, { settleMs: 0 });
		backend.display = { height: 720, scaleFactor: 1, width: 1280 };
		backend.window = { bounds: { height: 300, width: 500, x: 25, y: 35 }, id: 100 };

		const state = await session.getAppState(TARGET_PID, { settleMs: 0 });
		const metadata = recordProperty(state, "observation");

		expect(metadata).toMatchObject({
			capture: { captureId: "macos-capture-2", displayEpoch: "1280x720@1", model: { height: 300, width: 500 } },
			display: { epoch: "1280x720@1", logical: { height: 720, width: 1280, x: 0, y: 0 } },
			freshness: { captureId: "macos-capture-2", displayEpoch: "1280x720@1", stale: false },
			window: { bounds: { height: 300, width: 500, x: 25, y: 35 }, id: 100 },
		});
	});
});

describe("#given target or display changes #when get_app_state runs #then stale AX and viewport state are invalidated", () => {
	it("omits AX diff after pid changes and after display geometry changes", async () => {
		const session = new MacOSDesktopSession(backend);
		await session.getAppState(TARGET_PID, { settleMs: 0 });

		const other = await session.getAppState(OTHER_PID, { settleMs: 0 });
		expect(other.axChangeSummary).toBeUndefined();

		backend.display = { width: 1280, height: 720, scaleFactor: 1 };
		const changedDisplay = await session.getAppState(TARGET_PID, { settleMs: 0, refresh: true });

		expect(changedDisplay.axChangeSummary).toBeUndefined();
		expect(changedDisplay.captureFrame?.displayEpoch).toBe("1280x720@1");
		expect(backend.calls.filter((call) => call === "highlight:400x200")).toHaveLength(3);
	});
});

describe("#given concurrent session work #when queued #then operations run in order", () => {
	it("serializes get_app_state and explicit work without sleeps", async () => {
		const session = new MacOSDesktopSession(backend);

		const first = session.runExclusive("first", () => backend.waitForQueueRelease("first"));
		const second = session.runExclusive("second", () => backend.waitForQueueRelease("second"));

		await backend.waitStarted("first");
		expect(backend.calls).toEqual(["start:first"]);

		backend.releaseNext();
		await first;
		await backend.waitStarted("second");
		expect(backend.calls).toEqual(["start:first", "end:first", "start:second"]);

		backend.releaseNext();
		await second;
		expect(backend.calls).toEqual(["start:first", "end:first", "start:second", "end:second"]);
	});
});

function recordProperty(value: object, key: string): unknown {
	return Object.entries(value).find(([entryKey]) => entryKey === key)?.[1];
}
