import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import type { AppInfo, AppState, DisplayInfo } from "../accessibility/types.js";
import { resolveAppInstructions } from "../app-instructions/index.js";
import {
	type ComputerUseActionAuditDetails,
	ComputerUseActionGate,
	type ComputerUseActionGateOptions,
} from "../computer/action-gate.js";
import { resolveDisplayMetadata } from "../computer/display-metadata.js";
import { ComputerUseError } from "../computer/errors.js";
import type { ComputerInterface, ScreenshotResult } from "../computer/interface.js";
import type { ScreenshotViewport } from "../computer/viewport.js";
import type { AppApprovalStore } from "../permission/app-approval.js";
import { blockedUrl, browserUrlScript, isBrowserBundle } from "../permission/url-blocklist.js";
import type {
	AppStateOptions,
	DragOptions,
	KeyOptions,
	Point,
	ScreenshotOptions,
	ScrollOptions,
	SelectTextOptions,
} from "../types/index.js";
import { type RunningAppInfo, collectAppUsage, getRunningMacOSApps } from "./app-list.js";
import { execFileStdout } from "./exec-util.js";
import { HostComputer, type HostComputerOptions } from "./host.js";
import { parseImageDimensions, sniffImageMimeType } from "./image-format.js";
import type { MacOSAppStateTargetWindow } from "./macos-desktop-session-types.js";
import { MacOSDesktopSession } from "./macos-desktop-session.js";
import {
	extractAccessibilityTree,
	performActionByIndex,
	pressElementAtScreenPoint,
	setValueByIndex,
	typeIntoFocusedAXElement,
} from "./macos-ffi/accessibility.js";
import { type PointerOverlay, createCursorOverlay } from "./macos-ffi/cursor-overlay.js";
import { createDisplaySleepAssertion } from "./macos-ffi/power.js";
import { getMainDisplayLogicalSize, getMainDisplayNativePixelSize } from "./macos-ffi/screenshot.js";
import { selectTextByIndex } from "./macos-ffi/select-text.js";
import { MacOSInputController } from "./macos-input.js";
import { captureMacOSScreenshot, getMacOSLogicalScreenSize, targetSizeFromRegion } from "./macos-screenshot.js";
import { systemEventsTargetWindowBounds } from "./macos-window-target-fallback.js";

export {
	captureMacOSScreenshot,
	getMacOSLogicalScreenSize,
	parseFinderDesktopBounds,
	parseSystemProfilerLogicalScreenSize,
} from "./macos-screenshot.js";

const execFileAsync = promisify(execFile);

const FINDER_DESKTOP_BOUNDS_TIMEOUT_MILLISECONDS = 2_000;
const DEFAULT_APP_STATE_SETTLE_MILLISECONDS = 300;
const APP_ACTIVATION_TIMEOUT_MILLISECONDS = 3_000;

export interface MacOSHostComputerOptions extends HostComputerOptions {
	defaultTargetPid?: number;
	overlay?: PointerOverlay;
	appApproval?: AppApprovalStore;
	urlBlocklist?: readonly string[];
	supervisor?: ComputerUseActionGateOptions["supervisor"];
	auditSink?: ComputerUseActionGateOptions["auditSink"];
	now?: ComputerUseActionGateOptions["now"];
	nextActionId?: ComputerUseActionGateOptions["nextActionId"];
}

export class MacOSHostComputer extends HostComputer {
	readonly capabilities: ComputerInterface["capabilities"] = {
		supportsScreenshot: true,
		supportsInput: true,
		supportsAccessibility: true,
		supportsClipboard: true,
	};

	private readonly appApproval: AppApprovalStore | undefined;
	private readonly input: MacOSInputController;
	private readonly overlay: PointerOverlay;
	private readonly session: MacOSDesktopSession;
	private readonly urlBlocklist: readonly string[];
	private readonly actionGate: ComputerUseActionGate;

	constructor(options: MacOSHostComputerOptions = {}) {
		super();
		this.appApproval = options.appApproval;
		this.urlBlocklist = options.urlBlocklist ?? [];
		this.overlay = options.overlay ?? createCursorOverlay();
		const actionGateOptions: ComputerUseActionGateOptions = {
			...(options.supervisor !== undefined ? { supervisor: options.supervisor } : {}),
			...(options.auditSink !== undefined ? { auditSink: options.auditSink } : {}),
			...(options.now !== undefined ? { now: options.now } : {}),
			...(options.nextActionId !== undefined ? { nextActionId: options.nextActionId } : {}),
		};
		this.actionGate = new ComputerUseActionGate(actionGateOptions);
		this.input = new MacOSInputController(
			options.defaultTargetPid,
			this.overlay,
			undefined,
			createDisplaySleepAssertion(),
			actionGateOptions,
		);
		this.session = new MacOSDesktopSession({
			activateApp,
			assertAppApproved: (app) => this.assertAppApproved(app),
			assertBrowserUrlAllowed: (app) => this.assertBrowserUrlAllowed(app),
			captureWindowScreenshot: (targetWindow, size) =>
				targetWindow.id === undefined
					? this.captureScreenshot({ targetSize: size, format: "jpeg", region: targetWindow.bounds })
					: this.captureScreenshot({ targetSize: size, format: "jpeg" }, targetWindow.id),
			extractAccessibilityTree,
			highlightWindow: (bounds) => this.overlay.highlight(bounds),
			listApps: getRunningMacOSApps,
			resolveAppInstructions,
			resolveCursorPosition: () => this.input.getCursorPosition(),
			resolveDisplayInfo,
			resolveTargetWindow: (pid) => this.resolveAppStateTargetWindow(pid),
			sleep,
		});
		// TODO: use options for display selection
		void options.display;
	}

