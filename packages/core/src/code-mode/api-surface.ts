import type { AppInfo, AppState, AxTreeChangeSummary } from "../accessibility/types.js";
import type { CaptureFrame } from "../computer/capture-frame.js";
import type { AppStateOptions, Point, Rect, SelectTextOptions, Size } from "../types/index.js";
import type { ScreenshotHandle } from "./screenshot-store.js";

export { CODE_MODE_API_DTS } from "./api-dts.js";
export type { ScreenshotHandle } from "./screenshot-store.js";

export type CodeModeCaptureFrame = Omit<CaptureFrame, "screenshot"> & {
	readonly screenshot: ScreenshotHandle;
};

export type CodeModeAppState = Omit<AppState, "screenshotBase64" | "captureFrame"> & {
	readonly screenshot: ScreenshotHandle;
	readonly captureFrame?: CodeModeCaptureFrame;
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

export type CodeModeActionMethod =
	| "axPress"
	| "axPressAtPosition"
	| "coordinateClick"
	| "move"
	| "drag"
	| "scroll"
	| "type"
	| "pressKeys";

export type CodeModeActionPostObservation = {
	readonly screenshot: ScreenshotHandle;
	readonly captureId?: string;
	readonly displayEpoch?: string;
	readonly axChangeSummary?: AxTreeChangeSummary;
	readonly elementCount?: number;
};

export type CodeModeActionResult = {
	readonly actionId: string;
	readonly method: CodeModeActionMethod;
	readonly postAction: CodeModeActionPostObservation;
};

export interface CodeModeApi {
	screenshot(options?: CodeModeScreenshotOptions): ScreenshotHandle;
	getAppState(app?: CodeModeAppTarget, options?: AppStateOptions): CodeModeAppState;
	listApps(): readonly AppInfo[];
	click(app: CodeModeAppTarget, target: CodeModeClickTarget): CodeModeActionResult;
	doubleClick(app: CodeModeAppTarget, target: CodeModePointerTarget): CodeModeActionResult;
	rightClick(app: CodeModeAppTarget, target: CodeModePointerTarget): CodeModeActionResult;
	move(app: CodeModeAppTarget, position: Point): CodeModeActionResult;
	drag(app: CodeModeAppTarget, options: CodeModeDragOptions): CodeModeActionResult;
	scroll(app: CodeModeAppTarget, options: CodeModeScrollOptions): CodeModeActionResult;
	type(app: CodeModeAppTarget, text: string): CodeModeActionResult;
	pressKeys(
		app: CodeModeAppTarget,
		keys: readonly CodeModeKeyInput[],
		options?: CodeModePressKeysOptions,
	): CodeModeActionResult;
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
