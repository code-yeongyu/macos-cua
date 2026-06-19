import { type ComputerInterface, type Point, type Rect, type ScreenshotResult, createDebugLog } from "@macos-cua/core";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PNG } from "pngjs";

import type { ComputerUseResult } from "../anthropic-computer-use.js";
import type { DisplayConfig } from "./coords.js";

const CURSOR_FILL = { red: 255, green: 59, blue: 48, alpha: 255 } as const;
const CURSOR_RING = { red: 255, green: 255, blue: 255, alpha: 255 } as const;
const CURSOR_RADIUS_PIXELS = 5;
const CURSOR_RING_RADIUS_PIXELS = 7;
const logCoords = createDebugLog("coords");

type CursorScreenshotComputer = Pick<ComputerInterface, "getCursorPosition" | "screenshot">;
type Rgba = {
	readonly red: number;
	readonly green: number;
	readonly blue: number;
	readonly alpha: number;
};
export type ScreenshotCursorMetadata = {
	readonly captureFrame: {
		readonly width: number;
		readonly height: number;
	};
	readonly cursor: {
		readonly logical: Point;
		readonly image: Point;
	};
};
export type ScreenshotResultWithCursorMetadata = {
	readonly result: ComputerUseResult;
	readonly metadata: ScreenshotCursorMetadata;
};

export async function screenshotResultWithCursor(
	computer: CursorScreenshotComputer,
	display: DisplayConfig,
): Promise<ComputerUseResult> {
	return (await screenshotResultWithCursorMetadata(computer, display)).result;
}

export async function screenshotResultWithCursorMetadata(
	computer: CursorScreenshotComputer,
	display: DisplayConfig,
): Promise<ScreenshotResultWithCursorMetadata> {
	const captureFrame = { width: display.modelWidth, height: display.modelHeight };
	const screenshot = await computer.screenshot({
		targetSize: captureFrame,
	});
	const cursor = await computer.getCursorPosition();
	const exactScreenshot = ensureModelDimensions(screenshot, display);
	const cursorImage = cursorImagePoint(cursor, display, {
		width: exactScreenshot.width,
		height: exactScreenshot.height,
	});
	return {
		result: imageResult(drawCursorOnScreenshot(exactScreenshot, cursor, display).toString("base64")),
		metadata: { captureFrame, cursor: { logical: cursor, image: cursorImage } },
	};
}

export function drawCursorOnScreenshot(screenshot: ScreenshotResult, cursor: Point, display: DisplayConfig): Buffer {
	const png = decodePngOrUndefined(screenshot.data);
	if (png === undefined) {
		return screenshot.data;
	}
	const center = cursorImagePoint(cursor, display, { width: png.width, height: png.height });
	drawDisc(png, center, CURSOR_RING_RADIUS_PIXELS, CURSOR_RING);
	drawDisc(png, center, CURSOR_RADIUS_PIXELS, CURSOR_FILL);
	return PNG.sync.write(png);
}

export async function drawCursorOnWindowScreenshot(
	imageBytes: Buffer,
	cursor: Point,
	windowBounds: Rect,
): Promise<Buffer> {
	if (!containsPoint(windowBounds, cursor)) {
		return imageBytes;
	}
	const image = await decodeImageOrUndefined(imageBytes);
	if (image === undefined) {
		return imageBytes;
	}
	const canvas = createCanvas(image.width, image.height);
	const context = canvas.getContext("2d");
	context.drawImage(image, 0, 0);
	const center = {
		x: clamp(Math.round((cursor.x - windowBounds.x) * (image.width / windowBounds.width)), 0, image.width - 1),
		y: clamp(Math.round((cursor.y - windowBounds.y) * (image.height / windowBounds.height)), 0, image.height - 1),
	};
	drawCanvasDisc(context, center, CURSOR_RING_RADIUS_PIXELS, CURSOR_RING);
	drawCanvasDisc(context, center, CURSOR_RADIUS_PIXELS, CURSOR_FILL);
	return canvas.toBuffer("image/png");
}

function containsPoint(rect: Rect, point: Point): boolean {
	return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
}

function imageResult(pngBase64: string): ComputerUseResult {
	return { content: [{ type: "image", data: pngBase64, mimeType: "image/png" }], details: undefined };
}

function cursorImagePoint(
	cursor: Point,
	display: DisplayConfig,
	imageSize: { readonly width: number; readonly height: number },
): Point {
	return {
		x: clamp(Math.round(cursor.x * (imageSize.width / display.logicalWidth)), 0, imageSize.width - 1),
		y: clamp(Math.round(cursor.y * (imageSize.height / display.logicalHeight)), 0, imageSize.height - 1),
	};
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

function drawCanvasDisc(
	context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
	center: Point,
	radius: number,
	color: Rgba,
): void {
	context.fillStyle = `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha / 255})`;
	context.beginPath();
	context.arc(center.x, center.y, radius, 0, Math.PI * 2);
	context.fill();
}

function ensureModelDimensions(screenshot: ScreenshotResult, display: DisplayConfig): ScreenshotResult {
	const png = decodePngOrUndefined(screenshot.data);
	if (png === undefined) {
		return screenshot;
	}
	logCoords("screenshot-dimensions", {
		actualWidth: png.width,
		actualHeight: png.height,
		expectedWidth: display.modelWidth,
		expectedHeight: display.modelHeight,
		exact: png.width === display.modelWidth && png.height === display.modelHeight,
	});
	if (png.width === display.modelWidth && png.height === display.modelHeight) {
		return screenshot;
	}
	logCoords("screenshot-dimensions-mismatch", {
		actualWidth: png.width,
		actualHeight: png.height,
		expectedWidth: display.modelWidth,
		expectedHeight: display.modelHeight,
	});
	const resized = resizePng(png, display.modelWidth, display.modelHeight);
	return {
		...screenshot,
		data: PNG.sync.write(resized),
		width: display.modelWidth,
		height: display.modelHeight,
	};
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

async function decodeImageOrUndefined(data: Buffer): Promise<Awaited<ReturnType<typeof loadImage>> | undefined> {
	try {
		return await loadImage(data);
	} catch (error) {
		if (error instanceof Error) {
			return undefined;
		}
		throw error;
	}
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}
