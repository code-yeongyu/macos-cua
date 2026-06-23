import { afterEach, describe, expect, it, vi } from "vitest";

import {
	ANTHROPIC_COMPUTER_USE_BETA,
	ANTHROPIC_NATIVE_COMPUTER_TOOL_NAME,
	ANTHROPIC_NATIVE_COMPUTER_TOOL_TYPE,
	type ComputerActionDriver,
	addAnthropicComputerUseToPayload,
	anthropicComputerToolSchema,
	supportsAnthropicNativeComputerUse,
} from "./anthropic-computer-use.js";
import { type DisplayConfig, displayProfileForModel, resolveDisplayConfig } from "./computer-use/coords.js";

const DEFAULT_DOWNSCALE = {
	logicalWidth: 2560,
	logicalHeight: 1440,
	modelWidth: 1280,
	modelHeight: 720,
} satisfies DisplayConfig;

const ONE_TO_ONE_DOWNSCALE = {
	logicalWidth: 100,
	logicalHeight: 80,
	modelWidth: 100,
	modelHeight: 80,
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
			height: 80,
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
		getScreenSize: vi.fn<ComputerActionDriver["getScreenSize"]>().mockResolvedValue({ width: 100, height: 80 }),
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
			screenshotHeight: 80,
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
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("#given a non-Anthropic provider #when adding computer use #then payload is untouched", () => {
	it("returns the original payload reference", () => {
		const payload = { messages: [] };

		const result = addAnthropicComputerUseToPayload("openai-responses", payload, DEFAULT_DOWNSCALE);

		expect(result).toBe(payload);
	});
});

describe("#given a non-record payload #when adding computer use #then payload is untouched", () => {
	it("returns the original payload value", () => {
		const payload = "not-a-record";

		const result = addAnthropicComputerUseToPayload("anthropic-messages", payload, DEFAULT_DOWNSCALE);

		expect(result).toBe(payload);
	});
});

describe("#given unknown or unsupported model #when adding computer use #then payload is untouched (safe default)", () => {
	it.each([undefined, "claude-opus-4-6", "claude-opus-4-8", "claude-future-9-0", "some-unknown-model"])(
		"skips native injection for %s",
		(modelId) => {
			const payload = { messages: [] };

			const result = addAnthropicComputerUseToPayload("anthropic-messages", payload, DEFAULT_DOWNSCALE, modelId);

			expect(result).toBe(payload);
			expect(supportsAnthropicNativeComputerUse(modelId)).toBe(false);
		},
	);
});

describe("#given supported sonnet model #when checking support #then returns true", () => {
	it.each(["claude-sonnet-4-5", "claude-3-5-sonnet-20241022"])("supports %s", (modelId) => {
		expect(supportsAnthropicNativeComputerUse(modelId)).toBe(true);
	});
});

describe("#given a fresh Anthropic payload #when adding computer use #then beta and native tool are injected", () => {
	it("adds headers, extra_body betas, and downscaled computer tool dimensions", () => {
		const payload = { messages: [] };

		const result = addAnthropicComputerUseToPayload(
			"anthropic-messages",
			payload,
			DEFAULT_DOWNSCALE,
			"claude-sonnet-4-5",
		);

		expect(result).toEqual({
			messages: [],
			tools: [
				{
					type: ANTHROPIC_NATIVE_COMPUTER_TOOL_TYPE,
					name: ANTHROPIC_NATIVE_COMPUTER_TOOL_NAME,
					display_width_px: 1280,
					display_height_px: 720,
				},
			],
			headers: { "anthropic-beta": ANTHROPIC_COMPUTER_USE_BETA },
			extra_body: { betas: [ANTHROPIC_COMPUTER_USE_BETA] },
		});
	});

	it("#given a large display #when native hard cap applies #then payload dimensions stay within the provider limit", () => {
		const payload = { messages: [] };
		const display = resolveDisplayConfig(
			{ width: 3024, height: 1964 },
			displayProfileForModel("anthropic-messages", "claude-sonnet-4-5"),
		);

		const result = addAnthropicComputerUseToPayload("anthropic-messages", payload, display, "claude-sonnet-4-5");

		expect(result).toMatchObject({
			tools: [
				{
					type: ANTHROPIC_NATIVE_COMPUTER_TOOL_TYPE,
					name: ANTHROPIC_NATIVE_COMPUTER_TOOL_NAME,
					display_width_px: 1024,
					display_height_px: 665,
				},
			],
		});
	});
});

describe("#given Anthropic model-facing schema #when inspected #then its root remains flat", () => {
	it("#given the computer tool schema #when serialized #then root combinators are not present", () => {
		expect(anthropicComputerToolSchema).not.toHaveProperty("oneOf");
		expect(anthropicComputerToolSchema).not.toHaveProperty("anyOf");
		expect(anthropicComputerToolSchema).not.toHaveProperty("allOf");
	});
});

describe("#given an existing Anthropic beta header #when adding computer use #then beta is comma-deduped", () => {
	it("does not duplicate the computer-use beta header", () => {
		const payload = { headers: { "anthropic-beta": `foo, ${ANTHROPIC_COMPUTER_USE_BETA}` } };

		const result = addAnthropicComputerUseToPayload(
			"anthropic-messages",
			payload,
			DEFAULT_DOWNSCALE,
			"claude-sonnet-4-5",
		);

		expect(result).toMatchObject({
			headers: { "anthropic-beta": `foo,${ANTHROPIC_COMPUTER_USE_BETA}` },
		});
	});
});

describe("#given an existing extra_body beta #when adding computer use #then beta array is deduped", () => {
	it("does not duplicate the computer-use beta entry", () => {
		const payload = { extra_body: { betas: [ANTHROPIC_COMPUTER_USE_BETA] } };

		const result = addAnthropicComputerUseToPayload(
			"anthropic-messages",
			payload,
			DEFAULT_DOWNSCALE,
			"claude-sonnet-4-5",
		);

		expect(result).toMatchObject({ extra_body: { betas: [ANTHROPIC_COMPUTER_USE_BETA] } });
	});
});

describe("#given a function-shaped computer tool #when adding computer use #then native variant replaces it", () => {
	it("strips the function-shaped duplicate before injection", () => {
		const unrelatedTool = { name: "other", input_schema: {} };
		const payload = {
			tools: [{ name: "computer", input_schema: {} }, unrelatedTool],
		};

		const result = addAnthropicComputerUseToPayload(
			"anthropic-messages",
			payload,
			DEFAULT_DOWNSCALE,
			"claude-sonnet-4-5",
		);

		expect(result).toMatchObject({
			tools: [
				unrelatedTool,
				{
					type: ANTHROPIC_NATIVE_COMPUTER_TOOL_TYPE,
					name: ANTHROPIC_NATIVE_COMPUTER_TOOL_NAME,
					display_width_px: 1280,
					display_height_px: 720,
				},
			],
		});
	});
});

describe("#given unrelated payload fields #when adding computer use #then existing values are preserved", () => {
	it("keeps unrelated tools, headers, and extra_body keys", () => {
		const unrelatedTool = { name: "shell", input_schema: { type: "object" } };
		const payload = {
			tools: [unrelatedTool],
			headers: { "x-custom": "kept" },
			extra_body: { temperature: 0.2, betas: ["other-beta"] },
		};

		const result = addAnthropicComputerUseToPayload(
			"anthropic-messages",
			payload,
			ONE_TO_ONE_DOWNSCALE,
			"claude-sonnet-4-5",
		);

		expect(result).toMatchObject({
			tools: [
				unrelatedTool,
				{
					type: ANTHROPIC_NATIVE_COMPUTER_TOOL_TYPE,
					name: ANTHROPIC_NATIVE_COMPUTER_TOOL_NAME,
					display_width_px: 100,
					display_height_px: 80,
				},
			],
			headers: { "x-custom": "kept", "anthropic-beta": ANTHROPIC_COMPUTER_USE_BETA },
			extra_body: { temperature: 0.2, betas: ["other-beta", ANTHROPIC_COMPUTER_USE_BETA] },
		});
	});
});
