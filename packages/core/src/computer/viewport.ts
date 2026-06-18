import type { Point, Rect, Size } from "../types/index.js";
import type { CaptureFrame, CaptureFreshnessMarker } from "./capture-frame.js";
import { ComputerUseError } from "./errors.js";

/** Longest screenshot edge sent to the model, matching the native full-display path. */
export const MAX_SCREENSHOT_LONG_EDGE = 1280;

/**
 * Everything needed to translate between the window screenshot the model sees and
 * the host's global logical screen coordinates.
 *
 * `get_app_state` captures a screenshot of a single app window, so the model's
 * coordinates are pixels relative to that window image — not global screen
 * points. Clicking, dragging, and reading the accessibility tree all need this
 * viewport to convert between the two spaces.
 */
export interface ScreenshotViewport {
	/** Target window rect in global logical screen points (top-left origin). */
	readonly windowBounds: Rect;
	/** Pixel width of the screenshot shown to the model. */
	readonly screenshotWidth: number;
	/** Pixel height of the screenshot shown to the model. */
	readonly screenshotHeight: number;
}

/**
 * Pixel dimensions for a window screenshot, preserving the window aspect ratio
 * and capping the long edge. Mirrors `resolveDisplayConfig` for the full display
 * so window and display screenshots scale the same way.
 */
export function resolveWindowScreenshotSize(window: Size, maxLongEdge = MAX_SCREENSHOT_LONG_EDGE): Size {
	const width = assertPositiveFinite(window.width, "width");
	const height = assertPositiveFinite(window.height, "height");
	const longEdge = Math.max(width, height);
	if (longEdge <= maxLongEdge) {
		return { width: Math.round(width), height: Math.round(height) };
	}
	const scale = maxLongEdge / longEdge;
	return {
		width: Math.max(1, Math.floor(width * scale)),
		height: Math.max(1, Math.floor(height * scale)),
	};
}

/**
 * Map a screenshot pixel coordinate (relative to the window screenshot or model
 * capture frame) to a global logical screen point.
 */
export function screenshotPointToScreen(
	point: Point,
	viewport: ScreenshotViewport | CaptureFrame,
	freshness?: CaptureFreshnessMarker,
): Point {
	assertFreshCapture(viewport, freshness);
	const { windowBounds } = viewport;
	const captureSize = modelSizeFor(viewport);
	assertPointInsideCapture(point, captureSize);
	const fractionX = point.x / captureSize.width;
	const fractionY = point.y / captureSize.height;
	return {
		x: Math.round(windowBounds.x + fractionX * windowBounds.width),
		y: Math.round(windowBounds.y + fractionY * windowBounds.height),
	};
}

/**
 * Map a global-screen accessibility frame into the window screenshot's pixel
 * space, so the accessibility tree the model reads shares one coordinate system
 * with the screenshot it clicks in. The inverse of {@link screenshotPointToScreen}.
 */
export function screenRectToScreenshot(frame: Rect, viewport: ScreenshotViewport): Rect {
	const { windowBounds } = viewport;
	const scaleX = viewport.screenshotWidth / assertPositiveFinite(windowBounds.width, "windowBounds.width");
	const scaleY = viewport.screenshotHeight / assertPositiveFinite(windowBounds.height, "windowBounds.height");
	return {
		x: Math.round((frame.x - windowBounds.x) * scaleX),
		y: Math.round((frame.y - windowBounds.y) * scaleY),
		width: Math.round(frame.width * scaleX),
		height: Math.round(frame.height * scaleY),
	};
}

function assertPositiveFinite(value: number, name: string): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${name} must be a positive finite number`);
	}
	return value;
}

function modelSizeFor(viewport: ScreenshotViewport | CaptureFrame): Size {
	if ("model" in viewport) {
		return {
			width: assertPositiveFinite(viewport.model.width, "model.width"),
			height: assertPositiveFinite(viewport.model.height, "model.height"),
		};
	}
	return {
		width: assertPositiveFinite(viewport.screenshotWidth, "screenshotWidth"),
		height: assertPositiveFinite(viewport.screenshotHeight, "screenshotHeight"),
	};
}

function assertPointInsideCapture(point: Point, size: Size): void {
	if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0) {
		throwOutOfBounds(point, size);
	}
	if (point.x > size.width || point.y > size.height) {
		throwOutOfBounds(point, size);
	}
}

function assertFreshCapture(
	viewport: ScreenshotViewport | CaptureFrame,
	freshness: CaptureFreshnessMarker | undefined,
): void {
	if (freshness === undefined || !("captureId" in viewport)) {
		return;
	}
	if (viewport.captureId !== freshness.captureId || viewport.displayEpoch !== freshness.displayEpoch) {
		throw new ComputerUseError(
			"STALE_CAPTURE",
			`Capture ${viewport.captureId} is stale for display epoch ${freshness.displayEpoch}`,
			{
				details: {
					captureId: viewport.captureId,
					expectedCaptureId: freshness.captureId,
					displayEpoch: viewport.displayEpoch,
					expectedDisplayEpoch: freshness.displayEpoch,
				},
			},
		);
	}
}

function throwOutOfBounds(point: Point, size: Size): never {
	throw new ComputerUseError(
		"OUT_OF_BOUNDS_COORDINATE",
		`Point (${point.x}, ${point.y}) is outside capture frame ${size.width}x${size.height}`,
		{
			details: {
				x: Number.isFinite(point.x) ? point.x : String(point.x),
				y: Number.isFinite(point.y) ? point.y : String(point.y),
				width: size.width,
				height: size.height,
			},
		},
	);
}
