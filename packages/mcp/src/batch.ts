import type { ToolResult } from "./tool-result.js";
import { textResult } from "./tool-result.js";

export type DiscreteBatchAction = {
	readonly action: string;
};

export type DiscreteBatchStepDetails =
	| {
			readonly index: number;
			readonly action: string;
			readonly status: "success";
			readonly contentCount: number;
			readonly hasImage: boolean;
	  }
	| {
			readonly index: number;
			readonly action: string;
			readonly status: "error";
			readonly message: string;
			readonly code?: string;
			readonly recoveryHint?: string;
	  };

export type DiscreteBatchDetails =
	| {
			readonly ok: true;
			readonly type: "batch";
			readonly actionCount: number;
			readonly steps: readonly DiscreteBatchStepDetails[];
			readonly finalActionType: string;
	  }
	| {
			readonly ok: false;
			readonly type: "batch";
			readonly actionCount: number;
			readonly failedStep: number;
			readonly steps: readonly DiscreteBatchStepDetails[];
	  };

export type DiscreteBatchResult = ToolResult & {
	readonly details: DiscreteBatchDetails;
};

export type DiscreteBatchExecutorOptions<TAction extends DiscreteBatchAction> = {
	readonly actions: readonly TAction[];
	readonly executeAction: (action: TAction) => Promise<ToolResult>;
};

export async function executeDiscreteBatch<TAction extends DiscreteBatchAction>(
	options: DiscreteBatchExecutorOptions<TAction>,
): Promise<DiscreteBatchResult> {
	const steps: DiscreteBatchStepDetails[] = [];
	let finalResult: ToolResult | undefined;
	let finalActionType: string | undefined;

	for (const [index, action] of options.actions.entries()) {
		try {
			finalResult = await options.executeAction(action);
			finalActionType = action.action;
			steps.push(successStep(index, action.action, finalResult));
		} catch (error) {
			const details: DiscreteBatchDetails = {
				ok: false,
				type: "batch",
				actionCount: options.actions.length,
				failedStep: index,
				steps: [...steps, errorStep(index, action.action, error)],
			};
			return { ...textResult(JSON.stringify(details, null, 2)), details };
		}
	}

	if (finalResult === undefined || finalActionType === undefined) {
		const details: DiscreteBatchDetails = {
			ok: false,
			type: "batch",
			actionCount: options.actions.length,
			failedStep: 0,
			steps,
		};
		return { ...textResult(JSON.stringify(details, null, 2)), details };
	}

	return {
		content: finalResult.content,
		details: { ok: true, type: "batch", actionCount: options.actions.length, steps, finalActionType },
	};
}

function successStep(index: number, action: string, result: ToolResult): DiscreteBatchStepDetails {
	return {
		index,
		action,
		status: "success",
		contentCount: result.content.length,
		hasImage: result.content.some((part) => part.type === "image"),
	};
}

function errorStep(index: number, action: string, error: unknown): DiscreteBatchStepDetails {
	if (isErrorWithCode(error)) {
		return {
			index,
			action,
			status: "error",
			message: error.message,
			code: error.code,
			...(error.recoveryHint === undefined ? {} : { recoveryHint: error.recoveryHint }),
		};
	}
	if (error instanceof Error) {
		return { index, action, status: "error", message: error.message };
	}
	return { index, action, status: "error", message: String(error) };
}

function isErrorWithCode(error: unknown): error is Error & { readonly code: string; readonly recoveryHint?: string } {
	return (
		error instanceof Error &&
		"code" in error &&
		typeof error.code === "string" &&
		(!("recoveryHint" in error) || typeof error.recoveryHint === "string" || error.recoveryHint === undefined)
	);
}
