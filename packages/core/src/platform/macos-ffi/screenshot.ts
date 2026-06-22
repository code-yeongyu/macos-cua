import type { KoffiFunc } from "koffi";
import type { Rect } from "../../types/index.js";
import { type CFTypeRef, cfRelease } from "./corefoundation.js";
import { koffi } from "./koffi.js";
import { captureMainDisplayPngViaSck, isSckitAvailable } from "./sckit.js";
import { computeAspectPreservedDimensions, encodeImageAsPng } from "./screenshot-encoding.js";

type CGImageRef = CFTypeRef;

type CGPoint = { x: number; y: number };
type CGSize = { width: number; height: number };
type CGRect = { origin: CGPoint; size: CGSize };

const CG_POINT = koffi.struct("CGPointForScreenshot", { x: "double", y: "double" });
const CG_SIZE = koffi.struct("CGSize", { width: "double", height: "double" });
const CG_RECT = koffi.struct("CGRect", { origin: CG_POINT, size: CG_SIZE });

const CG_IMAGE_REF = koffi.pointer("CGImageRef", koffi.opaque());

const coreGraphics = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
const MAX_RECT_DISPLAY_MATCHES = 1;
const CG_SUCCESS = 0;

const CGMainDisplayID = coreGraphics.func("CGMainDisplayID", "uint32_t", []) as KoffiFunc<() => number>;

const CGDisplayBounds = coreGraphics.func("CGDisplayBounds", CG_RECT, ["uint32_t"]) as KoffiFunc<
	(displayId: number) => CGRect
>;

const CGDisplayCreateImage = coreGraphics.func("CGDisplayCreateImage", CG_IMAGE_REF, ["uint32_t"]) as KoffiFunc<
	(displayId: number) => CGImageRef | null
>;

const CGDisplayPixelsWide = coreGraphics.func("CGDisplayPixelsWide", "size_t", ["uint32_t"]) as KoffiFunc<
	(displayId: number) => number
>;

const CGImageCreateWithImageInRect = coreGraphics.func("CGImageCreateWithImageInRect", CG_IMAGE_REF, [
	CG_IMAGE_REF,
	CG_RECT,
]) as KoffiFunc<(image: CGImageRef, rect: CGRect) => CGImageRef | null>;

const CGDisplayPixelsHigh = coreGraphics.func("CGDisplayPixelsHigh", "size_t", ["uint32_t"]) as KoffiFunc<
	(displayId: number) => number
>;

const CGGetDisplaysWithRect = coreGraphics.func("CGGetDisplaysWithRect", "int32_t", [
	CG_RECT,
	"uint32_t",
	"_Out_ uint32_t *",
	"_Out_ uint32_t *",
]) as KoffiFunc<(rect: CGRect, maxDisplays: number, displays: number[], matchingDisplayCount: number[]) => number>;

const CGImageGetWidth = coreGraphics.func("CGImageGetWidth", "size_t", [CG_IMAGE_REF]) as KoffiFunc<
	(image: CGImageRef) => number
>;

const CGImageGetHeight = coreGraphics.func("CGImageGetHeight", "size_t", [CG_IMAGE_REF]) as KoffiFunc<
	(image: CGImageRef) => number
>;

export type CapturedScreenshot = {
	readonly data: Buffer;
	readonly width: number;
	readonly height: number;
};

export function captureMainDisplayPng(targetWidth: number, targetHeight: number): CapturedScreenshot {
	if (targetWidth <= 0 || targetHeight <= 0) {
		throw new Error(`captureMainDisplayPng requires positive dimensions, got ${targetWidth}x${targetHeight}`);
	}

	const maxPixelSize = Math.max(Math.round(targetWidth), Math.round(targetHeight));

	if (isSckitAvailable()) {
		try {
			const captured = captureMainDisplayPngViaSck(targetWidth, targetHeight);
			if (captured !== null) {
				return captured;
			}
		} catch (error) {
			const ignoredSckFailure = error instanceof Error ? error : undefined;
			void ignoredSckFailure;
		}
	}

	const sourceImage = CGDisplayCreateImage(CGMainDisplayID());
	if (sourceImage === null) {
		throw new Error("CGDisplayCreateImage returned null (Screen Recording permission may be missing)");
	}

	try {
		const sourceWidth = CGImageGetWidth(sourceImage);
		const sourceHeight = CGImageGetHeight(sourceImage);
		const pngBytes = encodeImageAsPng(sourceImage, maxPixelSize);
		const outputDimensions = computeAspectPreservedDimensions(sourceWidth, sourceHeight, maxPixelSize);
		return {
			data: pngBytes,
			width: outputDimensions.width,
			height: outputDimensions.height,
		};
	} finally {
		cfRelease(sourceImage);
	}
}

