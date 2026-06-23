import { afterEach, describe, expect, it, vi } from "vitest";

import { type ComputerActionDriver, ComputerUseError } from "./anthropic-computer-use.js";
import type { DisplayConfig } from "./computer-use/coords.js";
import { executeOpenAIComputerActionBatch } from "./openai-computer-batch.js";
import {
	addOpenAIComputerUseToPayload,
	executeOpenAIComputerAction,
	normalizeOpenAIKeys,
	sanitizeOpenAIComputerUsePayload,
} from "./openai-computer-use.js";

const DISPLAY = {
	logicalWidth: 200,
	logicalHeight: 200,
	modelWidth: 100,
	modelHeight: 100,
} satisfies DisplayConfig;

const STALE_DISPLAY = {
	logicalWidth: 200,
	logicalHeight: 200,
	modelWidth: 100,
	modelHeight: 100,
	captureId: "capture-1",
	displayEpoch: "display-1",
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

afterEach(() => {
	vi.restoreAllMocks();
});

describe("#given OpenAI payloads #when adding computer use #then passthrough and dedupe are honored", () => {
	it("passes through non-openai providers and dedupes native tool", () => {
		const payload = { tools: [{ type: "computer" }, { type: "function", name: "shell" }] };

		expect(addOpenAIComputerUseToPayload("anthropic-messages", payload, DISPLAY)).toBe(payload);
		expect(addOpenAIComputerUseToPayload("openai-responses", payload, DISPLAY)).toEqual(payload);
		expect(addOpenAIComputerUseToPayload("openai-responses", { tools: [] }, DISPLAY)).toEqual({
			tools: [{ type: "computer" }],
		});
	});

	it("strips the fallback computer function before OpenAI sees the payload", () => {
		const computerFunction = { type: "function", name: "computer", parameters: { anyOf: [] } };
		const nestedComputerFunction = { type: "function", function: { name: "computer" } };
		const shellTool = { type: "function", name: "shell" };

		expect(
			sanitizeOpenAIComputerUsePayload("openai-responses", {
				tools: [computerFunction, nestedComputerFunction, shellTool],
			}),
		).toEqual({ tools: [shellTool] });
		expect(
			addOpenAIComputerUseToPayload("openai-responses", { tools: [computerFunction, shellTool] }, DISPLAY),
		).toEqual({ tools: [shellTool, { type: "computer" }] });
	});
});

describe("#given OpenAI click actions #when executed #then buttons and keys map to macOS calls", () => {
	it("dispatches left, right, and wheel clicks", async () => {
		const computer = createComputer();

		await executeOpenAIComputerAction(
			{ type: "click", button: "left", x: 10, y: 20, keys: ["Control"] },
			computer,
			DISPLAY,
		);
		await executeOpenAIComputerAction({ type: "click", button: "right", x: 30, y: 40 }, computer, DISPLAY);
		await executeOpenAIComputerAction({ type: "click", button: "wheel", x: 50, y: 60 }, computer, DISPLAY);

		expect(computer.key).toHaveBeenCalledWith("control");
		expect(computer.click).toHaveBeenCalledWith({ x: 20, y: 40 });
		expect(computer.rightClick).toHaveBeenCalledWith({ x: 60, y: 80 });
		expect(computer.middleClick).toHaveBeenCalledWith({ x: 100, y: 120 });
	});
});

describe("#given OpenAI drag and keypress actions #when executed #then paths and modifiers are translated", () => {
	it("collapses drag paths and parses keypresses", async () => {
		const computer = createComputer();
		const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

		await executeOpenAIComputerAction(
			{
				type: "drag",
				path: [
					{ x: 1, y: 2 },
					{ x: 3, y: 4 },
					{ x: 5, y: 6 },
				],
			},
			computer,
			DISPLAY,
		);
		await executeOpenAIComputerAction({ type: "keypress", keys: ["Control", "c"] }, computer, DISPLAY);

		expect(computer.drag).toHaveBeenCalledWith({ from: { x: 2, y: 4 }, to: { x: 10, y: 12 } });
		expect(stderrWrite).toHaveBeenCalledWith("macos-cua: collapsed OpenAI drag path to endpoints\n");
		expect(computer.key).toHaveBeenCalledWith("c", { modifiers: ["control"] });
		expect(normalizeOpenAIKeys(["Meta", "Enter"])).toEqual({ modifiers: ["command"], key: "enter" });
	});
});

describe("#given OpenAI scroll and screenshot actions #when executed #then direction and explicit screenshot are correct", () => {
	it("handles both axes and requests model-sized screenshot payloads", async () => {
		const rawPng = Buffer.alloc(100, 1);
		const computer = createComputer();
		vi.mocked(computer.screenshot).mockResolvedValue({
			data: rawPng,
			mimeType: "image/png",
			width: 100,
			height: 100,
		});

		const firstScroll = await executeOpenAIComputerAction(
			{ type: "scroll", scroll_x: 5, scroll_y: 30, x: 10, y: 20 },
			computer,
			DISPLAY,
		);
		const secondScroll = await executeOpenAIComputerAction(
			{ type: "scroll", scroll_x: -50, scroll_y: 10, x: 15, y: 25 },
			computer,
			DISPLAY,
		);
		const result = await executeOpenAIComputerAction({ type: "screenshot" }, computer, DISPLAY);

		expect(computer.scroll).toHaveBeenNthCalledWith(1, { direction: "down", amount: 30 });
		expect(computer.scroll).toHaveBeenNthCalledWith(2, { direction: "left", amount: 50 });
		expect(JSON.parse(firstScroll.content[0]?.type === "text" ? firstScroll.content[0].text : "")).toMatchObject({
			ok: true,
			type: "scroll",
			code: "ACTION_COMPLETED",
			recoveryHint: "Call get_app_state to fetch the updated UI state.",
		});
		expect(JSON.parse(secondScroll.content[0]?.type === "text" ? secondScroll.content[0].text : "")).toMatchObject({
			ok: true,
			type: "scroll",
			code: "ACTION_COMPLETED",
			recoveryHint: "Call get_app_state to fetch the updated UI state.",
		});
		expect(computer.screenshot).toHaveBeenCalledWith({ targetSize: { width: 100, height: 100 } });
		expect(result.content).toEqual([{ type: "image", data: rawPng.toString("base64"), mimeType: "image/png" }]);
	});
});

describe("#given OpenAI stale coordinates #when native computer use rejects them #then code and hint match code-mode", () => {
	it("#given a stale capture marker #when click executes #then STALE_CAPTURE is preserved", async () => {
		const computer = createComputer();

		await expect(
			executeOpenAIComputerAction({ type: "click", button: "left", x: 10, y: 20 }, computer, STALE_DISPLAY, {
				captureId: "capture-2",
				displayEpoch: "display-1",
			}),
		).rejects.toMatchObject({
			code: "STALE_CAPTURE",
			message: expect.stringContaining("captureId capture-1"),
			recoveryHint: expect.stringContaining("fresh screenshot"),
		});
		expect(computer.click).not.toHaveBeenCalled();
	});

	it("#given an out-of-bounds coordinate #when click executes #then valid frame and corrective action are reported", async () => {
		const computer = createComputer();

		await expect(
			executeOpenAIComputerAction({ type: "click", button: "left", x: 101, y: 20 }, computer, DISPLAY),
		).rejects.toMatchObject({
			code: "OUT_OF_BOUNDS_COORDINATE",
			message: expect.stringContaining("valid x range [0, 100] and y range [0, 100]"),
			recoveryHint: expect.stringContaining("Capture a fresh screenshot"),
		});
		expect(computer.click).not.toHaveBeenCalled();
	});
});

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
					downgraded: false,
					actual: { width: 100, height: 100 },
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
