import { diffAxTreesByKey } from "../accessibility/diff.js";
import { normalizeAxTree } from "../accessibility/normalize.js";
import type { AXTreeElement, AppState, DisplayInfo } from "../accessibility/types.js";
import { type CaptureFrame, createCaptureFrame } from "../computer/capture-frame.js";
import { ComputerUseError } from "../computer/errors.js";
import type { ScreenshotResult } from "../computer/interface.js";
import { type ScreenshotViewport, resolveWindowScreenshotSize, screenRectToScreenshot } from "../computer/viewport.js";
import type { AppStateOptions } from "../types/index.js";
import type { RunningAppInfo } from "./app-list.js";
import {
	macOSDesktopSessionSignature,
	macOSDisplayEpoch,
	macOSNativeDisplaySize,
} from "./macos-desktop-session-signature.js";
import type { MacOSAppStateTargetWindow, MacOSDesktopSessionBackend } from "./macos-desktop-session-types.js";
import { createMacOSObservationMetadata } from "./macos-observation-metadata.js";

const APP_ACTIVATION_SETTLE_MILLISECONDS = 350;

export class MacOSDesktopSession {
	private readonly appByPid = new Map<number, RunningAppInfo>();
	private readonly viewportByPid = new Map<number, ScreenshotViewport>();
	private readonly previousAxByPid = new Map<number, readonly AXTreeElement[]>();
	private readonly signatureByPid = new Map<number, string>();
	private readonly windowByPid = new Map<number, MacOSAppStateTargetWindow>();
	private readonly captureFrameByPid = new Map<number, CaptureFrame>();
	private readonly highlightedPids = new Set<number>();
	private queue: Promise<void> = Promise.resolve();
	private captureSequence = 0;

	constructor(private readonly backend: MacOSDesktopSessionBackend) {}

	async getAppState(targetPid?: number, options: AppStateOptions = {}): Promise<AppState> {
		return await this.runExclusive("getAppState", () => this.getAppStateUnqueued(targetPid, options));
	}

	async getScreenshotViewport(targetPid: number): Promise<ScreenshotViewport | undefined> {
		return await this.runExclusive("getScreenshotViewport", async () => {
			const stored = this.viewportByPid.get(targetPid);
			if (stored !== undefined) {
				return stored;
			}
			const targetWindow = await this.backend.resolveTargetWindow(targetPid);
			if (targetWindow === undefined) {
				return undefined;
			}
			this.windowByPid.set(targetPid, targetWindow);
			const size = resolveWindowScreenshotSize(targetWindow.bounds);
			return {
				windowBounds: { ...targetWindow.bounds },
				screenshotWidth: size.width,
				screenshotHeight: size.height,
			};
		});
	}

	refresh(targetPid?: number): void {
		if (targetPid === undefined) {
			this.appByPid.clear();
			this.viewportByPid.clear();
			this.previousAxByPid.clear();
			this.signatureByPid.clear();
			this.windowByPid.clear();
			this.captureFrameByPid.clear();
			this.highlightedPids.clear();
			return;
		}
		this.invalidatePid(targetPid);
		this.appByPid.delete(targetPid);
	}

	async runExclusive<T>(label: string, action: () => Promise<T>): Promise<T> {
		void label;
		const ready = this.queue.catch(() => undefined);
		let release = (): void => {};
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.queue = ready.then(() => current);
		await ready;
		try {
			return await action();
		} finally {
			release();
		}
	}

