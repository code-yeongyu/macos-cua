import type { ComputerInterface } from "@macos-cua/core";

import { ComputerUseError, type ComputerUseResult } from "./anthropic-computer-use.js";
import type { DisplayConfig } from "./computer-use/coords.js";
import { type ScreenshotCursorMetadata, screenshotResultWithCursorMetadata } from "./computer-use/screenshot-result.js";
import { executeOpenAIComputerAction } from "./openai-computer-use.js";
import type { OpenAIComputerAction, OpenAIComputerActionBatch } from "./openai-payload.js";
import type { AgentToolResult } from "./pi/index.js";

type OpenAIComputerBatchScreenshotSource = "explicit_screenshot" | "post_action_capture";
export type OpenAIComputerBatchResultDetails = {
	readonly ok: true;
	readonly type: "batch";
	readonly actionCount: number;
	readonly finalActionType: OpenAIComputerAction["type"];
	readonly screenshot: ScreenshotCursorMetadata & {
		readonly source: OpenAIComputerBatchScreenshotSource;
	};
};
type OpenAIComputerBatchResult = AgentToolResult<OpenAIComputerBatchResultDetails | undefined>;
type TrackedOpenAIComputerScreenshot = {
	readonly result: ComputerUseResult;
	readonly metadata: ScreenshotCursorMetadata;
	readonly source: OpenAIComputerBatchScreenshotSource;
	readonly actionIndex: number;
};
type CaptureOpenAIScreenshotOptions = {
	readonly computer: ComputerInterface;
	readonly display: DisplayConfig;
	readonly source: OpenAIComputerBatchScreenshotSource;
	readonly actionIndex: number;
};

export async function executeOpenAIComputerActionBatch(
	input: OpenAIComputerActionBatch,
	computer: ComputerInterface,
	display: DisplayConfig,
): Promise<OpenAIComputerBatchResult> {
	let result: ComputerUseResult | undefined;
	let latestScreenshot: TrackedOpenAIComputerScreenshot | undefined;
	let latestMutatingActionIndex = -1;

	for (const [actionIndex, action] of input.actions.entries()) {
		if (action.type === "screenshot") {
			latestScreenshot = await captureOpenAIScreenshot({
				computer,
				display,
				source: "explicit_screenshot",
				actionIndex,
			});
			result = latestScreenshot.result;
		} else {
			result = await executeOpenAIComputerAction(action, computer, display);
			if (isMutatingOpenAIAction(action)) {
				latestMutatingActionIndex = actionIndex;
			}
		}
	}

	if (result === undefined) {
		throw new Error("OpenAI computer action batch must include at least one action");
	}
	if (latestMutatingActionIndex < 0) {
		return result;
	}
	const finalScreenshot =
		latestScreenshot !== undefined && latestScreenshot.actionIndex > latestMutatingActionIndex
			? latestScreenshot
			: await captureOpenAIScreenshot({
					computer,
					display,
					source: "post_action_capture",
					actionIndex: input.actions.length,
				});
	const finalAction = input.actions.at(-1);
	if (finalAction === undefined) {
		throw new Error("OpenAI computer action batch must include at least one action");
	}
	return {
		content: finalScreenshot.result.content,
		details: {
			ok: true,
			type: "batch",
			actionCount: input.actions.length,
			finalActionType: finalAction.type,
			screenshot: {
				source: finalScreenshot.source,
				captureFrame: finalScreenshot.metadata.captureFrame,
				cursor: finalScreenshot.metadata.cursor,
			},
		},
	};
}

async function captureOpenAIScreenshot(
	options: CaptureOpenAIScreenshotOptions,
): Promise<TrackedOpenAIComputerScreenshot> {
	try {
		const screenshot = await screenshotResultWithCursorMetadata(options.computer, options.display);
		return { ...screenshot, source: options.source, actionIndex: options.actionIndex };
	} catch (error) {
		if (error instanceof ComputerUseError) {
			throw error;
		}
		throw new ComputerUseError("execution_failed", errorMessage(error), { action: "screenshot", cause: error });
	}
}

function isMutatingOpenAIAction(action: OpenAIComputerAction): boolean {
	switch (action.type) {
		case "click":
		case "double_click":
		case "drag":
		case "keypress":
		case "move":
		case "scroll":
		case "type":
			return true;
		case "screenshot":
		case "wait":
			return false;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
