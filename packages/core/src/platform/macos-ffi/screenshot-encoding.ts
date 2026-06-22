import type { KoffiFunc } from "koffi";
import { type CFTypeRef, cfRelease, withCFString } from "./corefoundation.js";
import { koffi } from "./koffi.js";

type CGImageRef = CFTypeRef;
type CGImageDestinationRef = CFTypeRef;
type CFMutableDataRef = CFTypeRef;
type CFNumberRef = CFTypeRef;
type CFMutableDictionaryRef = CFTypeRef;
type CFRange = { location: number; length: number };

const CF_RANGE = koffi.struct("CFRange", { location: "long", length: "long" });
const CG_IMAGE_DESTINATION_REF = koffi.pointer("CGImageDestinationRef", koffi.opaque());
const CF_MUTABLE_DATA_REF = koffi.pointer("CFMutableDataRef", koffi.opaque());
const CF_MUTABLE_DICTIONARY_REF = koffi.pointer("CFMutableDictionaryRef", koffi.opaque());
const CF_NUMBER_REF = koffi.pointer("CFNumberRef", koffi.opaque());

const imageIO = koffi.load("/System/Library/Frameworks/ImageIO.framework/ImageIO");
const coreFoundation = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");

const PNG_UNIFORM_TYPE = "public.png";
const MAX_PIXEL_SIZE_KEY = "kCGImageDestinationImageMaxPixelSize";
const CF_NUMBER_INT_TYPE = 9;

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
	"void *",
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

export function computeAspectPreservedDimensions(
	sourceWidth: number,
	sourceHeight: number,
	maxPixelSize: number,
): { readonly width: number; readonly height: number } {
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

export function encodeImageAsPng(image: CGImageRef, maxPixelSize: number): Buffer {
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
					return encodeImageWithProperties(image, pngType, properties);
				} finally {
					cfRelease(properties);
				}
			} finally {
				cfRelease(maxPixelSizeValue);
			}
		}),
	);
}

function encodeImageWithProperties(image: CGImageRef, pngType: CFTypeRef, properties: CFMutableDictionaryRef): Buffer {
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
}
