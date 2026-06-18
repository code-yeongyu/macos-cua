import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { diffAxTreesByKey } from "../accessibility/diff.js";
import { normalizeAxTree } from "../accessibility/normalize.js";
import type { AXTreeElement, AppState, DisplayInfo } from "../accessibility/types.js";
import { resolveAppInstructions } from "../app-instructions/index.js";
import { resolveDisplayMetadata } from "../computer/display-metadata.js";
import type { ScreenshotResult } from "../computer/interface.js";
import { type ScreenshotViewport, resolveWindowScreenshotSize, screenRectToScreenshot } from "../computer/viewport.js";
import type { AppApprovalStore } from "../permission/app-approval.js";
import { blockedUrl, browserUrlScript, isBrowserBundle } from "../permission/url-blocklist.js";
import type { AppStateOptions, Rect, ScreenshotOptions } from "../types/index.js";
import { type RunningAppInfo, getRunningMacOSApps } from "./app-list.js";
import { execFileStdout } from "./exec-util.js";
import { extractAccessibilityTree } from "./macos-ffi/accessibility.js";
import type { PointerOverlay } from "./macos-ffi/cursor-overlay.js";
import { getMainDisplayLogicalSize, getMainDisplayNativePixelSize } from "./macos-ffi/screenshot.js";

const execFileAsync = promisify(execFile);

const FINDER_DESKTOP_BOUNDS_TIMEOUT_MILLISECONDS = 2_000;
const DEFAULT_APP_STATE_SETTLE_MILLISECONDS = 300;
const APP_ACTIVATION_SETTLE_MILLISECONDS = 350;
const APP_ACTIVATION_TIMEOUT_MILLISECONDS = 3_000;

export type AppStateTargetWindow = {
	readonly id?: number;
	readonly bounds: Rect;
};

export type MacOSAppStateControllerOptions = {
	readonly appApproval?: AppApprovalStore;
	readonly captureScreenshot: (options?: ScreenshotOptions, windowId?: number) => Promise<ScreenshotResult>;
	readonly overlay: PointerOverlay;
	readonly resolveTargetWindow: (pid: number) => Promise<AppStateTargetWindow | undefined>;
	readonly urlBlocklist: readonly string[];
};

export class MacOSAppStateController {
	private readonly appApproval: AppApprovalStore | undefined;
	private readonly captureScreenshot: (options?: ScreenshotOptions, windowId?: number) => Promise<ScreenshotResult>;
	private readonly lastAxTreeByPid = new Map<number, AXTreeElement[]>();
	private readonly lastViewportByPid = new Map<number, ScreenshotViewport>();
	private readonly overlay: PointerOverlay;
	private readonly resolveTargetWindow: (pid: number) => Promise<AppStateTargetWindow | undefined>;
	private readonly highlightedApps = new Set<number>();
	private readonly urlBlocklist: readonly string[];

	constructor(options: MacOSAppStateControllerOptions) {
		this.appApproval = options.appApproval;
		this.captureScreenshot = options.captureScreenshot;
		this.overlay = options.overlay;
		this.resolveTargetWindow = options.resolveTargetWindow;
		this.urlBlocklist = options.urlBlocklist;
	}

	async getAppState(targetPid?: number, options?: AppStateOptions): Promise<AppState> {
		await settleAppState(options);
		const apps = await getRunningMacOSApps();
		return await this.getAppStateForResolvedApp(resolveTargetApp(apps, targetPid), options);
	}

	async getAppStateForApp(appName: string, options?: AppStateOptions): Promise<AppState> {
		await settleAppState(options);
		const apps = await getRunningMacOSApps();
		return await this.getAppStateForResolvedApp(resolveTargetAppByName(apps, appName), options);
	}

	async getScreenshotViewport(targetPid: number): Promise<ScreenshotViewport | undefined> {
		const stored = this.lastViewportByPid.get(targetPid);
		if (stored !== undefined) {
			return stored;
		}
		const targetWindow = await this.resolveTargetWindow(targetPid);
		if (targetWindow === undefined) {
			return undefined;
		}
		const size = resolveWindowScreenshotSize(targetWindow.bounds);
		return {
			windowBounds: { ...targetWindow.bounds },
			screenshotWidth: size.width,
			screenshotHeight: size.height,
		};
	}

