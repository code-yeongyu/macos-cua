import { describe, expect, it, vi } from "vitest";

import type { ComputerActionDriver } from "./anthropic-computer-use.js";
import type { DisplayConfig } from "./computer-use/coords.js";
import { executeOpenAIComputerActionBatch } from "./openai-computer-batch.js";

const DISPLAY = {
	logicalWidth: 200,
	logicalHeight: 100,
	modelWidth: 100,
	modelHeight: 50,
} satisfies DisplayConfig;

describe("#given OpenAI batch cursor metadata #when cursor is outside display #then image coordinate is omitted", () => {
	it("keeps the logical cursor without exposing a clamped screenshot point", async () => {
		const computer = createComputer({ x: 999, y: -20 });

		const result = await executeOpenAIComputerActionBatch(
			{ actions: [{ type: "click", button: "left", x: 10, y: 20 }] },
			computer,
			DISPLAY,
		);

		expect(result.details?.screenshot.cursor).toEqual({ logical: { x: 999, y: -20 } });
	});
});

function createComputer(cursor: { readonly x: number; readonly y: number }): ComputerActionDriver {
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
			width: DISPLAY.modelWidth,
			height: DISPLAY.modelHeight,
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
		getCursorPosition: vi.fn<ComputerActionDriver["getCursorPosition"]>().mockResolvedValue(cursor),
		getScreenSize: vi.fn<ComputerActionDriver["getScreenSize"]>().mockResolvedValue({
			width: DISPLAY.logicalWidth,
			height: DISPLAY.logicalHeight,
		}),
		getAppState: vi.fn<ComputerActionDriver["getAppState"]>(),
		getScreenshotViewport: vi.fn<ComputerActionDriver["getScreenshotViewport"]>().mockResolvedValue(undefined),
		listApps: vi.fn<ComputerActionDriver["listApps"]>(),
		setValue: vi.fn<ComputerActionDriver["setValue"]>(),
		performAction: vi.fn<ComputerActionDriver["performAction"]>(),
		pressAtPosition: vi.fn<ComputerActionDriver["pressAtPosition"]>(),
		typeIntoFocused: vi.fn<ComputerActionDriver["typeIntoFocused"]>(),
		close: vi.fn<ComputerActionDriver["close"]>().mockResolvedValue(undefined),
	};
}
