import type { AppState, CaptureFrame, ComputerInterface, Rect } from "@macos-cua/core";
import { describe, expect, it, vi } from "vitest";

import type { ExtensionContext } from "../pi/index.js";
import { BatchParams } from "./batch-schema.js";
import { createBatchTool } from "./batch.js";

function createCaptureFrame(
	windowBounds: Rect,
	model: { readonly width: number; readonly height: number },
): CaptureFrame {
	return {
		captureId: "capture-batch-1",
		capturedAt: "2026-06-18T00:00:00.000Z",
		displayEpoch: "display-batch-1",
		target: { pid: 1234, bundleId: "com.apple.finder", appName: "Finder" },
		windowBounds,
		screenshot: model,
		model,
		display: { logical: windowBounds, native: model, scaleFactor: 1 },
		screenshotWidth: model.width,
		screenshotHeight: model.height,
	};
}

function createAppState(captureFrame: CaptureFrame): AppState {
	return {
		app: "Finder",
		bundleId: "com.apple.finder",
		pid: 1234,
		frontmost: true,
		axAvailable: true,
		elements: [],
		screenshotBase64: Buffer.from("png-bytes").toString("base64"),
		screenshotWidth: captureFrame.model.width,
		screenshotHeight: captureFrame.model.height,
		screenshotMimeType: "image/png",
		display: { width: captureFrame.display.native.width, height: captureFrame.display.native.height, scaleFactor: 1 },
		captureFrame,
		windowBounds: captureFrame.windowBounds,
	};
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
		click: vi.fn<ComputerInterface["click"]>().mockResolvedValue(undefined),
		rightClick: vi.fn<ComputerInterface["rightClick"]>().mockResolvedValue(undefined),
		middleClick: vi.fn<ComputerInterface["middleClick"]>().mockResolvedValue(undefined),
		doubleClick: vi.fn<ComputerInterface["doubleClick"]>(),
		type: vi.fn<ComputerInterface["type"]>().mockResolvedValue(undefined),
		key: vi.fn<ComputerInterface["key"]>(),
		scroll: vi.fn<ComputerInterface["scroll"]>(),
		drag: vi.fn<ComputerInterface["drag"]>(),
		getCursorPosition: vi.fn<ComputerInterface["getCursorPosition"]>().mockResolvedValue({ x: 0, y: 0 }),
		getScreenSize: vi.fn<ComputerInterface["getScreenSize"]>(),
		getAppState: vi
			.fn<ComputerInterface["getAppState"]>()
			.mockResolvedValue(
				createAppState(
					createCaptureFrame({ x: 300, y: 150, width: 1000, height: 800 }, { width: 500, height: 400 }),
				),
			),
		getScreenshotViewport: vi
			.fn<ComputerInterface["getScreenshotViewport"]>()
			.mockResolvedValue(createCaptureFrame({ x: 0, y: 0, width: 100, height: 80 }, { width: 100, height: 80 })),
		listApps: vi
			.fn<ComputerInterface["listApps"]>()
			.mockResolvedValue([{ name: "Finder", bundleId: "com.apple.finder", pid: 1234, isRunning: true }]),
		setValue: vi.fn<ComputerInterface["setValue"]>(),
		selectText: vi.fn<ComputerInterface["selectText"]>(),
		performAction: vi.fn<ComputerInterface["performAction"]>(),
		pressAtPosition: vi.fn<ComputerInterface["pressAtPosition"]>().mockResolvedValue(false),
		typeIntoFocused: vi.fn<ComputerInterface["typeIntoFocused"]>().mockResolvedValue(false),
		close: vi.fn<ComputerInterface["close"]>(),
	};
}

