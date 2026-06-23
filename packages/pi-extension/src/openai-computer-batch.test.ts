import { describe, expect, it, vi } from "vitest";

import { type ComputerActionDriver, ComputerUseError } from "./anthropic-computer-use.js";
import type { DisplayConfig } from "./computer-use/coords.js";
import { executeOpenAIComputerActionBatch } from "./openai-computer-batch.js";
import { executeOpenAIComputerAction } from "./openai-computer-use.js";

const DISPLAY = {
	logicalWidth: 200,
	logicalHeight: 200,
	modelWidth: 100,
	modelHeight: 100,
} satisfies DisplayConfig;

function createComputer(): ComputerActionDriver {
	return {
		capabilities: {
			supportsScreenshot: true,
			supportsInput: true,
			supportsAccessibility: true,
			supportsClipboard: true,
		},
		screenshot: vi.fn<ComputerActionDriver["screenshot"]>().mockResolvedValue({
			data: Buffer.from("png"),
			mimeType: "image/png",
			width: 100,
			height: 100,
		}),
		setTarget: vi.fn<ComputerActionDriver["setTarget"]>(),
		move: vi.fn<ComputerActionDriver["move"]>().mockResolvedValue(undefined),
		click: vi.fn<ComputerActionDriver["click"]>().mockResolvedValue(undefined),
		rightClick: vi.fn<ComputerActionDriver["rightClick"]>().mockResolvedValue(undefined),
		middleClick: vi.fn<ComputerActionDriver["middleClick"]>().mockResolvedValue(undefined),
		doubleClick: vi.fn<ComputerActionDriver["doubleClick"]>().mockResolvedValue(undefined),
		type: vi.fn<ComputerActionDriver["type"]>().mockResolvedValue(undefined),
		key: vi.fn<ComputerActionDriver["key"]>().mockResolvedValue(undefined),
		scroll: vi.fn<ComputerActionDriver["scroll"]>().mockResolvedValue(undefined),
		drag: vi.fn<ComputerActionDriver["drag"]>().mockResolvedValue(undefined),
		getCursorPosition: vi.fn<ComputerActionDriver["getCursorPosition"]>().mockResolvedValue({ x: 7, y: 9 }),
		getScreenSize: vi.fn<ComputerActionDriver["getScreenSize"]>().mockResolvedValue({ width: 100, height: 100 }),
		getScreenshotViewport: vi.fn<ComputerActionDriver["getScreenshotViewport"]>().mockResolvedValue(undefined),
		getAppState: vi.fn<ComputerActionDriver["getAppState"]>().mockResolvedValue({
			app: "TestApp",
			bundleId: "com.test.app",
			pid: 1234,
			frontmost: true,
			axAvailable: true,
			elements: [],
			screenshotBase64: "",
			screenshotWidth: 100,
			screenshotHeight: 100,
		}),
		listApps: vi.fn<ComputerActionDriver["listApps"]>().mockResolvedValue([]),
		setValue: vi.fn<ComputerActionDriver["setValue"]>().mockResolvedValue(undefined),
		performAction: vi.fn<ComputerActionDriver["performAction"]>().mockResolvedValue(undefined),
		pressAtPosition: vi.fn<ComputerActionDriver["pressAtPosition"]>().mockResolvedValue(false),
		typeIntoFocused: vi.fn<ComputerActionDriver["typeIntoFocused"]>().mockResolvedValue(false),
		close: vi.fn<ComputerActionDriver["close"]>().mockResolvedValue(undefined),
	};
}

describe("#given mutating OpenAI action batches #when executed #then final image state is returned", () => {
	it("captures a post-action screenshot with cursor metadata after the final mutating action", async () => {
		const computer = createComputer();
		vi.mocked(computer.screenshot).mockResolvedValue({
			data: Buffer.from("post-action"),
			mimeType: "image/png",
			width: 100,
			height: 100,
		});

		const result = await executeOpenAIComputerActionBatch(
			{
				actions: [
					{ type: "click", button: "left", x: 10, y: 20 },
					{ type: "type", text: "hello" },
				],
			},
			computer,
			DISPLAY,
		);

		expect(computer.screenshot).toHaveBeenCalledTimes(1);
		expect(computer.screenshot).toHaveBeenCalledWith({ targetSize: { width: 100, height: 100 } });
		expect(result.content).toEqual([
			{ type: "image", data: Buffer.from("post-action").toString("base64"), mimeType: "image/png" },
		]);
		expect(result.details).toEqual({
			ok: true,
			type: "batch",
			actionCount: 2,
			finalActionType: "type",
			screenshot: {
				source: "post_action_capture",
				captureFrame: { width: 100, height: 100 },
				cursor: {
					logical: { x: 7, y: 9 },
					image: { x: 4, y: 5 },
				},
				fidelity: {
					format: "image/png",
					byteCount: Buffer.from("post-action").byteLength,
					downgraded: true,
					reason: "adaptive_target_downscale",
					actual: { width: 100, height: 100 },
					original: { width: 200, height: 200 },
					target: { width: 100, height: 100 },
				},
			},
		});
	});

	it("reuses the latest explicit screenshot after the final mutating action", async () => {
		const computer = createComputer();
		vi.mocked(computer.screenshot).mockResolvedValue({
			data: Buffer.from("explicit"),
			mimeType: "image/png",
			width: 100,
			height: 100,
		});

		const result = await executeOpenAIComputerActionBatch(
			{
				actions: [{ type: "click", button: "left", x: 10, y: 20 }, { type: "screenshot" }],
			},
			computer,
			DISPLAY,
		);

		expect(computer.screenshot).toHaveBeenCalledTimes(1);
		expect(result.content).toEqual([
			{ type: "image", data: Buffer.from("explicit").toString("base64"), mimeType: "image/png" },
		]);
		expect(result.details?.screenshot.source).toBe("explicit_screenshot");
	});

	it("returns a typed execution failure when post-action screenshot capture fails", async () => {
		const computer = createComputer();
		vi.mocked(computer.screenshot).mockRejectedValue(new Error("capture failed"));

		await expect(
			executeOpenAIComputerActionBatch({ actions: [{ type: "type", text: "hello" }] }, computer, DISPLAY),
		).rejects.toMatchObject({
			kind: "execution_failed",
			action: "screenshot",
			message: "capture failed",
		});
	});

	it("preserves non-mutating batch behavior", async () => {
		const computer = createComputer();

		const result = await executeOpenAIComputerActionBatch(
			{ actions: [{ type: "wait", duration: 0 }] },
			computer,
			DISPLAY,
		);

		expect(computer.screenshot).not.toHaveBeenCalled();
		expect(result).toEqual({ content: [{ type: "text", text: "wait complete" }], details: undefined });
	});
});

describe("#given browser navigation click #when executed #then unsupported action is rejected", () => {
	it("throws a tagged ComputerUseError", async () => {
		const computer = createComputer();

		await expect(
			executeOpenAIComputerAction({ type: "click", button: "back", x: 1, y: 2 }, computer, DISPLAY),
		).rejects.toMatchObject({ kind: "unsupported_action" });
		await expect(
			executeOpenAIComputerAction({ type: "click", button: "forward", x: 1, y: 2 }, computer, DISPLAY),
		).rejects.toBeInstanceOf(ComputerUseError);
	});
});
