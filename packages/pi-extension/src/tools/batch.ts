import type { ComputerInterface } from "@macos-cua/core";

import { type ToolDefinition, defineTool } from "../pi/index.js";
import { type AppStateCache, createAppStateCache } from "./app-state-cache.js";
import { createPiBatchExecutor } from "./batch-executor.js";
import { BatchParams } from "./batch-schema.js";

export function createBatchTool(computer: ComputerInterface, sharedCache?: AppStateCache): ToolDefinition {
	const cache = sharedCache ?? createAppStateCache();
	const executeBatch = createPiBatchExecutor(computer, cache);
	return defineTool({
		name: "batch",
		label: "Computer Use: batch",
		description:
			"Run a non-empty linear batch of existing discrete Computer Use actions. Steps stop on the first error; coordinate actions after get_app_state use the latest screenshot captured inside this batch.",
		parameters: BatchParams,
		executionMode: "sequential",
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return executeBatch(params.actions, { toolCallId, signal, onUpdate, ctx });
		},
	});
}
