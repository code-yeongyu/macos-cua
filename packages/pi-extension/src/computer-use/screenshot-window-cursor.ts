import type { Point, Rect } from "@macos-cua/core";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import {
	CURSOR_FILL,
	CURSOR_RADIUS_PIXELS,
	CURSOR_RING,
	CURSOR_RING_RADIUS_PIXELS,
	type Rgba,
	clamp,
	containsPoint,
} from "./screenshot-cursor-geometry.js";

type CanvasContext = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;

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

function drawCanvasDisc(context: CanvasContext, center: Point, radius: number, color: Rgba): void {
	context.fillStyle = `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha / 255})`;
	context.beginPath();
	context.arc(center.x, center.y, radius, 0, Math.PI * 2);
	context.fill();
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
