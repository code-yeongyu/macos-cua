import type { Point, Rect } from "@macos-cua/core";

import type { DisplayConfig } from "./coords.js";

export const CURSOR_FILL = { red: 255, green: 59, blue: 48, alpha: 255 } as const;
export const CURSOR_RING = { red: 255, green: 255, blue: 255, alpha: 255 } as const;
export const CURSOR_RADIUS_PIXELS = 5;
export const CURSOR_RING_RADIUS_PIXELS = 7;

export type Rgba = {
	readonly red: number;
	readonly green: number;
	readonly blue: number;
	readonly alpha: number;
};

export function containsPoint(rect: Rect, point: Point): boolean {
	return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
}

export function containsDisplayPoint(display: DisplayConfig, point: Point): boolean {
	return point.x >= 0 && point.y >= 0 && point.x < display.logicalWidth && point.y < display.logicalHeight;
}

export function cursorImagePoint(
	cursor: Point,
	display: DisplayConfig,
	imageSize: { readonly width: number; readonly height: number },
): Point {
	return {
		x: clamp(Math.round(cursor.x * (imageSize.width / display.logicalWidth)), 0, imageSize.width - 1),
		y: clamp(Math.round(cursor.y * (imageSize.height / display.logicalHeight)), 0, imageSize.height - 1),
	};
}

export function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}
