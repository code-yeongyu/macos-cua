import type { AppInfo, AppState } from "../accessibility/types.js";
import type { AppStateOptions, Point, Rect, SelectTextOptions, Size } from "../types/index.js";
import type { ScreenshotHandle } from "./screenshot-store.js";

export type { ScreenshotHandle } from "./screenshot-store.js";

export type CodeModeAppState = Omit<AppState, "screenshotBase64"> & {
	readonly screenshot: ScreenshotHandle;
};

export type CodeModeAppTarget = string | number;

export type CodeModeScreenshotOptions = {
	readonly region?: Rect;
	readonly targetSize?: Size;
	readonly format?: "png" | "jpeg";
	readonly quality?: number;
};

export type CodeModePointerTarget = {
	readonly x?: number;
	readonly y?: number;
	readonly elementIndex?: number;
	readonly captureId?: string;
	readonly displayEpoch?: string;
};

export type CodeModeClickTarget = CodeModePointerTarget & {
	readonly button?: "left" | "right" | "middle";
};

export type CodeModeDragOptions = {
	readonly fromX: number;
	readonly fromY: number;
	readonly toX: number;
	readonly toY: number;
};

export type CodeModeScrollOptions = {
	readonly direction: "up" | "down" | "left" | "right";
	readonly amount?: number;
	readonly elementIndex?: number;
};

export type CodeModeKeyInput =
	| string
	| {
			readonly key: string;
			readonly holdSeconds?: number;
	  };

export type CodeModePressKeysOptions = {
	readonly holdSeconds?: number;
	readonly intervalSeconds?: number;
};

export interface CodeModeApi {
	screenshot(options?: CodeModeScreenshotOptions): ScreenshotHandle;
	getAppState(app?: CodeModeAppTarget, options?: AppStateOptions): CodeModeAppState;
	listApps(): readonly AppInfo[];
	click(app: CodeModeAppTarget, target: CodeModeClickTarget): void;
	doubleClick(app: CodeModeAppTarget, target: CodeModePointerTarget): void;
	rightClick(app: CodeModeAppTarget, target: CodeModePointerTarget): void;
	move(app: CodeModeAppTarget, position: Point): void;
	drag(app: CodeModeAppTarget, options: CodeModeDragOptions): void;
	scroll(app: CodeModeAppTarget, options: CodeModeScrollOptions): void;
	type(app: CodeModeAppTarget, text: string): void;
	pressKeys(app: CodeModeAppTarget, keys: readonly CodeModeKeyInput[], options?: CodeModePressKeysOptions): void;
	setValue(app: CodeModeAppTarget, elementIndex: number, value: string): void;
	selectText(app: CodeModeAppTarget, elementIndex: number, options: SelectTextOptions): void;
	performAction(app: CodeModeAppTarget, elementIndex: number, action: string): void;
	getCursorPosition(): Point;
}

export const CODE_MODE_METHOD_NAMES = [
	"screenshot",
	"getAppState",
	"listApps",
	"click",
	"doubleClick",
	"rightClick",
	"move",
	"drag",
	"scroll",
	"type",
	"pressKeys",
	"setValue",
	"selectText",
	"performAction",
	"getCursorPosition",
] as const satisfies readonly (keyof CodeModeApi)[];

