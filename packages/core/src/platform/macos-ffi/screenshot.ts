import type { KoffiFunc } from "koffi";
import type { Rect } from "../../types/index.js";
import { type CFTypeRef, cfRelease, withCFString } from "./corefoundation.js";
import { koffi } from "./koffi.js";
import { captureMainDisplayPngViaSck, isSckitAvailable } from "./sckit.js";

type CGImageRef = CFTypeRef;
type CGImageDestinationRef = CFTypeRef;
type CFMutableDataRef = CFTypeRef;
type CFNumberRef = CFTypeRef;
type CFMutableDictionaryRef = CFTypeRef;

type CGPoint = { x: number; y: number };
type CGSize = { width: number; height: number };
type CGRect = { origin: CGPoint; size: CGSize };
type CFRange = { location: number; length: number };

const CG_POINT = koffi.struct("CGPointForScreenshot", { x: "double", y: "double" });
const CG_SIZE = koffi.struct("CGSize", { width: "double", height: "double" });
const CG_RECT = koffi.struct("CGRect", { origin: CG_POINT, size: CG_SIZE });
const CF_RANGE = koffi.struct("CFRange", { location: "long", length: "long" });

const CG_IMAGE_REF = koffi.pointer("CGImageRef", koffi.opaque());
const CG_IMAGE_DESTINATION_REF = koffi.pointer("CGImageDestinationRef", koffi.opaque());
const CF_MUTABLE_DATA_REF = koffi.pointer("CFMutableDataRef", koffi.opaque());
const CF_MUTABLE_DICTIONARY_REF = koffi.pointer("CFMutableDictionaryRef", koffi.opaque());
const CF_NUMBER_REF = koffi.pointer("CFNumberRef", koffi.opaque());

const coreGraphics = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
const imageIO = koffi.load("/System/Library/Frameworks/ImageIO.framework/ImageIO");
const coreFoundation = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");

const PNG_UNIFORM_TYPE = "public.png";
const MAX_PIXEL_SIZE_KEY = "kCGImageDestinationImageMaxPixelSize";
const CF_NUMBER_INT_TYPE = 9;

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

const CGImageGetWidth = coreGraphics.func("CGImageGetWidth", "size_t", [CG_IMAGE_REF]) as KoffiFunc<
	(image: CGImageRef) => number
>;

const CGImageGetHeight = coreGraphics.func("CGImageGetHeight", "size_t", [CG_IMAGE_REF]) as KoffiFunc<
	(image: CGImageRef) => number
>;

const CGImageDestinationCreateWithData = imageIO.func("CGImageDestinationCreateWithData", CG_IMAGE_DESTINATION_REF, [
	"void *",
	"void *",
	"size_t",
	"void *",
]) as KoffiFunc<
	(data: CFMutableDataRef, type: CFTypeRef, count: number, options: null) => CGImageDestinationRef | null
>;

const CGImageDestinationAddImage = imageIO.func("CGImageDestinationAddImage", "void", [
	CG_IMAGE_DESTINATION_REF,
	CG_IMAGE_REF,
	CF_MUTABLE_DICTIONARY_REF,
]) as KoffiFunc<
	(destination: CGImageDestinationRef, image: CGImageRef, properties: CFMutableDictionaryRef | null) => void
>;

const CGImageDestinationFinalize = imageIO.func("CGImageDestinationFinalize", "bool", [
	CG_IMAGE_DESTINATION_REF,
]) as KoffiFunc<(destination: CGImageDestinationRef) => boolean>;

const CFDataCreateMutable = coreFoundation.func("CFDataCreateMutable", CF_MUTABLE_DATA_REF, [
	"void *",
	"long",
]) as KoffiFunc<(allocator: null, capacity: number) => CFMutableDataRef | null>;

const CFDataGetLength = coreFoundation.func("CFDataGetLength", "long", ["void *"]) as KoffiFunc<
	(data: CFMutableDataRef) => number
>;

const CFDataGetBytes = coreFoundation.func("CFDataGetBytes", "void", ["void *", CF_RANGE, "char *"]) as KoffiFunc<
	(data: CFMutableDataRef, range: CFRange, buffer: Buffer) => void
>;

const CFDictionaryCreateMutable = coreFoundation.func("CFDictionaryCreateMutable", CF_MUTABLE_DICTIONARY_REF, [
	"void *",
	"long",
	"void *",
	"void *",
]) as KoffiFunc<
	(allocator: null, capacity: number, keyCallBacks: null, valueCallBacks: null) => CFMutableDictionaryRef | null
