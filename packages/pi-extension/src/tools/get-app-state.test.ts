import type { AppState, CaptureFrame, ScreenshotCoordinateMetadata } from "@macos-cua/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCodexComputerUseSection, buildComputerUseSection } from "../anthropic-computer-use.js";
import type { ExtensionContext } from "../pi/index.js";
import { createGetAppStateTool } from "./get-app-state.js";
import {
	createComputer,
	imageContent,
	parseStateText,
	primaryText,
	stateWith,
} from "./test-support/get-app-state-harness.js";

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
		expect(tool.description).toContain("screenshot pixels");
		expect(tool.description).toContain("fresh screenshot");
		expect(tool.description).toContain("Do not guess");
		expect(prompt).toContain("numbered boxes");
		expect(prompt).toContain("element_index labels");
		expect(prompt).toContain("click element_index=<number>");
	});
});