export const CODE_MODE_API_DTS = `
type CodeModeMimeType = "image/png" | "image/jpeg";
type CodeModeAppTarget = string | number;
type CodeModeMouseButton = "left" | "right" | "middle";
type CodeModeScrollDirection = "up" | "down" | "left" | "right";
type CodeModeSelectionMode = "text" | "before" | "after";

interface Point {
	readonly x: number;
	readonly y: number;
}

interface Size {
	readonly width: number;
	readonly height: number;
}

interface Rect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

interface ScreenshotHandle {
	readonly id: string;
	readonly width: number;
	readonly height: number;
	readonly mimeType: CodeModeMimeType;
}

interface AXTreeElement {
	readonly id: number;
	readonly role: string;
	readonly label: string | null;
	readonly value: string | null;
	readonly frame: Rect;
	readonly actions: readonly string[];
	readonly children: readonly number[];
}

interface DisplayInfo {
	readonly width: number;
	readonly height: number;
	readonly scaleFactor: number;
}

interface AxTreeChangeSummary {
	readonly added: number;
	readonly removed: number;
	readonly changed: number;
}

interface AppInfo {
	readonly name: string;
	readonly bundleId: string;
	readonly pid: number;
	readonly isRunning: boolean;
	readonly isFrontmost?: boolean;
	readonly lastUsedDate?: string;
	readonly useCount?: number;
}

interface CodeModeAppState {
	readonly app: string;
	readonly bundleId: string;
	readonly pid: number;
	readonly frontmost: boolean;
	readonly axAvailable: boolean;
	readonly elements: readonly AXTreeElement[];
	readonly screenshotWidth: number;
	readonly screenshotHeight: number;
	readonly screenshotMimeType?: CodeModeMimeType;
	readonly display: DisplayInfo;
	readonly axChangeSummary?: AxTreeChangeSummary;
	readonly appInstructions?: string;
	readonly windowBounds?: Rect;
	readonly screenshot: ScreenshotHandle;
}

interface CodeModeScreenshotOptions {
	readonly region?: Rect;
	readonly targetSize?: Size;
	readonly format?: "png" | "jpeg";
	readonly quality?: number;
}

interface CodeModeAppStateOptions {
	readonly screenshotSize?: Size;
	readonly timeoutMs?: number;
	readonly settleMs?: number;
}

	interface CodeModePointerTarget {
		readonly x?: number;
		readonly y?: number;
		readonly elementIndex?: number;
		readonly captureId?: string;
		readonly displayEpoch?: string;
	}

interface CodeModeClickTarget extends CodeModePointerTarget {
	readonly button?: CodeModeMouseButton;
}

interface CodeModeDragOptions {
	readonly fromX: number;
	readonly fromY: number;
	readonly toX: number;
	readonly toY: number;
}

interface CodeModeScrollOptions {
	readonly direction: CodeModeScrollDirection;
	readonly amount?: number;
	readonly elementIndex?: number;
}

type CodeModeKeyInput = string | {
	readonly key: string;
	readonly holdSeconds?: number;
};

interface CodeModePressKeysOptions {
	readonly holdSeconds?: number;
	readonly intervalSeconds?: number;
}

interface CodeModeSelectTextOptions {
	readonly selection: CodeModeSelectionMode;
	readonly text?: string;
	readonly prefix?: string;
	readonly suffix?: string;
}

interface CodeModeApi {
	screenshot(options?: CodeModeScreenshotOptions): ScreenshotHandle;
	getAppState(app?: CodeModeAppTarget, options?: CodeModeAppStateOptions): CodeModeAppState;
	listApps(): readonly AppInfo[];
	click(app: CodeModeAppTarget, target: CodeModeClickTarget): void;
	doubleClick(app: CodeModeAppTarget, target: CodeModePointerTarget): void;
	rightClick(app: CodeModeAppTarget, target: CodeModePointerTarget): void;
	move(app: CodeModeAppTarget, position: Point): void;
	drag(app: CodeModeAppTarget, options: CodeModeDragOptions): void;
	scroll(app: CodeModeAppTarget, options: CodeModeScrollOptions): void;
	type(app: CodeModeAppTarget, text: string): void;
	pressKeys(app: CodeModeAppTarget, keys: readonly CodeModeKeyInput[], options?: CodeModePressKeysOptions): void;
	setValue(app: CodeModeAppTarget, elementIndex: number, value: string): void;
	selectText(app: CodeModeAppTarget, elementIndex: number, options: CodeModeSelectTextOptions): void;
	performAction(app: CodeModeAppTarget, elementIndex: number, action: string): void;
	getCursorPosition(): Point;
}

declare const mac: CodeModeApi;
declare function surface(handle: ScreenshotHandle): void;
`;