>;

const CFDictionarySetValue = coreFoundation.func("CFDictionarySetValue", "void", [
	CF_MUTABLE_DICTIONARY_REF,
	"void *",
	"void *",
]) as KoffiFunc<(dict: CFMutableDictionaryRef, key: CFTypeRef, value: CFTypeRef) => void>;

const CFNumberCreate = coreFoundation.func("CFNumberCreate", CF_NUMBER_REF, ["void *", "int", "void *"]) as KoffiFunc<
	(allocator: null, numberType: number, valuePtr: Buffer) => CFNumberRef | null
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

	const displayId = CGMainDisplayID();
	const displayBounds = CGDisplayBounds(displayId);
	assertRectInsideBounds(rect, displayBounds);
	const sourceImage = CGDisplayCreateImage(displayId);
	if (sourceImage === null) {
		throw new Error("CGDisplayCreateImage returned null (Screen Recording permission may be missing)");
	}

	try {
		const cropPixels = computeCropPixels(rect, computeMainDisplayScaleFactor(displayId, displayBounds));
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

function computeMainDisplayScaleFactor(displayId: number, bounds: CGRect): number {
	if (bounds.size.width <= 0 || bounds.size.height <= 0) {
		const boundsRect = {
			x: bounds.origin.x,
			y: bounds.origin.y,
			width: bounds.size.width,
			height: bounds.size.height,
		};
		throw new Error(`main display has invalid logical bounds ${formatRect(boundsRect)}`);
	}
	const scaleX = CGDisplayPixelsWide(displayId) / bounds.size.width;
	const scaleY = CGDisplayPixelsHigh(displayId) / bounds.size.height;
	return Math.max(scaleX, scaleY);
}

function formatRect(rect: Rect): string {
	return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}

function computeAspectPreservedDimensions(
	sourceWidth: number,
	sourceHeight: number,
	maxPixelSize: number,
): { width: number; height: number } {
	const longestSourceEdge = Math.max(sourceWidth, sourceHeight);
	if (longestSourceEdge <= maxPixelSize) {
		return { width: sourceWidth, height: sourceHeight };
	}
	const scale = maxPixelSize / longestSourceEdge;
	return {
		width: Math.max(1, Math.round(sourceWidth * scale)),
		height: Math.max(1, Math.round(sourceHeight * scale)),
	};
}

function encodeImageAsPng(image: CGImageRef, maxPixelSize: number): Buffer {
	return withCFString(PNG_UNIFORM_TYPE, (pngType) =>
		withCFString(MAX_PIXEL_SIZE_KEY, (maxPixelSizeKey) => {
			const valueBytes = Buffer.alloc(4);
			valueBytes.writeInt32LE(maxPixelSize, 0);

			const maxPixelSizeValue = CFNumberCreate(null, CF_NUMBER_INT_TYPE, valueBytes);
			if (maxPixelSizeValue === null) {
				throw new Error("CFNumberCreate returned null for maxPixelSize");
			}

			try {
				const properties = CFDictionaryCreateMutable(null, 0, null, null);
				if (properties === null) {
					throw new Error("CFDictionaryCreateMutable returned null");
				}

				try {
					CFDictionarySetValue(properties, maxPixelSizeKey, maxPixelSizeValue);

					const cfData = CFDataCreateMutable(null, 0);
					if (cfData === null) {
						throw new Error("CFDataCreateMutable returned null");
					}

					try {
						const destination = CGImageDestinationCreateWithData(cfData, pngType, 1, null);
						if (destination === null) {
							throw new Error("CGImageDestinationCreateWithData returned null");
						}

						try {
							CGImageDestinationAddImage(destination, image, properties);
							if (!CGImageDestinationFinalize(destination)) {
								throw new Error("CGImageDestinationFinalize returned false");
							}

							const length = CFDataGetLength(cfData);
							if (length <= 0) {
								throw new Error(`PNG encode produced no bytes (length=${length})`);
							}

							const buffer = Buffer.alloc(length);
							CFDataGetBytes(cfData, { location: 0, length }, buffer);
							return buffer;
						} finally {
							cfRelease(destination);
						}
					} finally {
						cfRelease(cfData);
					}
				} finally {
					cfRelease(properties);
				}
			} finally {
				cfRelease(maxPixelSizeValue);
			}
		}),
	);
}
