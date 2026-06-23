import type { CaptureFrame, ComputerInterface } from "@macos-cua/core";
import type { AppStateCache } from "./app-state-cache.js";
import { runBatchAction } from "./batch-actions.js";
import type { BatchAction } from "./batch-schema.js";
import { formatToolError } from "./surface-vocabulary.js";
import type { ToolContent, ToolResult } from "./tool-result.js";

export type BatchState = {
	latestFrame: CaptureFrame | undefined;
	latestImage: ToolContent | undefined;
};

type BatchStep = {
	readonly index: number;
	readonly action: BatchAction["action"];
	readonly ok: boolean;
	readonly code: string;
	readonly message?: string;
	readonly recoveryHint?: string;
};

export async function runBatch(
	computer: ComputerInterface,
	appStateCache: AppStateCache,
	actions: readonly BatchAction[],
): Promise<ToolResult> {
	const state: BatchState = { latestFrame: undefined, latestImage: undefined };
	const steps: BatchStep[] = [];
	for (const [index, action] of actions.entries()) {
		try {
			await runBatchAction(computer, appStateCache, state, action);
			steps.push({ index, action: action.action, ok: true, code: "ACTION_COMPLETED" });
		} catch (error) {
			steps.push(failedStep(index, action.action, error));
			return batchResult(false, steps, state.latestImage, index);
		}
	}
	return batchResult(true, steps, state.latestImage);
}

function failedStep(index: number, action: BatchAction["action"], error: unknown): BatchStep {
	const parsed: unknown = JSON.parse(formatToolError(error));
	const message = stringField(parsed, "message");
	const recoveryHint = stringField(parsed, "recoveryHint");
	return {
		index,
		action,
		ok: false,
		code: stringField(parsed, "code") ?? "ACTION_FAILED",
		...(message !== undefined ? { message } : {}),
		...(recoveryHint !== undefined ? { recoveryHint } : {}),
	};
}

function batchResult(
	ok: boolean,
	steps: readonly BatchStep[],
	image: ToolContent | undefined,
	failedStep?: number,
): ToolResult {
	return {
		content: [
			...(image === undefined ? [] : [image]),
			{
				type: "text",
				text: JSON.stringify({
					ok,
					code: ok ? "BATCH_COMPLETED" : "BATCH_FAILED",
					...(failedStep !== undefined ? { failedStep } : {}),
					steps,
				}),
			},
		],
	};
}

function stringField(value: unknown, key: string): string | undefined {
	if (!isRecord(value) || !(key in value)) {
		return undefined;
	}
	const field = value[key];
	return typeof field === "string" ? field : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null;
}
