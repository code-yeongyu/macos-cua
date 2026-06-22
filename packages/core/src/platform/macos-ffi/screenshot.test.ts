import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeMock = vi.hoisted(() => {
	const displayId = 7;
	const mainImage = { type: "main-image" };
	const secondaryImage = { type: "secondary-image" };
	const croppedImage = { type: "cropped-image" };
	const cfData = { type: "cf-data" };
	const destination = { type: "destination" };
	const dictionary = { type: "dictionary" };
	const maxPixelSizeNumber = { type: "max-pixel-size-number" };
	const pngType = { type: "cf-string", value: "public.png" };
	const maxPixelSizeKey = { type: "cf-string", value: "kCGImageDestinationImageMaxPixelSize" };

	const pngBytes = globalThis.Buffer.alloc(24);
	pngBytes.write("\u0089PNG\r\n\u001a\n", 0, "latin1");
	pngBytes.writeUInt32BE(600, 16);
	pngBytes.writeUInt32BE(400, 20);

	const coreGraphicsFunctions = {
		CGMainDisplayID: vi.fn(() => displayId),
		CGDisplayBounds: vi.fn((requestedDisplayId: number) =>
			requestedDisplayId === 8
				? { origin: { x: -1200, y: 0 }, size: { width: 1200, height: 800 } }
				: { origin: { x: 0, y: 0 }, size: { width: 800, height: 600 } },
		),
		CGDisplayCreateImage: vi.fn((requestedDisplayId: number) =>
			requestedDisplayId === 8 ? secondaryImage : mainImage,
		),
		CGImageCreateWithImageInRect: vi.fn(() => croppedImage),
		CGDisplayPixelsWide: vi.fn((requestedDisplayId: number) => (requestedDisplayId === 8 ? 2400 : 1600)),
		CGDisplayPixelsHigh: vi.fn((requestedDisplayId: number) => (requestedDisplayId === 8 ? 1600 : 1200)),
		CGGetDisplaysWithRect: vi.fn(
			(
				rect: { readonly origin: { readonly x: number } },
				_maxDisplays: number,
				displays: number[],
				matchingDisplayCount: number[],
			) => {
				displays[0] = rect.origin.x < 0 ? 8 : displayId;
				matchingDisplayCount[0] = 1;
				return 0;
			},
		),
		CGImageGetWidth: vi.fn((image: object) => (image === croppedImage ? 600 : 1600)),
		CGImageGetHeight: vi.fn((image: object) => (image === croppedImage ? 400 : 1200)),
	} satisfies Record<string, unknown>;

	const imageIoFunctions = {
		CGImageDestinationCreateWithData: vi.fn(() => destination),
		CGImageDestinationAddImage: vi.fn(),
		CGImageDestinationFinalize: vi.fn(() => true),
	} satisfies Record<string, unknown>;

	const coreFoundationFunctions = {
		CFGetTypeID: vi.fn(() => 1),
		CFRetain: vi.fn((reference: object) => reference),
		CFStringCreateWithCString: vi.fn((_allocator: null, value: string) =>
			value === "public.png" ? pngType : maxPixelSizeKey,
		),
		CFStringGetLength: vi.fn(() => 0),
		CFStringGetMaximumSizeForEncoding: vi.fn(() => 0),
		CFStringGetCString: vi.fn(() => true),
		CFArrayCreate: vi.fn(),
		CFArrayGetCount: vi.fn(() => 0),
		CFArrayGetValueAtIndex: vi.fn(),
		CFStringGetTypeID: vi.fn(() => 1),
		CFNumberGetTypeID: vi.fn(() => 2),
		CFNumberGetValue: vi.fn(),
		CFBooleanGetTypeID: vi.fn(() => 3),
		CFBooleanGetValue: vi.fn(),
		CFRelease: vi.fn(),
		CFDataCreateMutable: vi.fn(() => cfData),
		CFDataGetLength: vi.fn(() => pngBytes.byteLength),
		CFDataGetBytes: vi.fn((_data: object, _range: object, buffer: Buffer) => pngBytes.copy(buffer)),
		CFDictionaryCreateMutable: vi.fn(() => dictionary),
		CFDictionarySetValue: vi.fn(),
		CFNumberCreate: vi.fn(() => maxPixelSizeNumber),
	} satisfies Record<string, unknown>;

	function libraryFor(path: string): Record<string, unknown> {
		if (path === "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") {
			return coreGraphicsFunctions;
		}
		if (path === "/System/Library/Frameworks/ImageIO.framework/ImageIO") {
			return imageIoFunctions;
		}
		if (path === "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation") {
			return coreFoundationFunctions;
		}
		throw new Error(`Unexpected library: ${path}`);
	}

	return {
		croppedImage,
		mainImage,
		secondaryImage,
		coreFoundationFunctions,
		coreGraphicsFunctions,
		imageIoFunctions,
		sckitModule: {
			captureMainDisplayPngViaSck: vi.fn(),
			isSckitAvailable: vi.fn(() => true),
		},
		module: {
			load: vi.fn((path: string) => ({
				func: vi.fn((name: string | number) => {
					const nativeFunctions = libraryFor(path);
					const nativeFunction = nativeFunctions[nativeFunctionName(name)];
					if (nativeFunction === undefined) {
						throw new Error(`Unexpected native function: ${String(name)}`);
					}
					return nativeFunction;
				}),
			})),
			opaque: vi.fn(() => ({ type: "opaque" })),
			pointer: vi.fn((name: unknown) => ({ type: "pointer", name })),
			struct: vi.fn((name: string, fields: object) => ({ type: "struct", name, fields })),
			out: vi.fn((type: unknown) => ({ type: "out", inner: type })),
		},
	};
});

