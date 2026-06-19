/// <reference path="../computer-use/pngjs.d.ts" />

import type { AppState, ComputerInterface } from "@macos-cua/core";
import { createCanvas } from "@napi-rs/canvas";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExtensionContext } from "../pi/index.js";
import { createGetAppStateTool } from "./get-app-state.js";

const coreMocks = vi.hoisted(() => ({
	createDebugLogMock: vi.fn(() => vi.fn()),
	getAppStateForAppMock: vi.fn(),
}));

vi.mock("@macos-cua/core", () => ({
	createDebugLog: coreMocks.createDebugLogMock,
	getAppStateForApp: coreMocks.getAppStateForAppMock,
}));

const BASE_STATE: AppState = {
	app: "Fixture",
	bundleId: "com.example.fixture",
	pid: 42,
	frontmost: true,
	axAvailable: true,
	elements: [],
	screenshotBase64: fixturePngBase64(),
	screenshotWidth: 160,
	screenshotHeight: 120,
	screenshotMimeType: "image/png",
	display: { width: 160, height: 120, scaleFactor: 1 },
	windowBounds: { x: 10, y: 20, width: 160, height: 120 },
};

const CURSOR_RED = [255, 59, 48, 255] as const;
const TEST_CONTEXT = {} as ExtensionContext;

afterEach(() => {
	vi.restoreAllMocks();
	coreMocks.getAppStateForAppMock.mockReset();
	coreMocks.createDebugLogMock.mockClear();
});

describe("#given cursor metadata #when get_app_state executes #then the returned screenshot includes the virtual cursor", () => {
	it("#given a PNG cursor inside the app window #when image is returned #then the cursor is drawn in screenshot pixels", async () => {
		const state = stateWith({ observation: observationWithCursor({ x: 30, y: 40 }, "image/png") });
		coreMocks.getAppStateForAppMock.mockResolvedValue(state);
		const tool = createGetAppStateTool(createComputer());

		const result = await tool.execute("call-1", { app: "Fixture" }, undefined, undefined, TEST_CONTEXT);

		const image = PNG.sync.read(Buffer.from(imageContent(result.content).data, "base64"));
		expect(pixelAt(image, 20, 20)).toEqual(CURSOR_RED);
	});

	it("#given a JPEG screenshot without SoM marks #when image is returned #then the cursor is drawn and returned as PNG", async () => {
		const state = stateWith({
			screenshotBase64: fixtureJpegBase64(),
			screenshotMimeType: "image/jpeg",
			observation: observationWithCursor({ x: 30, y: 40 }, "image/jpeg"),
		});
		coreMocks.getAppStateForAppMock.mockResolvedValue(state);
		const tool = createGetAppStateTool(createComputer());

		const result = await tool.execute("call-1", { app: "Fixture" }, undefined, undefined, TEST_CONTEXT);

		const content = imageContent(result.content);
		const image = PNG.sync.read(Buffer.from(content.data, "base64"));
		expect(content.mimeType).toBe("image/png");
		expect(pixelAt(image, 20, 20)).toEqual(CURSOR_RED);
	});

	it("#given a cursor outside the app window #when image is returned #then no false edge cursor is drawn", async () => {
		const state = stateWith({ observation: observationWithCursor({ x: 500, y: 500 }, "image/png") });
		coreMocks.getAppStateForAppMock.mockResolvedValue(state);
		const tool = createGetAppStateTool(createComputer());

		const result = await tool.execute("call-1", { app: "Fixture" }, undefined, undefined, TEST_CONTEXT);

		expect(imageContent(result.content).data).toBe(state.screenshotBase64);
	});
});

function stateWith(overrides: Partial<AppState> = {}): AppState {
	return { ...BASE_STATE, ...overrides };
}

