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

export type ScreenshotDowngradeStatus = {
	readonly reason: string;
	readonly original?: Size;
	readonly format?: "image/png" | "image/jpeg";
};

export type ScreenshotCoordinateMetadata = {
	readonly width: number;
	readonly height: number;
	readonly originX: number;
	readonly originY: number;
	readonly scaleX: number;
	readonly scaleY: number;
	readonly captureId: string;
	readonly displayEpoch: string;
	readonly byteLength?: number;
	readonly mimeType?: "image/png" | "image/jpeg";
	readonly downgrade?: ScreenshotDowngradeStatus;
};

export type ScreenshotCoordinateMetadataInput = {
	readonly byteLength?: number;
	readonly mimeType?: "image/png" | "image/jpeg";
	readonly downgrade?: ScreenshotDowngradeStatus;
};

export interface CaptureFrame extends ScreenshotViewport {
	readonly captureId: string;
	readonly capturedAt: string;
	readonly displayEpoch: string;
	readonly target: CaptureFrameTarget;
	readonly screenshot: Size;
	readonly model: Size;
	readonly screenshotMetadata: ScreenshotCoordinateMetadata;
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
	readonly screenshotMetadata?: ScreenshotCoordinateMetadata;
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
		screenshotMetadata: input.screenshotMetadata ?? screenshotMetadataForCaptureFrameInput(input),
		screenshotWidth: input.model.width,
		screenshotHeight: input.model.height,
	};
}

export function screenshotMetadataForCaptureFrame(
	frame: CaptureFrame,
	input: ScreenshotCoordinateMetadataInput = {},
): ScreenshotCoordinateMetadata {
	return {
		captureId: frame.captureId,
		displayEpoch: frame.displayEpoch,
		height: frame.model.height,
		originX: 0,
		originY: 0,
		scaleX: frame.model.width / frame.windowBounds.width,
		scaleY: frame.model.height / frame.windowBounds.height,
		width: frame.model.width,
		...(input.byteLength !== undefined ? { byteLength: input.byteLength } : {}),
		...(input.downgrade !== undefined ? { downgrade: input.downgrade } : {}),
		...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
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

function screenshotMetadataForCaptureFrameInput(input: CaptureFrameInput): ScreenshotCoordinateMetadata {
	return {
		captureId: input.captureId,
		displayEpoch: input.displayEpoch,
		height: input.model.height,
		originX: 0,
		originY: 0,
		scaleX: input.model.width / input.windowBounds.width,
		scaleY: input.model.height / input.windowBounds.height,
		width: input.model.width,
	};
}
