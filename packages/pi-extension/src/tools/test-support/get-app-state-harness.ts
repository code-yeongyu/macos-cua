import type { AppState, ComputerInterface } from "@macos-cua/core";
import { createCanvas } from "@napi-rs/canvas";
import { vi } from "vitest";

const BASE_STATE: AppState = {
	app: "Fixture",
	bundleId: "com.example.fixture",
	pid: 42,
	frontmost: true,
	axAvailable: true,
	elements: [
		{
			id: 7,
			role: "AXButton",
			label: "OK",
			value: null,
			frame: { x: 30, y: 25, width: 80, height: 32 },
			actions: ["AXPress"],
			children: [],
		},
		{
			id: 11,
			role: "AXTextField",
			label: "Name",
			value: "Fixture",
			frame: { x: 40, y: 70, width: 90, height: 34 },
			actions: ["AXConfirm"],
			children: [],
		},
	],
	screenshotBase64: fixturePngBase64(),
	screenshotWidth: 160,
	screenshotHeight: 120,
	screenshotMimeType: "image/png",
	display: { width: 160, height: 120, scaleFactor: 1 },
	captureFrame: {
		captureId: "capture-fixture-1",
		capturedAt: "2026-06-23T00:00:00.000Z",
		displayEpoch: "160x120@1",
		display: {
			logical: { x: 0, y: 0, width: 160, height: 120 },
			native: { width: 160, height: 120 },
			scaleFactor: 1,
		},
		model: { width: 160, height: 120 },
		screenshot: { width: 160, height: 120 },
		screenshotMetadata: {
			captureId: "capture-fixture-1",
			displayEpoch: "160x120@1",
			height: 120,
			originX: 0,
			originY: 0,
			scaleX: 1,
			scaleY: 1,
			width: 160,
		},
		screenshotHeight: 120,
		screenshotWidth: 160,
		target: { appName: "Fixture", bundleId: "com.example.fixture", pid: 42 },
		windowBounds: { x: 10, y: 20, width: 160, height: 120 },
	},
	windowBounds: { x: 10, y: 20, width: 160, height: 120 },
};

export function stateWith(overrides: Partial<AppState> = {}): AppState {
	return { ...BASE_STATE, ...overrides };
}

export function imageContent(content: readonly { readonly type: string }[]): {
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

export function primaryText(content: readonly { readonly type: string }[]): string {
	const text = content.find((entry) => entry.type === "text" && "text" in entry);
	if (text === undefined || text.type !== "text" || !("text" in text) || typeof text.text !== "string") {
		throw new Error("missing text content");
	}
	return text.text;
}

export function parseStateText(text: string): {
	readonly elements: readonly { readonly id: number }[];
	readonly screenshotBase64?: string;
	readonly screenshotMetadata?: {
		readonly captureId: string;
		readonly displayEpoch: string;
		readonly height: number;
		readonly originX: number;
		readonly originY: number;
		readonly scaleX: number;
		readonly scaleY: number;
		readonly width: number;
	};
} {
	const parsed: unknown = JSON.parse(text);
	if (!isStateWithElementIds(parsed)) {
		throw new Error("state text did not include element ids");
	}
	return parsed;
}

export function createComputer(): ComputerInterface {
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
		openApp: vi.fn<ComputerInterface["openApp"]>().mockResolvedValue({
			name: "Fixture",
			bundleId: "com.example.fixture",
			pid: 42,
			isRunning: true,
		}),
		setValue: vi.fn<ComputerInterface["setValue"]>(),
		selectText: vi.fn<ComputerInterface["selectText"]>(),
		performAction: vi.fn<ComputerInterface["performAction"]>(),
		pressAtPosition: vi.fn<ComputerInterface["pressAtPosition"]>(),
		typeIntoFocused: vi.fn<ComputerInterface["typeIntoFocused"]>(),
		close: vi.fn<ComputerInterface["close"]>(),
	};
}

function fixturePngBase64(): string {
	const canvas = createCanvas(160, 120);
	const context = canvas.getContext("2d");
	context.fillStyle = "#f8fafc";
	context.fillRect(0, 0, 160, 120);
	return canvas.toBuffer("image/png").toString("base64");
}

function isStateWithElementIds(value: unknown): value is {
	readonly elements: readonly { readonly id: number }[];
	readonly screenshotBase64?: string;
	readonly screenshotMetadata?: {
		readonly captureId: string;
		readonly displayEpoch: string;
		readonly height: number;
		readonly originX: number;
		readonly originY: number;
		readonly scaleX: number;
		readonly scaleY: number;
		readonly width: number;
	};
} {
	return (
		typeof value === "object" &&
		value !== null &&
		"elements" in value &&
		Array.isArray(value.elements) &&
		value.elements.every(
			(element) =>
				typeof element === "object" && element !== null && "id" in element && typeof element.id === "number",
		)
	);
}
