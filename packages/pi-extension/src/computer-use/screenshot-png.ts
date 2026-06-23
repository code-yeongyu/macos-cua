import { type Point, type ScreenshotResult, createDebugLog } from "@macos-cua/core";
import { PNG } from "pngjs";

import type { DisplayConfig } from "./coords.js";
import {
	CURSOR_FILL,
	CURSOR_RADIUS_PIXELS,
	CURSOR_RING,
	CURSOR_RING_RADIUS_PIXELS,
	type Rgba,
	clamp,
	containsDisplayPoint,
	cursorImagePoint,
} from "./screenshot-cursor-geometry.js";
import type { ScreenshotFidelityMetadata } from "./screenshot-result.js";

const logCoords = createDebugLog("coords");
type ScreenshotFidelityWithoutByteCount = Omit<ScreenshotFidelityMetadata, "byteCount">;

export function drawCursorOnScreenshot(screenshot: ScreenshotResult, cursor: Point, display: DisplayConfig): Buffer {
	const png = decodePngOrUndefined(screenshot.data);
	if (png === undefined) {
		return screenshot.data;
	}
	if (!containsDisplayPoint(display, cursor)) {
		return screenshot.data;
	}
	const center = cursorImagePoint(cursor, display, { width: png.width, height: png.height });
	drawDisc(png, center, CURSOR_RING_RADIUS_PIXELS, CURSOR_RING);
	drawDisc(png, center, CURSOR_RADIUS_PIXELS, CURSOR_FILL);
	return PNG.sync.write(png);
}

export function ensureModelDimensions(
	screenshot: ScreenshotResult,
	display: DisplayConfig,
): { readonly screenshot: ScreenshotResult; readonly fidelity: ScreenshotFidelityWithoutByteCount } {
	const png = decodePngOrUndefined(screenshot.data);
	if (png === undefined) {
		return {
			screenshot,
			fidelity: fidelityForExactDimensions(
				screenshot.mimeType,
				{ width: screenshot.width, height: screenshot.height },
				display,
			),
		};
	}
	logCoords("screenshot-dimensions", {
		actualWidth: png.width,
		actualHeight: png.height,
		expectedWidth: display.modelWidth,
		expectedHeight: display.modelHeight,
		exact: png.width === display.modelWidth && png.height === display.modelHeight,
	});
	if (png.width === display.modelWidth && png.height === display.modelHeight) {
		return {
			screenshot,
			fidelity: fidelityForExactDimensions(screenshot.mimeType, { width: png.width, height: png.height }, display),
		};
	}
	logCoords("screenshot-dimensions-mismatch", {
		actualWidth: png.width,
		actualHeight: png.height,
		expectedWidth: display.modelWidth,
		expectedHeight: display.modelHeight,
	});
	const resized = resizePng(png, display.modelWidth, display.modelHeight);
	return {
		screenshot: {
			...screenshot,
			data: PNG.sync.write(resized),
			mimeType: "image/png",
			width: display.modelWidth,
			height: display.modelHeight,
		},
		fidelity: {
			format: "image/png",
			downgraded: true,
			reason: "capture_dimensions_mismatch",
			actual: { width: png.width, height: png.height },
			target: { width: display.modelWidth, height: display.modelHeight },
		},
	};
}

function fidelityForExactDimensions(
	format: ScreenshotResult["mimeType"],
	actual: { readonly width: number; readonly height: number },
	display: DisplayConfig,
): ScreenshotFidelityWithoutByteCount {
	const original = { width: display.logicalWidth, height: display.logicalHeight };
	const target = { width: display.modelWidth, height: display.modelHeight };
	if (target.width < original.width || target.height < original.height) {
		return { format, downgraded: true, reason: "adaptive_target_downscale", actual, original, target };
	}
	return { format, downgraded: false, actual, target };
}

function drawDisc(png: PNG, center: Point, radius: number, color: Rgba): void {
	const minX = clamp(Math.floor(center.x - radius), 0, png.width - 1);
	const maxX = clamp(Math.ceil(center.x + radius), 0, png.width - 1);
	const minY = clamp(Math.floor(center.y - radius), 0, png.height - 1);
	const maxY = clamp(Math.ceil(center.y + radius), 0, png.height - 1);
	const radiusSquared = radius * radius;

	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			const dx = x - center.x;
			const dy = y - center.y;
			if (dx * dx + dy * dy <= radiusSquared) {
				setPixel(png, x, y, color);
			}
		}
	}
}

function resizePng(source: PNG, width: number, height: number): PNG {
	const target = new PNG({ width, height });
	for (let y = 0; y < height; y += 1) {
		const sourceY = clamp(Math.floor(y * (source.height / height)), 0, source.height - 1);
		for (let x = 0; x < width; x += 1) {
			const sourceX = clamp(Math.floor(x * (source.width / width)), 0, source.width - 1);
			const sourceOffset = (source.width * sourceY + sourceX) * 4;
			const targetOffset = (width * y + x) * 4;
			target.data[targetOffset] = source.data[sourceOffset] ?? 0;
			target.data[targetOffset + 1] = source.data[sourceOffset + 1] ?? 0;
			target.data[targetOffset + 2] = source.data[sourceOffset + 2] ?? 0;
			target.data[targetOffset + 3] = source.data[sourceOffset + 3] ?? 255;
		}
	}
	return target;
}

function setPixel(png: PNG, x: number, y: number, color: Rgba): void {
	const offset = (png.width * y + x) * 4;
	png.data[offset] = color.red;
	png.data[offset + 1] = color.green;
	png.data[offset + 2] = color.blue;
	png.data[offset + 3] = color.alpha;
}

function decodePngOrUndefined(data: Buffer): PNG | undefined {
	try {
		return PNG.sync.read(data);
	} catch (error) {
		if (error instanceof Error) {
			return undefined;
		}
		throw error;
	}
}
