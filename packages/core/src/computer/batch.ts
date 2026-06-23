export type DiscreteBatchAction = {
	readonly action: string;
};

export type DiscreteBatchContent = {
	readonly type: string;
};

export type DiscreteBatchTextContent = {
	readonly type: "text";
	readonly text: string;
};

export type DiscreteBatchExecutionResult<TContent extends DiscreteBatchContent = DiscreteBatchContent> = {
	readonly content: TContent[];
};

export type DiscreteBatchStepDetails<TActionName extends string = string> =
	| {
			readonly index: number;
			readonly action: TActionName;
			readonly status: "success";
			readonly contentCount: number;
			readonly hasImage: boolean;
	  }
	| {
			readonly index: number;
			readonly action: TActionName;
			readonly status: "error";
			readonly message: string;
			readonly code?: string;
			readonly recoveryHint?: string;
	  };

export type DiscreteBatchDetails<TActionName extends string = string> =
	| {
			readonly ok: true;
			readonly type: "batch";
			readonly actionCount: number;
			readonly steps: readonly DiscreteBatchStepDetails<TActionName>[];
			readonly finalActionType: TActionName;
	  }
	| {
			readonly ok: false;
			readonly type: "batch";
			readonly actionCount: number;
			readonly failedStep: number;
			readonly steps: readonly DiscreteBatchStepDetails<TActionName>[];
	  };

export type DiscreteBatchResult<
	TContent extends DiscreteBatchContent = DiscreteBatchContent,
	TActionName extends string = string,
> = {
	readonly content: (TContent | DiscreteBatchTextContent)[];
	readonly details: DiscreteBatchDetails<TActionName>;
};

export type DiscreteBatchExecutorOptions<
	TAction extends DiscreteBatchAction,
	TStepResult extends DiscreteBatchExecutionResult,
> = {
	readonly actions: readonly TAction[];
	readonly executeAction: (action: TAction) => Promise<TStepResult>;
};

type ActionName<TAction extends DiscreteBatchAction> = TAction["action"] & string;

export async function executeDiscreteBatch<
	TAction extends DiscreteBatchAction,
	TStepResult extends DiscreteBatchExecutionResult,
>(
	options: DiscreteBatchExecutorOptions<TAction, TStepResult>,
): Promise<DiscreteBatchResult<TStepResult["content"][number], ActionName<TAction>>> {
	const steps: DiscreteBatchStepDetails<ActionName<TAction>>[] = [];
	let finalResult: TStepResult | undefined;
	let finalActionType: ActionName<TAction> | undefined;

	for (const [index, action] of options.actions.entries()) {
		try {
			finalResult = await options.executeAction(action);
			finalActionType = action.action;
			steps.push(successStep(index, action.action, finalResult));
		} catch (error) {
			return batchTextResult({
				ok: false,
				type: "batch",
				actionCount: options.actions.length,
				failedStep: index,
				steps: [...steps, errorStep(index, action.action, error)],
			});
		}
	}

	if (finalResult === undefined || finalActionType === undefined) {
		return batchTextResult({ ok: false, type: "batch", actionCount: options.actions.length, failedStep: 0, steps });
	}

	return {
		content: finalResult.content,
		details: { ok: true, type: "batch", actionCount: options.actions.length, steps, finalActionType },
	};
}

function successStep<TActionName extends string, TStepResult extends DiscreteBatchExecutionResult>(
	index: number,
	action: TActionName,
	result: TStepResult,
): DiscreteBatchStepDetails<TActionName> {
	return {
		index,
		action,
		status: "success",
		contentCount: result.content.length,
		hasImage: result.content.some((part) => part.type === "image"),
	};
}

function errorStep<TActionName extends string>(
	index: number,
	action: TActionName,
	error: unknown,
): DiscreteBatchStepDetails<TActionName> {
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

function batchTextResult<TContent extends DiscreteBatchContent, TActionName extends string>(
	details: DiscreteBatchDetails<TActionName>,
): DiscreteBatchResult<TContent, TActionName> {
	return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
}

function isErrorWithCode(error: unknown): error is Error & { readonly code: string; readonly recoveryHint?: string } {
	return (
		error instanceof Error &&
		"code" in error &&
		typeof error.code === "string" &&
		(!("recoveryHint" in error) || typeof error.recoveryHint === "string" || error.recoveryHint === undefined)
	);
}
