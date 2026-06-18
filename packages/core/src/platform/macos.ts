import type { AppInfo, AppState } from "../accessibility/types.js";
import type { ComputerInterface, ScreenshotResult } from "../computer/interface.js";
import type { ScreenshotViewport } from "../computer/viewport.js";
import type { AppApprovalStore } from "../permission/app-approval.js";
import type {
	AppStateOptions,
	DragOptions,
	KeyOptions,
	Point,
	ScreenshotOptions,
	ScrollOptions,
	SelectTextOptions,
} from "../types/index.js";
import { collectAppUsage, getRunningMacOSApps } from "./app-list.js";
import { HostComputer, type HostComputerOptions } from "./host.js";
import { parseImageDimensions, sniffImageMimeType } from "./image-format.js";
import { type AppStateTargetWindow, MacOSAppStateController } from "./macos-app-state.js";
import {
	performActionByIndex,
	pressElementAtScreenPoint,
	setValueByIndex,
	typeIntoFocusedAXElement,
} from "./macos-ffi/accessibility.js";
import { type PointerOverlay, createCursorOverlay } from "./macos-ffi/cursor-overlay.js";
import { createDisplaySleepAssertion } from "./macos-ffi/power.js";
import { getMainDisplayLogicalSize } from "./macos-ffi/screenshot.js";
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

export interface MacOSHostComputerOptions extends HostComputerOptions {
	defaultTargetPid?: number;
	overlay?: PointerOverlay;
	appApproval?: AppApprovalStore;
	urlBlocklist?: readonly string[];
}

export class MacOSHostComputer extends HostComputer {
	readonly capabilities: ComputerInterface["capabilities"] = {
		supportsScreenshot: true,
		supportsInput: true,
		supportsAccessibility: true,
		supportsClipboard: true,
	};

	private readonly input: MacOSInputController;
	private readonly appState: MacOSAppStateController;
	private readonly overlay: PointerOverlay;

	constructor(options: MacOSHostComputerOptions = {}) {
		super();
		this.overlay = options.overlay ?? createCursorOverlay();
		this.input = new MacOSInputController(
			options.defaultTargetPid,
			this.overlay,
			undefined,
			createDisplaySleepAssertion(),
		);
		this.appState = new MacOSAppStateController({
			captureScreenshot: (screenshotOptions, windowId) => this.captureScreenshot(screenshotOptions, windowId),
			overlay: this.overlay,
			resolveTargetWindow: (pid) => this.resolveAppStateTargetWindow(pid),
			urlBlocklist: options.urlBlocklist ?? [],
			...(options.appApproval !== undefined ? { appApproval: options.appApproval } : {}),
		});
		// TODO: use options for display selection
		void options.display;
	}

	setTarget(pid?: number): void {
		this.input.setTarget(pid);
	}

	async rememberTargetWindow(pid: number): Promise<void> {
		await this.input.rememberTargetWindow(pid);
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
		await this.input.move(position);
	}

	async click(position: Point): Promise<void> {
		await this.input.click(position);
	}

	async rightClick(position: Point): Promise<void> {
		await this.input.click(position, "right");
	}

	async middleClick(position: Point): Promise<void> {
		await this.input.click(position, "middle");
	}

	async doubleClick(position: Point): Promise<void> {
		await this.input.doubleClick(position);
	}

	async type(text: string): Promise<void> {
		await this.input.typeText(text);
	}

	async key(key: string, options?: KeyOptions): Promise<void> {
		await this.input.pressKey(key, options);
	}

	async scroll(options: ScrollOptions): Promise<void> {
		await this.input.scroll(options);
	}

	async drag(options: DragOptions): Promise<void> {
		await this.input.drag(options);
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
		return await this.appState.getAppState(targetPid, options);
	}

	async getAppStateForApp(appName: string, options?: AppStateOptions): Promise<AppState> {
		return await this.appState.getAppStateForApp(appName, options);
	}

	private async resolveAppStateTargetWindow(pid: number): Promise<AppStateTargetWindow | undefined> {
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

	async getScreenshotViewport(targetPid: number): Promise<ScreenshotViewport | undefined> {
		return await this.appState.getScreenshotViewport(targetPid);
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
		setValueByIndex(targetPid, elementIndex, value);
	}

	async selectText(targetPid: number, elementIndex: number, options: SelectTextOptions): Promise<void> {
		selectTextByIndex(targetPid, elementIndex, options);
	}

	async performAction(targetPid: number, elementIndex: number, action: string): Promise<void> {
		performActionByIndex(targetPid, elementIndex, action);
	}

	async pressAtPosition(targetPid: number, position: Point): Promise<boolean> {
		return pressElementAtScreenPoint(targetPid, position.x, position.y);
	}

	async typeIntoFocused(targetPid: number, text: string): Promise<boolean> {
		return typeIntoFocusedAXElement(targetPid, text);
	}

	async close(): Promise<void> {
		this.input.close();
	}
}
