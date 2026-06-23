import type { CaptureFrame, ScreenshotCoordinateMetadata } from "../computer/capture-frame.js";
import type { Point } from "../types/index.js";

export interface AXTreeElement {
	id: number;
	role: string;
	label: string | null;
	value: string | null;
	/**
	 * Element bounds. When the screenshot is scoped to a single window
	 * ({@link AppState.windowBounds} is set), the frame is in that window
	 * screenshot's pixel space so it shares one coordinate system with the
	 * screenshot. Otherwise it is in global logical screen points.
	 */
	frame: { x: number; y: number; width: number; height: number };
	actions: string[];
	children: number[];
}

export interface DisplayInfo {
	width: number;
	height: number;
	scaleFactor: number;
}

export interface AxTreeChangeSummary {
	added: number;
	removed: number;
	changed: number;
}

export interface ObservationMetadata {
	readonly app: {
		readonly name: string;
		readonly bundleId: string;
		readonly pid: number;
		readonly frontmost: boolean;
	};
	readonly window?: {
		readonly id?: number;
		readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
	};
	readonly display: {
		readonly epoch: string;
		readonly logical: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
		readonly native: { readonly width: number; readonly height: number };
		readonly scaleFactor: number;
		readonly id?: string;
		readonly name?: string;
	};
	readonly cursor?: Point;
	readonly capture: {
		readonly captureId: string;
		readonly capturedAt: string;
		readonly displayEpoch: string;
		readonly target: {
			readonly name: string;
			readonly bundleId: string;
			readonly pid: number;
		};
		readonly screenshot: {
			readonly width: number;
			readonly height: number;
			readonly mimeType?: "image/png" | "image/jpeg";
		};
		readonly coordinateFrame: ScreenshotCoordinateMetadata;
		readonly model: { readonly width: number; readonly height: number };
	};
	readonly ax: {
		readonly available: boolean;
		readonly elementCount: number;
		readonly changeSummary?: AxTreeChangeSummary;
	};
	readonly freshness: {
		readonly captureId: string;
		readonly displayEpoch: string;
		readonly stale: boolean;
	};
}

export interface AppState {
	app: string;
	bundleId: string;
	pid: number;
	frontmost: boolean;
	axAvailable: boolean;
	elements: AXTreeElement[];
	screenshotBase64: string;
	screenshotWidth: number;
	screenshotHeight: number;
	screenshotMimeType?: "image/png" | "image/jpeg";
	screenshotMetadata?: ScreenshotCoordinateMetadata;
	display: DisplayInfo;
	captureFrame?: CaptureFrame;
	observation?: ObservationMetadata;
	axChangeSummary?: AxTreeChangeSummary;
	appInstructions?: string;
	/**
	 * Target window rect in global logical screen points, present when the
	 * screenshot is scoped to a single app window. Screenshot pixel coordinates
	 * map onto the screen through this rect.
	 */
	windowBounds?: { x: number; y: number; width: number; height: number };
}

export interface SkyshotResult {
	appState: AppState;
	captureTimestampMs: number;
}

export interface AppInfo {
	name: string;
	bundleId: string;
	pid: number;
	isRunning: boolean;
	isFrontmost?: boolean;
	lastUsedDate?: string;
	useCount?: number;
}