vi.mock("koffi", () => nativeMock.module);
vi.mock("./sckit.js", () => nativeMock.sckitModule);

import { captureDisplayRectPng, computeCropPixels } from "./screenshot.js";

function nativeFunctionName(name: string | number): string {
	const source = String(name);
	const prototypeMatch = source.match(/\s([A-Za-z_][A-Za-z0-9_]*)\(/);
	return prototypeMatch?.[1] ?? source;
}

beforeEach(() => {
	for (const nativeFunction of Object.values(nativeMock.coreGraphicsFunctions)) {
		nativeFunction.mockClear();
	}
	for (const nativeFunction of Object.values(nativeMock.imageIoFunctions)) {
		nativeFunction.mockClear();
	}
	for (const nativeFunction of Object.values(nativeMock.coreFoundationFunctions)) {
		nativeFunction.mockClear();
	}
	nativeMock.sckitModule.captureMainDisplayPngViaSck.mockClear();
	nativeMock.sckitModule.isSckitAvailable.mockClear();
});

describe("#given a logical screenshot rect #when computing crop pixels #then native pixel bounds contain the rect", () => {
	it("floors the origin and ceils the far edge at the display scale", () => {
		const crop = computeCropPixels({ x: 10.25, y: 20.5, width: 30.25, height: 40.25 }, 2);

		expect(crop).toEqual({ x: 20, y: 41, width: 61, height: 81 });
	});
});

describe("#given a malformed logical screenshot rect #when computing crop pixels #then input is rejected before capture", () => {
	it("requires a finite positive scale factor", () => {
		expect(() => computeCropPixels({ x: 0, y: 0, width: 100, height: 100 }, 0)).toThrow(
			"computeCropPixels requires a finite positive scaleFactor",
		);
	});
});

describe("#given a valid display rect #when capturing a region screenshot #then it crops the main CG image", () => {
	it("binds and calls the CG image-in-rect crop with native-pixel crop bounds", () => {
		const result = captureDisplayRectPng({ x: 100, y: 50, width: 300, height: 200 });

		expect(result).toMatchObject({ width: 600, height: 400 });
		expect(nativeMock.coreGraphicsFunctions.CGDisplayCreateImage).toHaveBeenCalledWith(7);
		expect(nativeMock.coreGraphicsFunctions.CGImageCreateWithImageInRect).toHaveBeenCalledWith(nativeMock.mainImage, {
			origin: { x: 200, y: 100 },
			size: { width: 600, height: 400 },
		});
		expect(nativeMock.sckitModule.isSckitAvailable).not.toHaveBeenCalled();
		expect(nativeMock.sckitModule.captureMainDisplayPngViaSck).not.toHaveBeenCalled();
		expect(nativeMock.coreFoundationFunctions.CFRelease).toHaveBeenCalledWith(nativeMock.croppedImage);
		expect(nativeMock.coreFoundationFunctions.CFRelease).toHaveBeenCalledWith(nativeMock.mainImage);
	});
});

describe("#given a display rect on a non-main negative-origin display #when capturing a region screenshot #then it crops that display image", () => {
	it("selects the display intersecting the rect and crops relative to that display origin", () => {
		const result = captureDisplayRectPng({ x: -1100, y: 50, width: 300, height: 200 });

		expect(result).toMatchObject({ width: 600, height: 400 });
		expect(nativeMock.coreGraphicsFunctions.CGGetDisplaysWithRect).toHaveBeenCalledWith(
			{ origin: { x: -1100, y: 50 }, size: { width: 300, height: 200 } },
			1,
			expect.any(Array),
			expect.any(Array),
		);
		expect(nativeMock.coreGraphicsFunctions.CGDisplayCreateImage).toHaveBeenCalledWith(8);
		expect(nativeMock.coreGraphicsFunctions.CGImageCreateWithImageInRect).toHaveBeenCalledWith(
			nativeMock.secondaryImage,
			{
				origin: { x: 200, y: 100 },
				size: { width: 600, height: 400 },
			},
		);
	});
});

describe("#given an out-of-bounds display rect #when capturing a region screenshot #then bounds are named in the error", () => {
	it("rejects before creating a cropped image", () => {
		expect(() => captureDisplayRectPng({ x: 790, y: 0, width: 20, height: 100 })).toThrow(
			"outside selected display bounds 0,0,800,600",
		);
		expect(nativeMock.coreGraphicsFunctions.CGImageCreateWithImageInRect).not.toHaveBeenCalled();
	});
});

describe("#given an invalid display rect #when capturing a region screenshot #then input is rejected before capture", () => {
	it("requires positive rect dimensions", () => {
		expect(() => captureDisplayRectPng({ x: 0, y: 0, width: 0, height: 100 })).toThrow(
			"captureDisplayRectPng requires positive rect dimensions",
		);
	});
});

describe("#given a malformed display rect #when capturing a region screenshot #then finite values are required", () => {
	it("requires finite coordinates and dimensions", () => {
		expect(() => captureDisplayRectPng({ x: Number.NaN, y: 0, width: 100, height: 100 })).toThrow(
			"captureDisplayRectPng requires finite rect coordinates and dimensions",
		);
	});
});