	setTarget(pid?: number): void {
		this.input.setTarget(pid);
	}

	async rememberTargetWindow(pid: number): Promise<void> {
		await this.session.runExclusive("rememberTargetWindow", async () => {
			await this.input.rememberTargetWindow(pid);
		});
	}

	async screenshot(options?: ScreenshotOptions): Promise<ScreenshotResult> {
		return this.captureScreenshot(options);
	}

	private async captureScreenshot(options?: ScreenshotOptions, windowId?: number): Promise<ScreenshotResult> {
		const size =
			options?.targetSize ??
			(options?.region === undefined ? await this.getScreenSize() : targetSizeFromRegion(options.region));
		const data = await captureMacOSScreenshot(
			size,
			windowId,
			options?.format ?? "png",
			options?.quality ?? 72,
			options?.region,
		);
		const dimensions = parseImageDimensions(data);
		return {
			data,
			mimeType: sniffImageMimeType(data),
			width: dimensions.width,
			height: dimensions.height,
		};
	}

	async move(position: Point): Promise<void> {
		await this.session.runExclusive("move", async () => {
			await this.input.move(position);
		});
	}

	async click(position: Point): Promise<void> {
		await this.session.runExclusive("click", async () => {
			await this.input.click(position);
		});
	}

	async rightClick(position: Point): Promise<void> {
		await this.session.runExclusive("rightClick", async () => {
			await this.input.click(position, "right");
		});
	}

	async middleClick(position: Point): Promise<void> {
		await this.session.runExclusive("middleClick", async () => {
			await this.input.click(position, "middle");
		});
	}

	async doubleClick(position: Point): Promise<void> {
		await this.session.runExclusive("doubleClick", async () => {
			await this.input.doubleClick(position);
		});
	}

	async type(text: string): Promise<void> {
		await this.session.runExclusive("type", async () => {
			await this.input.typeText(text);
		});
	}

	async key(key: string, options?: KeyOptions): Promise<void> {
		await this.session.runExclusive("key", async () => {
			await this.input.pressKey(key, options);
		});
	}

	async scroll(options: ScrollOptions): Promise<void> {
		await this.session.runExclusive("scroll", async () => {
			await this.input.scroll(options);
		});
	}

	async drag(options: DragOptions): Promise<void> {
		await this.session.runExclusive("drag", async () => {
			await this.input.drag(options);
		});
	}

	async getCursorPosition(): Promise<Point> {
		return this.input.getCursorPosition();
	}

	async getScreenSize(): Promise<{ width: number; height: number }> {
		try {
			return getMainDisplayLogicalSize();
		} catch {
			return await getMacOSLogicalScreenSize();
		}
	}

	async getAppState(targetPid?: number, options?: AppStateOptions): Promise<AppState> {
		return await this.session.getAppState(targetPid, this.withDefaultSettle(options));
	}

	async getAppStateForApp(appName: string, options?: AppStateOptions): Promise<AppState> {
		const app = resolveTargetAppByName(await getRunningMacOSApps(), appName);
		return await this.session.getAppState(app.pid, this.withDefaultSettle(options));
	}

