import type { AppState, CaptureFrame, ComputerInterface, ScreenshotCoordinateMetadata } from "@macos-cua/core";
import { createCanvas } from "@napi-rs/canvas";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCodexComputerUseSection, buildComputerUseSection } from "../anthropic-computer-use.js";
import type { ExtensionContext } from "../pi/index.js";
import { createGetAppStateTool } from "./get-app-state.js";

const coreMocks = vi.hoisted(() => {
	const getAppStateForAppMock = vi.fn();
	const overlayLogMock = vi.fn();
	const createDebugLogMock = vi.fn((scope: string) => (scope === "overlay" ? overlayLogMock : vi.fn()));
	const screenshotMetadataForCaptureFrameMock = vi.fn(
		(frame: CaptureFrame): ScreenshotCoordinateMetadata => ({
			captureId: frame.captureId,
			displayEpoch: frame.displayEpoch,
			height: frame.model.height,
			originX: 0,
			originY: 0,
			scaleX: frame.model.width / frame.windowBounds.width,
			scaleY: frame.model.height / frame.windowBounds.height,
			width: frame.model.width,
		}),
	);
	const modelFacingAppStateMock = vi.fn((state: AppState): object => {
		const screenshotMetadata =
			state.screenshotMetadata ??
			(state.captureFrame !== undefined ? screenshotMetadataForCaptureFrameMock(state.captureFrame) : undefined);
		return {
			...state,
			...(screenshotMetadata !== undefined ? { screenshotMetadata } : {}),
			screenshotBase64: undefined,
		};
	});
	return {
		createDebugLogMock,
		getAppStateForAppMock,
		modelFacingAppStateMock,
		overlayLogMock,
		screenshotMetadataForCaptureFrameMock,
	};
});

vi.mock("@macos-cua/core", () => ({
	createDebugLog: coreMocks.createDebugLogMock,
	getAppStateForApp: coreMocks.getAppStateForAppMock,
	modelFacingAppState: coreMocks.modelFacingAppStateMock,
	screenshotMetadataForCaptureFrame: coreMocks.screenshotMetadataForCaptureFrameMock,
}));

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
		screenshotHeight: 120,
		screenshotWidth: 160,
		target: { appName: "Fixture", bundleId: "com.example.fixture", pid: 42 },
		windowBounds: { x: 10, y: 20, width: 160, height: 120 },
	},
	windowBounds: { x: 10, y: 20, width: 160, height: 120 },
};

afterEach(() => {
	vi.restoreAllMocks();
	coreMocks.getAppStateForAppMock.mockReset();
	coreMocks.overlayLogMock.mockReset();
	coreMocks.createDebugLogMock.mockClear();
	coreMocks.modelFacingAppStateMock.mockClear();
	coreMocks.screenshotMetadataForCaptureFrameMock.mockClear();
});

describe("#given SoM marks are available #when get_app_state executes #then the screenshot is annotated and state JSON preserves ids", () => {
	it("returns changed image bytes with the original details and AX element ids", async () => {
		const state = stateWith();
		coreMocks.getAppStateForAppMock.mockResolvedValue(state);
		const tool = createGetAppStateTool(createComputer());

		const result = await tool.execute("call-1", { app: "Fixture" }, undefined, undefined, {} as ExtensionContext);

		const image = imageContent(result.content);
		const text = primaryText(result.content);
		const parsed = parseStateText(text);
		const annotatedChanged = image.data !== state.screenshotBase64;
		const idConsistent =
			parsed.elements.length === state.elements.length &&
			parsed.elements.every((element, index) => element.id === state.elements[index]?.id);
		expect(image.mimeType).toBe("image/png");
		expect(Buffer.from(image.data, "base64").subarray(0, 8)).toEqual(
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		);
		expect(annotatedChanged).toBe(true);
		expect(parsed.screenshotBase64).toBeUndefined();
		expect(parsed.screenshotMetadata).toMatchObject({ captureId: "capture-fixture-1", width: 160, height: 120 });
		expect(text).toContain('"id": 7');
		expect(text).toContain('"screenshotWidth": 160');
		expect(text).toContain('"screenshotHeight": 120');
		expect(text).toContain('"windowBounds"');
		expect(idConsistent).toBe(true);
		expect(result.details).toBe(state);
		expect(coreMocks.overlayLogMock).toHaveBeenCalledWith("annotated", { marks: 2, dropped: 0 });
	});
});

