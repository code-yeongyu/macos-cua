import type { AXTreeElement, DisplayInfo } from "../accessibility/types.js";
import type { ScreenshotResult } from "../computer/interface.js";
import type { Rect, Size } from "../types/index.js";
import type { RunningAppInfo } from "./app-list.js";

export type MacOSAppStateTargetWindow = {
	readonly id?: number;
	readonly bounds: Rect;
};

export interface MacOSDesktopSessionBackend {
	listApps(): Promise<readonly RunningAppInfo[]>;
	assertAppApproved(app: RunningAppInfo): void;
	assertBrowserUrlAllowed(app: RunningAppInfo): Promise<void>;
	resolveTargetWindow(pid: number): Promise<MacOSAppStateTargetWindow | undefined>;
	activateApp(app: RunningAppInfo): Promise<void>;
	captureWindowScreenshot(window: MacOSAppStateTargetWindow, size: Size): Promise<ScreenshotResult>;
	extractAccessibilityTree(pid: number): {
		readonly axAvailable: boolean;
		readonly elements: readonly AXTreeElement[];
	};
	resolveDisplayInfo(): DisplayInfo;
	resolveAppInstructions(appName: string, bundleId: string): string | undefined;
	highlightWindow(bounds: Rect): void;
	sleep(milliseconds: number): Promise<void>;
}
