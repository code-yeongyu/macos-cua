import type { ComputerInterface } from "@macos-cua/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppStateCache } from "./app-state-cache.js";
import { createMcpBatchDispatcher } from "./batch-dispatch.js";
import { type McpBatchAction, mcpBatchSchema } from "./batch-tool-schema.js";
import { executeDiscreteBatch } from "./batch.js";
import type { ToolResult } from "./tool-result.js";

export function registerBatchTool(server: McpServer, computer: ComputerInterface, appStateCache: AppStateCache): void {
	server.registerTool(
		"batch",
		{
			description:
				"Run a linear batch of existing discrete computer-use actions. Later coordinate actions use the latest in-batch get_app_state screenshot frame; the batch stops on first failure.",
			inputSchema: mcpBatchSchema,
		},
		async ({ actions }): Promise<ToolResult> => runMcpBatch(computer, appStateCache, actions),
	);
}

async function runMcpBatch(
	computer: ComputerInterface,
	appStateCache: AppStateCache,
	actions: readonly McpBatchAction[],
): Promise<ToolResult> {
	const dispatcher = createMcpBatchDispatcher(computer, appStateCache);
	const result = await executeDiscreteBatch({
		actions,
		executeAction: dispatcher.execute,
	});
	if (
		dispatcher.latestFeedback() === undefined ||
		(result.details.ok && result.details.finalActionType === "get_app_state")
	) {
		return result;
	}
	const latestFeedback = dispatcher.latestFeedback();
	return latestFeedback === undefined ? result : { ...result, content: [...latestFeedback, ...result.content] };
}
