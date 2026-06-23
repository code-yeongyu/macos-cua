import {
	type DiscreteBatchAction,
	type DiscreteBatchDetails,
	type DiscreteBatchStepDetails,
	type DiscreteBatchExecutorOptions as SharedDiscreteBatchExecutorOptions,
	type DiscreteBatchResult as SharedDiscreteBatchResult,
	executeDiscreteBatch as executeSharedDiscreteBatch,
} from "@macos-cua/core";

import type { ToolContent, ToolResult } from "./tool-result.js";

export type { DiscreteBatchAction, DiscreteBatchDetails, DiscreteBatchStepDetails };

export type DiscreteBatchResult = SharedDiscreteBatchResult<ToolContent>;

export type DiscreteBatchExecutorOptions<TAction extends DiscreteBatchAction> = SharedDiscreteBatchExecutorOptions<
	TAction,
	ToolResult
>;

export async function executeDiscreteBatch<TAction extends DiscreteBatchAction>(
	options: DiscreteBatchExecutorOptions<TAction>,
): Promise<DiscreteBatchResult> {
	return await executeSharedDiscreteBatch(options);
}