	private async resolveAppStateTargetWindow(pid: number): Promise<MacOSAppStateTargetWindow | undefined> {
		try {
			return await this.input.rememberTargetWindow(pid);
		} catch (error) {
			if (!(error instanceof Error)) {
				throw error;
			}
			const bounds = await systemEventsTargetWindowBounds(pid);
			return bounds === undefined ? undefined : { bounds };
		}
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
		} catch (error) {
			if (!(error instanceof Error)) {
				throw error;
			}
			return;
		}
		if (url.length > 0 && blockedUrl(url, this.urlBlocklist)) {
			throw new ComputerUseError("BLOCKED_URL", `Computer Use is not allowed on the current browser URL: ${url}`, {
				details: { bundleId: app.bundleId, pid: app.pid, url },
			});
		}
	}

	private assertAppApproved(app: RunningAppInfo): void {
		if (this.appApproval === undefined) {
			return;
		}
		const decision = this.appApproval.decide(app.bundleId);
		if (decision === "denied") {
			throw new ComputerUseError("UNAPPROVED_APP", `Computer Use is not allowed to use the app '${app.name}'.`, {
				details: { appName: app.name, bundleId: app.bundleId, pid: app.pid },
			});
		}
		if (decision === "needs-approval") {
			throw new ComputerUseError(
				"UNAPPROVED_APP",
				`Computer Use needs your approval to use '${app.name}'. Approve the app and try again.`,
				{ details: { appName: app.name, bundleId: app.bundleId, pid: app.pid } },
			);
		}
	}

	private withDefaultSettle(options?: AppStateOptions): AppStateOptions {
		return {
			...options,
			settleMs: options?.settleMs ?? DEFAULT_APP_STATE_SETTLE_MILLISECONDS,
		};
	}

	async getScreenshotViewport(targetPid: number): Promise<ScreenshotViewport | undefined> {
		return await this.session.getScreenshotViewport(targetPid);
	}

	async listApps(): Promise<AppInfo[]> {
		const running = await getRunningMacOSApps();
		const usage = await collectAppUsage(running.map((app) => app.path).filter((path) => path.length > 0));
		return running.map((app) => {
			const appUsage = usage.get(app.path) ?? {};
			return {
				bundleId: app.bundleId,
				name: app.name,
				pid: app.pid,
				isRunning: true,
				isFrontmost: app.isActive,
				...(appUsage.lastUsedDate !== undefined ? { lastUsedDate: appUsage.lastUsedDate } : {}),
				...(appUsage.useCount !== undefined ? { useCount: appUsage.useCount } : {}),
			};
		});
	}

	async setValue(targetPid: number, elementIndex: number, value: string): Promise<void> {
		await this.session.runExclusive("setValue", async () => {
			await this.runAccessibilityAction(
				"setValue",
				{ elementTarget: { pid: targetPid, elementIndex }, axValue: value },
				async () => {
					setValueByIndex(targetPid, elementIndex, value);
				},
			);
		});
	}

	async selectText(targetPid: number, elementIndex: number, options: SelectTextOptions): Promise<void> {
		await this.session.runExclusive("selectText", async () => {
			await this.runAccessibilityAction(
				"selectText",
				{ elementTarget: { pid: targetPid, elementIndex } },
				async () => {
					selectTextByIndex(targetPid, elementIndex, options);
				},
			);
		});
	}

	async performAction(targetPid: number, elementIndex: number, action: string): Promise<void> {
		await this.session.runExclusive("performAction", async () => {
			await this.runAccessibilityAction(
				"performAction",
				{ elementTarget: { pid: targetPid, elementIndex } },
				async () => {
					performActionByIndex(targetPid, elementIndex, action);
				},
			);
		});
	}

	async pressAtPosition(targetPid: number, position: Point): Promise<boolean> {
		return await this.session.runExclusive(
			"pressAtPosition",
			async () =>
				await this.runAccessibilityAction(
					"pressAtPosition",
					{ target: { pid: targetPid }, coordinateTarget: position },
					async () => pressElementAtScreenPoint(targetPid, position.x, position.y),
				),
		);
	}

	async typeIntoFocused(targetPid: number, text: string): Promise<boolean> {
		return await this.session.runExclusive(
			"typeIntoFocused",
			async () =>
				await this.runAccessibilityAction(
					"typeIntoFocused",
					{ target: { pid: targetPid }, typedText: text },
					async () => typeIntoFocusedAXElement(targetPid, text),
				),
		);
	}

	async close(): Promise<void> {
		this.input.close();
	}

	private async runAccessibilityAction<T>(
		action: string,
		details: ComputerUseActionAuditDetails,
		body: () => Promise<T>,
	): Promise<T> {
		return await this.actionGate.run(action, details, body);
	}
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

async function activateApp(app: RunningAppInfo): Promise<void> {
	await execFileAsync("open", ["-b", app.bundleId], {
		timeout: APP_ACTIVATION_TIMEOUT_MILLISECONDS,
	});
}

function resolveTargetApp(apps: readonly RunningAppInfo[], targetPid: number): RunningAppInfo {
	const app = apps.find((candidate) => candidate.pid === targetPid);
	if (app === undefined) {
		throw new Error(`No running app matched pid ${targetPid}`);
	}
	return app;
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
		const normalizedName = candidate.name.toLowerCase();
		const normalizedBundleId = candidate.bundleId.toLowerCase();
		return normalizedName === normalizedApp || normalizedBundleId === normalizedApp;
	});
	if (exactMatch !== undefined) {
		return exactMatch;
	}

	const partialMatch = apps.find((candidate) => candidate.name.toLowerCase().includes(normalizedApp));
	if (partialMatch !== undefined) {
		return partialMatch;
	}

	throw new Error(`No running app matched '${appName}'`);
}