describe("#given a state without window bounds #when get_app_state executes #then the raw screenshot is returned and skipped", () => {
	it("keeps the screenshot bytes and details unchanged", async () => {
		const state = stateWith({ windowBounds: undefined });
		coreMocks.getAppStateForAppMock.mockResolvedValue(state);
		const tool = createGetAppStateTool(createComputer());

		const result = await tool.execute("call-1", { app: "Fixture" }, undefined, undefined, {} as ExtensionContext);
		const expectedImageData = state.screenshotBase64;

		expect(imageContent(result.content)).toMatchObject({
			type: "image",
			data: expectedImageData,
			mimeType: "image/png",
		});
		const parsed = parseStateText(primaryText(result.content));
		expect(parsed.screenshotBase64).toBeUndefined();
		expect(parsed.screenshotMetadata).toMatchObject({ captureId: "capture-fixture-1", width: 160, height: 120 });
		expect(result.details).toBe(state);
		expect(coreMocks.overlayLogMock).toHaveBeenCalledWith("skip", {
			reason: "no_window_bounds",
			marks: 0,
			dropped: 0,
		});
	});
});

describe("#given capture-frame metadata #when get_app_state returns text #then coordinate frame metadata is self describing", () => {
	it("#given a screenshot-bearing state #when serialized #then coordinate frame metadata is top-level and screenshotBase64 is omitted", async () => {
		const state = stateWith();
		coreMocks.getAppStateForAppMock.mockResolvedValue(state);
		const tool = createGetAppStateTool(createComputer());

		const result = await tool.execute("call-1", { app: "Fixture" }, undefined, undefined, {} as ExtensionContext);
		const parsed = parseStateText(primaryText(result.content));

		expect(parsed.screenshotMetadata).toMatchObject({
			captureId: "capture-fixture-1",
			displayEpoch: "160x120@1",
			height: 120,
			originX: 0,
			originY: 0,
			scaleX: 1,
			scaleY: 1,
			width: 160,
		});
		expect(parsed.screenshotBase64).toBeUndefined();
	});
});

describe("#given get_app_state and prompt text #when read by a model #then numbered boxes are described as element_index labels", () => {
	it("guides models to prefer element_index clicks when possible", () => {
		const tool = createGetAppStateTool(createComputer());
		const prompt = `${buildComputerUseSection(1280, 720)}\n${buildCodexComputerUseSection()}`;

		expect(tool.description).toContain("numbered boxes");
		expect(tool.description).toContain("element_index");
		expect(prompt).toContain("numbered boxes");
		expect(prompt).toContain("element_index labels");
		expect(prompt).toContain("click element_index=<number>");
	});
});

function stateWith(overrides: Partial<AppState> = {}): AppState {
	return { ...BASE_STATE, ...overrides };
}

function fixturePngBase64(): string {
	const canvas = createCanvas(160, 120);
	const context = canvas.getContext("2d");
	context.fillStyle = "#f8fafc";
	context.fillRect(0, 0, 160, 120);
	return canvas.toBuffer("image/png").toString("base64");
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

function primaryText(content: readonly { readonly type: string }[]): string {
	const text = content.find((entry) => entry.type === "text" && "text" in entry);
	if (text === undefined || text.type !== "text" || !("text" in text) || typeof text.text !== "string") {
		throw new Error("missing text content");
	}
	return text.text;
}

function parseStateText(text: string): {
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
