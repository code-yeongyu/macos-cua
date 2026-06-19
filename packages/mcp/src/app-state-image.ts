import type { AppState, Point, Rect } from "@macos-cua/core";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const CURSOR_FILL = "rgba(255, 59, 48, 1)";
const CURSOR_RING = "rgba(255, 255, 255, 0.74)";
const CURSOR_RADIUS_PIXELS = 5;
const CURSOR_RING_RADIUS_PIXELS = 13;

export async function appStateImageContent(state: AppState): Promise<{
	readonly data: string;
	readonly mimeType: "image/png" | "image/jpeg";
}> {
	const baseImage = Buffer.from(state.screenshotBase64, "base64");
	const annotatedImage =
		state.windowBounds !== undefined && state.observation?.cursor !== undefined
			? await drawCursorOnWindowScreenshot(baseImage, state.observation.cursor, state.windowBounds)
			: baseImage;
	return {
		data: annotatedImage.toString("base64"),
		mimeType: annotatedImage.equals(baseImage) ? (state.screenshotMimeType ?? "image/png") : "image/png",
	};
}

async function drawCursorOnWindowScreenshot(imageBytes: Buffer, cursor: Point, windowBounds: Rect): Promise<Buffer> {
	if (!containsPoint(windowBounds, cursor)) {
		return imageBytes;
	}
	const image = await decodeImageOrUndefined(imageBytes);
	if (image === undefined || image.width <= 0 || image.height <= 0) {
		return imageBytes;
	}
	const canvas = createCanvas(image.width, image.height);
	const context = canvas.getContext("2d");
	context.drawImage(image, 0, 0);
	const center = {
		x: clamp(Math.round((cursor.x - windowBounds.x) * (image.width / windowBounds.width)), 0, image.width - 1),
		y: clamp(Math.round((cursor.y - windowBounds.y) * (image.height / windowBounds.height)), 0, image.height - 1),
	};
	drawDisc(context, center, CURSOR_RING_RADIUS_PIXELS, CURSOR_RING);
	drawDisc(context, center, CURSOR_RADIUS_PIXELS, CURSOR_FILL);
	return canvas.toBuffer("image/png");
}

function containsPoint(rect: Rect, point: Point): boolean {
	return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
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

function drawDisc(
	context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
	center: Point,
	radius: number,
	color: string,
): void {
	context.fillStyle = color;
	context.beginPath();
	context.arc(center.x, center.y, radius, 0, Math.PI * 2);
	context.fill();
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}