	private async getAppStateForResolvedApp(initialApp: RunningAppInfo, options?: AppStateOptions): Promise<AppState> {
		let app = initialApp;
		this.assertAppApproved(app);
		await this.assertBrowserUrlAllowed(app);
		let targetWindow = await this.resolveTargetWindow(app.pid);
		if (targetWindow === undefined) {
			await activateMacOSApp(app);
			await sleep(APP_ACTIVATION_SETTLE_MILLISECONDS);
			const apps = await getRunningMacOSApps();
			app = resolveTargetApp(apps, app.pid);
			await this.assertBrowserUrlAllowed(app);
			targetWindow = await this.resolveTargetWindow(app.pid);
		}
		if (targetWindow === undefined) {
			this.lastViewportByPid.delete(app.pid);
			throw new Error(
				`No visible target window found for '${app.name}' after activating it. Open a window in the app and retry.`,
			);
		}

		const size = options?.screenshotSize ?? resolveWindowScreenshotSize(targetWindow.bounds);
		const screenshot =
			targetWindow.id === undefined
				? await this.captureScreenshot({ targetSize: size, format: "jpeg", region: targetWindow.bounds })
				: await this.captureScreenshot({ targetSize: size, format: "jpeg" }, targetWindow.id);
		const tree = extractAccessibilityTree(app.pid);
		const display = resolveDisplayInfo();
		const appInstructions = resolveAppInstructions(app.name, app.bundleId);

		const viewport: ScreenshotViewport = {
			windowBounds: { ...targetWindow.bounds },
			screenshotWidth: screenshot.width,
			screenshotHeight: screenshot.height,
		};
		this.lastViewportByPid.set(app.pid, viewport);
		const windowBounds = viewport.windowBounds;
		const elements = normalizeAxTree(remapElementFramesToScreenshot(tree.elements, viewport));
		if (!this.highlightedApps.has(app.pid)) {
			this.highlightedApps.add(app.pid);
			this.overlay.highlight(viewport.windowBounds);
		}
		const previousTree = this.lastAxTreeByPid.get(app.pid);
		const axChangeSummary = previousTree === undefined ? undefined : diffAxTreesByKey(previousTree, elements);
		this.lastAxTreeByPid.set(app.pid, elements);

		return {
			app: app.name,
			bundleId: app.bundleId,
			pid: app.pid,
			frontmost: app.isActive,
			axAvailable: tree.axAvailable,
			elements,
			screenshotBase64: screenshot.data.toString("base64"),
			screenshotWidth: screenshot.width,
			screenshotHeight: screenshot.height,
			screenshotMimeType: screenshot.mimeType,
			display,
			...(axChangeSummary !== undefined ? { axChangeSummary } : {}),
			...(appInstructions !== undefined ? { appInstructions } : {}),
			...(windowBounds !== undefined ? { windowBounds } : {}),
		};
	}

	private async assertBrowserUrlAllowed(app: RunningAppInfo): Promise<void> {
		if (this.urlBlocklist.length === 0 || !isBrowserBundle(app.bundleId)) {
			return;
		}
		const script = browserUrlScript(app.bundleId);
		if (script === undefined) {
			return;
		}
		let url: string;
		try {
			const result = await execFileAsync("osascript", ["-e", script], {
				encoding: "utf8",
				timeout: FINDER_DESKTOP_BOUNDS_TIMEOUT_MILLISECONDS,
			});
			url = execFileStdout(result).trim();
		} catch {
			return;
		}
		if (url.length > 0 && blockedUrl(url, this.urlBlocklist)) {
			throw new Error(`Computer Use is not allowed on the current browser URL: ${url}`);
		}
	}

	private assertAppApproved(app: RunningAppInfo): void {
		if (this.appApproval === undefined) {
			return;
		}
		const decision = this.appApproval.decide(app.bundleId);
		if (decision === "denied") {
			throw new Error(`Computer Use is not allowed to use the app '${app.name}'.`);
		}
		if (decision === "needs-approval") {
			throw new Error(`Computer Use needs your approval to use '${app.name}'. Approve the app and try again.`);
		}
	}
}

async function settleAppState(options?: AppStateOptions): Promise<void> {
	const settleMs = options?.settleMs ?? DEFAULT_APP_STATE_SETTLE_MILLISECONDS;
	if (settleMs > 0) {
		await sleep(settleMs);
	}
}

function resolveTargetApp(apps: readonly RunningAppInfo[], targetPid: number | undefined): RunningAppInfo {
	if (targetPid !== undefined) {
		const app = apps.find((candidate) => candidate.pid === targetPid);
		if (app === undefined) {
			throw new Error(`No running app matched pid ${targetPid}`);
		}
		return app;
	}
	const frontmost = apps.find((candidate) => candidate.isActive);
	if (frontmost === undefined) {
		throw new Error("No frontmost application available");
	}
	return frontmost;
}

function resolveTargetAppByName(apps: readonly RunningAppInfo[], appName: string): RunningAppInfo {
	const normalizedApp = appName.trim().toLowerCase();
	if (normalizedApp.length === 0) {
		throw new Error("app must be a non-empty app name, bundle id, or pid");
	}

	const numericPid = Number(normalizedApp);
	if (Number.isSafeInteger(numericPid) && numericPid > 0) {
		return resolveTargetApp(apps, numericPid);
	}

	const exactMatch = apps.find((candidate) => {
		const name = candidate.name.toLowerCase();
		const bundleId = candidate.bundleId.toLowerCase();
		return name === normalizedApp || bundleId === normalizedApp;
	});
	if (exactMatch !== undefined) {
		return exactMatch;
	}

	const fuzzyMatch = apps.find((candidate) => {
		const name = candidate.name.toLowerCase();
		const bundleId = candidate.bundleId.toLowerCase();
		return name.includes(normalizedApp) || bundleId.includes(normalizedApp);
	});
	if (fuzzyMatch !== undefined) {
		return fuzzyMatch;
	}

	throw new Error(`No running app matched "${appName}"`);
}

async function activateMacOSApp(app: RunningAppInfo): Promise<void> {
	await execFileAsync("open", ["-b", app.bundleId], {
		timeout: APP_ACTIVATION_TIMEOUT_MILLISECONDS,
	});
}

function remapElementFramesToScreenshot(
	elements: readonly AXTreeElement[],
	viewport: ScreenshotViewport,
): AXTreeElement[] {
	return elements.map((element) => ({
		...element,
		frame: screenRectToScreenshot(element.frame, viewport),
	}));
}

function resolveDisplayInfo(): DisplayInfo {
	const logical = getMainDisplayLogicalSize();
	let nativePixel: { width: number; height: number } | undefined;
	try {
		nativePixel = getMainDisplayNativePixelSize();
	} catch {
		nativePixel = undefined;
	}
	return resolveDisplayMetadata(nativePixel === undefined ? { logical } : { logical, nativePixel });
}
