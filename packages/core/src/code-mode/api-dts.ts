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

interface CodeModeCaptureFrameTarget {
	readonly pid: number;
	readonly bundleId?: string;
	readonly appName?: string;
}

interface CodeModeCaptureFrameDisplay {
	readonly logical: Rect;
	readonly native: Size;
	readonly scaleFactor: number;
	readonly id?: string;
	readonly name?: string;
}

interface CodeModeCaptureFrameCursor {
	readonly before?: Point;
	readonly after?: Point;
}

interface CodeModeCaptureFrame {
	readonly captureId: string;
	readonly capturedAt: string;
	readonly displayEpoch: string;
	readonly target: CodeModeCaptureFrameTarget;
	readonly windowBounds: Rect;
	readonly screenshotWidth: number;
	readonly screenshotHeight: number;
	readonly screenshot: ScreenshotHandle;
	readonly model: Size;
	readonly display: CodeModeCaptureFrameDisplay;
	readonly cursor?: CodeModeCaptureFrameCursor;
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
	readonly captureFrame?: CodeModeCaptureFrame;
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

type CodeModeActionMethod =
	| "axPress"
	| "axPressAtPosition"
	| "coordinateClick"
	| "move"
	| "drag"
	| "scroll"
	| "type"
	| "pressKeys";

interface CodeModeActionPostObservation {
	readonly screenshot: ScreenshotHandle;
	readonly captureId?: string;
	readonly displayEpoch?: string;
	readonly axChangeSummary?: AxTreeChangeSummary;
	readonly elementCount?: number;
}

interface CodeModeActionResult {
	readonly actionId: string;
	readonly method: CodeModeActionMethod;
	readonly postAction: CodeModeActionPostObservation;
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
	click(app: CodeModeAppTarget, target: CodeModeClickTarget): CodeModeActionResult;
	doubleClick(app: CodeModeAppTarget, target: CodeModePointerTarget): CodeModeActionResult;
	rightClick(app: CodeModeAppTarget, target: CodeModePointerTarget): CodeModeActionResult;
	move(app: CodeModeAppTarget, position: Point): CodeModeActionResult;
	drag(app: CodeModeAppTarget, options: CodeModeDragOptions): CodeModeActionResult;
	scroll(app: CodeModeAppTarget, options: CodeModeScrollOptions): CodeModeActionResult;
	type(app: CodeModeAppTarget, text: string): CodeModeActionResult;
	pressKeys(app: CodeModeAppTarget, keys: readonly CodeModeKeyInput[], options?: CodeModePressKeysOptions): CodeModeActionResult;
	setValue(app: CodeModeAppTarget, elementIndex: number, value: string): void;
	selectText(app: CodeModeAppTarget, elementIndex: number, options: CodeModeSelectTextOptions): void;
	performAction(app: CodeModeAppTarget, elementIndex: number, action: string): void;
	getCursorPosition(): Point;
}

declare const mac: CodeModeApi;
declare function surface(handle: ScreenshotHandle): void;
`;