	private async getAppStateUnqueued(targetPid: number | undefined, options: AppStateOptions): Promise<AppState> {
		const refresh = options.refresh === true;
		if (refresh) {
			this.refresh(targetPid);
		}
		if (options.settleMs !== undefined && options.settleMs > 0) {
			await this.backend.sleep(options.settleMs);
		}
		let app = await this.resolveApp(targetPid, refresh);
		this.backend.assertAppApproved(app);
		await this.backend.assertBrowserUrlAllowed(app);
		let targetWindow = await this.backend.resolveTargetWindow(app.pid);
		if (targetWindow === undefined) {
			this.invalidatePid(app.pid);
			await this.backend.activateApp(app);
			await this.backend.sleep(APP_ACTIVATION_SETTLE_MILLISECONDS);
			app = await this.resolveApp(app.pid, true);
			this.backend.assertAppApproved(app);
			await this.backend.assertBrowserUrlAllowed(app);
			targetWindow = await this.backend.resolveTargetWindow(app.pid);
		}
		if (targetWindow === undefined) {
			this.invalidatePid(app.pid);
			throw new ComputerUseError(
				"MISSING_TARGET_WINDOW",
				`No visible target window found for '${app.name}' after activating it. Open a window in the app and retry.`,
				{ details: { appName: app.name, bundleId: app.bundleId, pid: app.pid } },
			);
		}
		this.windowByPid.set(app.pid, targetWindow);
		const size = options.screenshotSize ?? resolveWindowScreenshotSize(targetWindow.bounds);
		const screenshot = await this.backend.captureWindowScreenshot(targetWindow, size);
		const tree = this.backend.extractAccessibilityTree(app.pid);
		const display = this.backend.resolveDisplayInfo();
		const viewport: ScreenshotViewport = {
			windowBounds: { ...targetWindow.bounds },
			screenshotHeight: screenshot.height,
			screenshotWidth: screenshot.width,
		};
		const signature = macOSDesktopSessionSignature(app.pid, targetWindow, display);
		if (this.signatureByPid.get(app.pid) !== signature) {
			this.previousAxByPid.delete(app.pid);
			this.viewportByPid.delete(app.pid);
			this.captureFrameByPid.delete(app.pid);
			this.highlightedPids.delete(app.pid);
			this.signatureByPid.set(app.pid, signature);
		}
		this.viewportByPid.set(app.pid, viewport);
		if (!this.highlightedPids.has(app.pid)) {
			this.highlightedPids.add(app.pid);
			this.backend.highlightWindow(viewport.windowBounds);
		}
		const elements = normalizeAxTree(remapElementFramesToScreenshot(tree.elements, viewport));
		const previousTree = this.previousAxByPid.get(app.pid);
		const axChangeSummary = previousTree === undefined ? undefined : diffAxTreesByKey(previousTree, elements);
		this.previousAxByPid.set(app.pid, elements);
		const captureFrame = this.createCaptureFrame(app, viewport, screenshot, display);
		this.captureFrameByPid.set(app.pid, captureFrame);
		const cursor = await this.backend.resolveCursorPosition?.();
		const observation = createMacOSObservationMetadata({
			app,
			axAvailable: tree.axAvailable,
			...(axChangeSummary !== undefined ? { axChangeSummary } : {}),
			captureFrame,
			...(cursor !== undefined ? { cursor } : {}),
			display,
			elements,
			screenshot,
			targetWindow,
		});
		const appInstructions = this.backend.resolveAppInstructions(app.name, app.bundleId);
		return {
			app: app.name,
			axAvailable: tree.axAvailable,
			bundleId: app.bundleId,
			captureFrame,
			display,
			elements,
			frontmost: app.isActive,
			observation,
			pid: app.pid,
			screenshotBase64: screenshot.data.toString("base64"),
			screenshotHeight: screenshot.height,
			screenshotMimeType: screenshot.mimeType,
			screenshotWidth: screenshot.width,
			...(appInstructions !== undefined ? { appInstructions } : {}),
			...(axChangeSummary !== undefined ? { axChangeSummary } : {}),
			windowBounds: viewport.windowBounds,
		};
	}

	private async resolveApp(targetPid: number | undefined, refresh: boolean): Promise<RunningAppInfo> {
		if (targetPid !== undefined && !refresh) {
			const cached = this.appByPid.get(targetPid);
			if (cached !== undefined) {
				return cached;
			}
		}
		const apps = await this.backend.listApps();
		for (const app of apps) {
			this.appByPid.set(app.pid, app);
		}
		if (targetPid === undefined) {
			const frontmost = apps.find((candidate) => candidate.isActive);
			if (frontmost === undefined) {
				throw new Error("No frontmost application available");
			}
			return frontmost;
		}
		const app = apps.find((candidate) => candidate.pid === targetPid);
		if (app === undefined) {
			this.invalidatePid(targetPid);
			throw new Error(`No running app matched pid ${targetPid}`);
		}
		return app;
	}

	private createCaptureFrame(
		app: RunningAppInfo,
		viewport: ScreenshotViewport,
		screenshot: ScreenshotResult,
		display: DisplayInfo,
	): CaptureFrame {
		this.captureSequence += 1;
		return createCaptureFrame({
			captureId: `macos-capture-${this.captureSequence}`,
			capturedAt: new Date().toISOString(),
			display: {
				logical: { x: 0, y: 0, width: display.width, height: display.height },
				native: macOSNativeDisplaySize(display),
				scaleFactor: display.scaleFactor,
			},
			displayEpoch: macOSDisplayEpoch(display),
			model: { width: screenshot.width, height: screenshot.height },
			screenshot: { width: screenshot.width, height: screenshot.height },
			target: { appName: app.name, bundleId: app.bundleId, pid: app.pid },
			windowBounds: viewport.windowBounds,
		});
	}

	private invalidatePid(pid: number): void {
		this.viewportByPid.delete(pid);
		this.previousAxByPid.delete(pid);
		this.signatureByPid.delete(pid);
		this.windowByPid.delete(pid);
		this.captureFrameByPid.delete(pid);
		this.highlightedPids.delete(pid);
	}
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
