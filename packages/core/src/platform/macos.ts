import { setTimeout as sleep } from "node:timers/promises";
import type { AppInfo, AppState } from "../accessibility/types.js";
import { resolveAppInstructions } from "../app-instructions/index.js";
import {
	type ComputerUseActionAuditDetails,
	ComputerUseActionGate,
	type ComputerUseActionGateOptions,
} from "../computer/action-gate.js";
import type { ComputerInterface, ScreenshotResult } from "../computer/interface.js";
import type { ScreenshotViewport } from "../computer/viewport.js";
import type {
	AppOpenOptions,
	AppStateOptions,
	DragOptions,
	KeyOptions,
	Point,
	ScreenshotOptions,
	ScrollOptions,
	SelectTextOptions,
} from "../types/index.js";
import { getRunningMacOSApps, resolveRunningMacOSAppByName } from "./app-list.js";
import { openMacOSApp } from "./app-open.js";
import { HostComputer } from "./host.js";
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
import { getMainDisplayLogicalSize } from "./macos-ffi/screenshot.js";
import { selectTextByIndex } from "./macos-ffi/select-text.js";
import {
	assertAppApproved,
	assertBrowserUrlAllowed,
	captureMacOSScreenshotResult,
	listMacOSAppInfo,
	resolveAppStateTargetWindow,
	resolveDisplayInfo,
} from "./macos-host-helpers.js";
import { MacOSInputController } from "./macos-input.js";
import type { MacOSHostComputerOptions } from "./macos-options.js";
import { getMacOSLogicalScreenSize } from "./macos-screen.js";

export { captureMacOSScreenshot, getMacOSLogicalScreenSize } from "./macos-screen.js";
export type { MacOSHostComputerOptions } from "./macos-options.js";
export { parseFinderDesktopBounds, parseSystemProfilerLogicalScreenSize } from "./macos-screen.js";

const DEFAULT_APP_STATE_SETTLE_MILLISECONDS = 300;

export class MacOSHostComputer extends HostComputer {
	readonly capabilities: ComputerInterface["capabilities"] = {
		supportsScreenshot: true,
		supportsInput: true,
		supportsAccessibility: true,
		supportsClipboard: true,
	};

	private readonly actionGate: ComputerUseActionGate;
	private readonly appApproval: MacOSHostComputerOptions["appApproval"];
	private readonly input: MacOSInputController;
	private readonly overlay: PointerOverlay;
	private readonly session: MacOSDesktopSession;
	private readonly urlBlocklist: readonly string[];

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
			assertAppApproved: (app) => assertAppApproved(app, this.appApproval),
			assertBrowserUrlAllowed: (app) => assertBrowserUrlAllowed(app, this.urlBlocklist),
			captureWindowScreenshot: (targetWindow, size) =>
				targetWindow.id === undefined
					? this.captureScreenshot({ targetSize: size, format: "jpeg", region: targetWindow.bounds })
					: this.captureScreenshot({ targetSize: size, format: "jpeg" }, targetWindow.id),
			extractAccessibilityTree,
			highlightWindow: (bounds) => this.overlay.highlight(bounds),
			listApps: getRunningMacOSApps,
			resolveAppByName: resolveRunningMacOSAppByName,
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
		return await captureMacOSScreenshotResult(options, windowId, () => this.getScreenSize());
	}

	async move(position: Point): Promise<void> {
		await this.session.runExclusive("move", () => this.input.move(position));
	}

	async click(position: Point): Promise<void> {
		await this.session.runExclusive("click", () => this.input.click(position));
	}

	async rightClick(position: Point): Promise<void> {
		await this.session.runExclusive("rightClick", () => this.input.click(position, "right"));
	}

	async middleClick(position: Point): Promise<void> {
		await this.session.runExclusive("middleClick", () => this.input.click(position, "middle"));
	}

	async doubleClick(position: Point): Promise<void> {
		await this.session.runExclusive("doubleClick", () => this.input.doubleClick(position));
	}

	async type(text: string): Promise<void> {
		await this.session.runExclusive("type", () => this.input.typeText(text));
	}

	async key(key: string, options?: KeyOptions): Promise<void> {
		await this.session.runExclusive("key", () => this.input.pressKey(key, options));
	}

	async scroll(options: ScrollOptions): Promise<void> {
		await this.session.runExclusive("scroll", () => this.input.scroll(options));
	}

	async drag(options: DragOptions): Promise<void> {
		await this.session.runExclusive("drag", () => this.input.drag(options));
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
		return await this.session.getAppStateForApp(appName, this.withDefaultSettle(options));
	}

	private async resolveAppStateTargetWindow(pid: number) {
		return await resolveAppStateTargetWindow((targetPid) => this.input.rememberTargetWindow(targetPid), pid);
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
		return await listMacOSAppInfo();
	}

	async openApp(appName: string, options?: AppOpenOptions): Promise<AppInfo> {
		this.session.refresh();
		return await openMacOSApp(appName, options, this.urlBlocklist);
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