describe("#given Pi batch tool #when actions run #then results describe each step", () => {
	it("#given two actions #when batch executes #then it runs actions in order", async () => {
		const computer = createComputer();
		const tool = createBatchTool(computer);

		const result = await tool.execute(
			"batch-call",
			{
				actions: [
					{ action: "get_app_state", app: "Finder" },
					{ action: "type_text", app: "Finder", text: "hello" },
				],
			},
			undefined,
			undefined,
			{} as ExtensionContext,
		);

		const getAppStateOrder = vi.mocked(computer.getAppState).mock.invocationCallOrder[0];
		const typeOrder = vi.mocked(computer.type).mock.invocationCallOrder[0];
		expect(getAppStateOrder).toBeLessThan(typeOrder);
		expect(result.details).toMatchObject({
			ok: true,
			type: "batch",
			actionCount: 2,
			steps: [
				{ index: 0, action: "get_app_state", status: "success" },
				{ index: 1, action: "type_text", status: "success" },
			],
		});
	});

	it("#given get_app_state then coordinate click #when batch executes #then click uses the in-batch capture frame", async () => {
		const computer = createComputer();
		const tool = createBatchTool(computer);

		await tool.execute(
			"batch-call",
			{
				actions: [
					{ action: "get_app_state", app: "Finder" },
					{ action: "click", app: "Finder", x: 250, y: 200 },
				],
			},
			undefined,
			undefined,
			{} as ExtensionContext,
		);

		expect(computer.pressAtPosition).toHaveBeenCalledWith(1234, { x: 800, y: 550 });
		expect(computer.click).toHaveBeenCalledWith({ x: 800, y: 550 });
	});

	it("#given an out of bounds coordinate #when batch executes #then it stops on first failure", async () => {
		const computer = createComputer();
		const tool = createBatchTool(computer);

		const result = await tool.execute(
			"batch-call",
			{
				actions: [
					{ action: "get_app_state", app: "Finder" },
					{ action: "click", app: "Finder", x: 501, y: 200 },
					{ action: "type_text", app: "Finder", text: "must not type" },
				],
			},
			undefined,
			undefined,
			{} as ExtensionContext,
		);

		expect(computer.type).not.toHaveBeenCalled();
		expect(result.details).toMatchObject({
			ok: false,
			type: "batch",
			actionCount: 3,
			failedStep: 1,
			steps: [
				{ index: 0, action: "get_app_state", status: "success" },
				{ index: 1, action: "click", status: "error", code: "OUT_OF_BOUNDS_COORDINATE" },
			],
		});
	});
});

describe("#given Pi batch schema #when serialized #then discrete action contracts match standalone tools", () => {
	it("#given coordinate actions #when schemas are read #then capture freshness fields are accepted", () => {
		const clickProperties = actionProperties("click");
		const dragProperties = actionProperties("drag");

		expect(Object.keys(clickProperties)).toEqual(expect.arrayContaining(["capture_id", "display_epoch", "x", "y"]));
		expect(Object.keys(dragProperties)).toEqual(
			expect.arrayContaining(["capture_id", "display_epoch", "from_x", "from_y", "to_x", "to_y"]),
		);
	});

	it("#given deferred scroll delta fields #when schemas are read #then batch still rejects item five fields", () => {
		const scrollProperties = actionProperties("scroll");
		const scrollSchema = actionSchema("scroll");

		expect(scrollProperties).not.toHaveProperty("scroll_x");
		expect(scrollProperties).not.toHaveProperty("scroll_y");
		expect(scrollSchema).toHaveProperty("additionalProperties", false);
	});
});

function actionProperties(actionName: string): Record<string, unknown> {
	const schema = actionSchema(actionName);
	const properties = schema["properties"];
	if (!isRecord(properties)) {
		throw new Error(`Batch action ${actionName} is missing schema properties`);
	}
	return properties;
}

function actionSchema(actionName: string): Record<string, unknown> {
	const rootProperties = propertyRecord(BatchParams, "properties");
	const actions = propertyRecord(rootProperties, "actions");
	const items = propertyRecord(actions, "items");
	const anyOf = items["anyOf"];
	if (!Array.isArray(anyOf)) {
		throw new Error("Batch action schema is missing anyOf variants");
	}
	const match = anyOf.find((candidate) => actionNameFor(candidate) === actionName);
	if (!isRecord(match)) {
		throw new Error(`Batch action ${actionName} schema was not found`);
	}
	return match;
}

function propertyRecord(source: unknown, key: string): Record<string, unknown> {
	if (!isRecord(source)) {
		throw new Error(`Expected an object while reading ${key}`);
	}
	const value = source[key];
	if (!isRecord(value)) {
		throw new Error(`Expected ${key} to be an object`);
	}
	return value;
}

function actionNameFor(candidate: unknown): string | undefined {
	if (!isRecord(candidate)) {
		return undefined;
	}
	const properties = candidate["properties"];
	if (!isRecord(properties)) {
		return undefined;
	}
	const action = properties["action"];
	if (!isRecord(action)) {
		return undefined;
	}
	const actionConst = action["const"];
	return typeof actionConst === "string" ? actionConst : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