export function captureDisplayRectPng(rect: Rect, maxPixelSize?: number): CapturedScreenshot {
	assertValidRect(rect, "captureDisplayRectPng");
	if (maxPixelSize !== undefined && (!Number.isSafeInteger(maxPixelSize) || maxPixelSize <= 0)) {
		throw new Error(`captureDisplayRectPng requires a positive integer maxPixelSize, got ${maxPixelSize}`);
	}

	const display = displayForRect(rect);
	assertRectInsideBounds(rect, display.bounds);
	const sourceImage = CGDisplayCreateImage(display.id);
	if (sourceImage === null) {
		throw new Error("CGDisplayCreateImage returned null (Screen Recording permission may be missing)");
	}

	try {
		const cropPixels = computeCropPixels(
			rectRelativeToBounds(rect, display.bounds),
			computeDisplayScaleFactor(display.id, display.bounds),
		);
		const croppedImage = CGImageCreateWithImageInRect(sourceImage, {
			origin: { x: cropPixels.x, y: cropPixels.y },
			size: { width: cropPixels.width, height: cropPixels.height },
		});
		if (croppedImage === null) {
			throw new Error(
				`CGImageCreateWithImageInRect returned null for rect ${formatRect(rect)} (Screen Recording permission may be missing)`,
			);
		}

		try {
			const sourceWidth = CGImageGetWidth(croppedImage);
			const sourceHeight = CGImageGetHeight(croppedImage);
			const outputMaxPixelSize = maxPixelSize ?? Math.max(sourceWidth, sourceHeight);
			const pngBytes = encodeImageAsPng(croppedImage, outputMaxPixelSize);
			const outputDimensions = computeAspectPreservedDimensions(sourceWidth, sourceHeight, outputMaxPixelSize);
			return {
				data: pngBytes,
				width: outputDimensions.width,
				height: outputDimensions.height,
			};
		} finally {
			cfRelease(croppedImage);
		}
	} finally {
		cfRelease(sourceImage);
	}
}

export function computeCropPixels(logicalRect: Rect, scaleFactor: number): Rect {
	assertValidRect(logicalRect, "computeCropPixels");
	if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
		throw new Error("computeCropPixels requires a finite positive scaleFactor");
	}

	const left = Math.floor(logicalRect.x * scaleFactor);
	const top = Math.floor(logicalRect.y * scaleFactor);
	const right = Math.ceil((logicalRect.x + logicalRect.width) * scaleFactor);
	const bottom = Math.ceil((logicalRect.y + logicalRect.height) * scaleFactor);
	return {
		x: left,
		y: top,
		width: Math.max(1, right - left),
		height: Math.max(1, bottom - top),
	};
}

export function getMainDisplayNativePixelSize(): { width: number; height: number } {
	const sourceImage = CGDisplayCreateImage(CGMainDisplayID());
	if (sourceImage === null) {
		throw new Error("CGDisplayCreateImage returned null (Screen Recording permission may be missing)");
	}
	try {
		return { width: CGImageGetWidth(sourceImage), height: CGImageGetHeight(sourceImage) };
	} finally {
		cfRelease(sourceImage);
	}
}

export function getMainDisplayLogicalSize(): { width: number; height: number } {
	const bounds = CGDisplayBounds(CGMainDisplayID());
	return {
		width: Math.round(bounds.size.width),
		height: Math.round(bounds.size.height),
	};
}

function assertValidRect(rect: Rect, operation: string): void {
	if (
		!Number.isFinite(rect.x) ||
		!Number.isFinite(rect.y) ||
		!Number.isFinite(rect.width) ||
		!Number.isFinite(rect.height)
	) {
		throw new Error(`${operation} requires finite rect coordinates and dimensions`);
	}
	if (rect.width <= 0 || rect.height <= 0) {
		throw new Error(`${operation} requires positive rect dimensions, got ${rect.width}x${rect.height}`);
	}
}

function assertRectInsideBounds(rect: Rect, bounds: CGRect): void {
	const minX = bounds.origin.x;
	const minY = bounds.origin.y;
	const maxX = bounds.origin.x + bounds.size.width;
	const maxY = bounds.origin.y + bounds.size.height;
	const rectMaxX = rect.x + rect.width;
	const rectMaxY = rect.y + rect.height;
	if (rect.x < minX || rect.y < minY || rectMaxX > maxX || rectMaxY > maxY) {
		const boundsRect = { x: minX, y: minY, width: bounds.size.width, height: bounds.size.height };
		throw new Error(
			`captureDisplayRectPng rect ${formatRect(rect)} is outside main display bounds ${formatRect(boundsRect)}`,
		);
	}
}

function displayForRect(rect: Rect): { readonly id: number; readonly bounds: CGRect } {
	const displays = [CGMainDisplayID()];
	const matchingDisplayCount = [0];
	const result = CGGetDisplaysWithRect(rectToCGRect(rect), MAX_RECT_DISPLAY_MATCHES, displays, matchingDisplayCount);
	const matchedDisplayId = displays[0];
	const matchCount = matchingDisplayCount[0] ?? 0;
	const displayId =
		result === CG_SUCCESS && matchCount > 0 && matchedDisplayId !== undefined ? matchedDisplayId : CGMainDisplayID();
	return { id: displayId, bounds: CGDisplayBounds(displayId) };
}

function rectToCGRect(rect: Rect): CGRect {
	return { origin: { x: rect.x, y: rect.y }, size: { width: rect.width, height: rect.height } };
}

function rectRelativeToBounds(rect: Rect, bounds: CGRect): Rect {
	return { x: rect.x - bounds.origin.x, y: rect.y - bounds.origin.y, width: rect.width, height: rect.height };
}

function computeDisplayScaleFactor(displayId: number, bounds: CGRect): number {
	if (bounds.size.width <= 0 || bounds.size.height <= 0) {
		const boundsRect = {
			x: bounds.origin.x,
			y: bounds.origin.y,
			width: bounds.size.width,
			height: bounds.size.height,
		};
		throw new Error(`display ${displayId} has invalid logical bounds ${formatRect(boundsRect)}`);
	}
	const scaleX = CGDisplayPixelsWide(displayId) / bounds.size.width;
	const scaleY = CGDisplayPixelsHigh(displayId) / bounds.size.height;
	return Math.max(scaleX, scaleY);
}

function formatRect(rect: Rect): string {
	return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}
