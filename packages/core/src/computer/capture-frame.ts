import type { Point, Rect, Size } from "../types/index.js";
import { type ScreenshotViewport, screenRectToScreenshot, screenshotPointToScreen } from "./viewport.js";

export type CaptureFrameTarget = {
	readonly pid: number;
	readonly bundleId?: string;
	readonly appName?: string;
};

export type CaptureFrameDisplay = {
	readonly logical: Rect;
	readonly native: Size;
	readonly scaleFactor: number;
	readonly id?: string;
	readonly name?: string;
};

export type CaptureFrameCursor = {
	readonly before?: Point;
	readonly after?: Point;
};

export interface CaptureFrame extends ScreenshotViewport {
	readonly captureId: string;
	readonly capturedAt: string;
	readonly displayEpoch: string;
	readonly target: CaptureFrameTarget;
	readonly screenshot: Size;
	readonly model: Size;
	readonly display: CaptureFrameDisplay;
	readonly cursor?: CaptureFrameCursor;
}

export type CaptureFreshnessMarker = {
	readonly captureId: string;
	readonly displayEpoch: string;
};

export type CaptureFrameInput = {
	readonly captureId: string;
	readonly capturedAt: string;
	readonly displayEpoch: string;
	readonly target: CaptureFrameTarget;
	readonly windowBounds: Rect;
	readonly screenshot: Size;
	readonly model: Size;
	readonly display: CaptureFrameDisplay;
	readonly cursor?: CaptureFrameCursor;
};

export type CaptureFrameTransform = {
	readonly modelPointToScreen: (point: Point, freshness?: CaptureFreshnessMarker) => Point;
	readonly screenRectToModel: (frame: Rect) => Rect;
};

export function createCaptureFrame(input: CaptureFrameInput): CaptureFrame {
	return {
		...input,
		screenshotWidth: input.model.width,
		screenshotHeight: input.model.height,
	};
}

export function captureFrameToViewport(frame: CaptureFrame): ScreenshotViewport {
	return {
		windowBounds: frame.windowBounds,
		screenshotWidth: frame.model.width,
		screenshotHeight: frame.model.height,
	};
}

export function createCaptureFrameTransform(frame: CaptureFrame): CaptureFrameTransform {
	return {
		modelPointToScreen: (point, freshness) => screenshotPointToScreen(point, frame, freshness),
		screenRectToModel: (rect) => screenRectToScreenshot(rect, captureFrameToViewport(frame)),
	};
}