function observationWithCursor(
	cursor: { readonly x: number; readonly y: number },
	mimeType: string,
): AppState["observation"] {
	return {
		app: { name: "Fixture", bundleId: "com.example.fixture", pid: 42, frontmost: false },
		ax: { available: true, elementCount: 0 },
		capture: {
			captureId: "capture-1",
			capturedAt: "2026-06-18T00:00:00.000Z",
			displayEpoch: "160x120@1",
			model: { width: 160, height: 120 },
			screenshot: { width: 160, height: 120, mimeType },
			target: { name: "Fixture", bundleId: "com.example.fixture", pid: 42 },
		},
		cursor,
		display: {
			epoch: "160x120@1",
			logical: { x: 0, y: 0, width: 160, height: 120 },
			native: { width: 160, height: 120 },
			scaleFactor: 1,
		},
		freshness: { captureId: "capture-1", displayEpoch: "160x120@1", stale: false },
		window: { bounds: { x: 10, y: 20, width: 160, height: 120 } },
	};
}

function fixturePngBase64(): string {
	return fixtureImageBase64("image/png");
}

function fixtureJpegBase64(): string {
	return fixtureImageBase64("image/jpeg");
}

function fixtureImageBase64(mimeType: "image/png" | "image/jpeg"): string {
	const canvas = createCanvas(160, 120);
	const context = canvas.getContext("2d");
	context.fillStyle = "#f8fafc";
	context.fillRect(0, 0, 160, 120);
	return canvas.toBuffer(mimeType).toString("base64");
}

function imageContent(content: readonly { readonly type: string }[]): {
	readonly type: "image";
	readonly data: string;
	readonly mimeType: string;
} {
	const image = content.find((entry) => entry.type === "image");
	if (image === undefined || image.type !== "image" || !("data" in image) || !("mimeType" in image)) {
		throw new Error("missing image content");
	}
	if (typeof image.data !== "string" || typeof image.mimeType !== "string") {
		throw new Error("invalid image content");
	}
	return { type: image.type, data: image.data, mimeType: image.mimeType };
}

function pixelAt(png: PNG, x: number, y: number): readonly number[] {
	const offset = (png.width * y + x) * 4;
	return [png.data[offset], png.data[offset + 1], png.data[offset + 2], png.data[offset + 3]];
}

function createComputer(): ComputerInterface {
	return {
		capabilities: {
			supportsScreenshot: true,
			supportsInput: true,
			supportsAccessibility: true,
			supportsClipboard: true,
		},
		screenshot: vi.fn<ComputerInterface["screenshot"]>(),
		setTarget: vi.fn<ComputerInterface["setTarget"]>(),
		move: vi.fn<ComputerInterface["move"]>(),
		click: vi.fn<ComputerInterface["click"]>(),
		rightClick: vi.fn<ComputerInterface["rightClick"]>(),
		middleClick: vi.fn<ComputerInterface["middleClick"]>(),
		doubleClick: vi.fn<ComputerInterface["doubleClick"]>(),
		type: vi.fn<ComputerInterface["type"]>(),
		key: vi.fn<ComputerInterface["key"]>(),
		scroll: vi.fn<ComputerInterface["scroll"]>(),
		drag: vi.fn<ComputerInterface["drag"]>(),
		getCursorPosition: vi.fn<ComputerInterface["getCursorPosition"]>(),
		getScreenSize: vi.fn<ComputerInterface["getScreenSize"]>(),
		getAppState: vi.fn<ComputerInterface["getAppState"]>(),
		getScreenshotViewport: vi.fn<ComputerInterface["getScreenshotViewport"]>(),
		listApps: vi.fn<ComputerInterface["listApps"]>(),
		setValue: vi.fn<ComputerInterface["setValue"]>(),
		selectText: vi.fn<ComputerInterface["selectText"]>(),
		performAction: vi.fn<ComputerInterface["performAction"]>(),
		pressAtPosition: vi.fn<ComputerInterface["pressAtPosition"]>(),
		typeIntoFocused: vi.fn<ComputerInterface["typeIntoFocused"]>(),
		close: vi.fn<ComputerInterface["close"]>(),
	};
}
