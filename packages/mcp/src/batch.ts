import type { ComputerInterface } from "@macos-cua/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppStateCache } from "./app-state-cache.js";
import { runBatch } from "./batch-runner.js";
import { batchSchema } from "./batch-schema.js";
import type { ToolResult } from "./tool-result.js";

export function registerBatchTool(server: McpServer, computer: ComputerInterface, appStateCache: AppStateCache): void {
	server.registerTool(
		"batch",
		{
			description:
				"Run a linear batch of existing discrete computer-use actions. Later coordinate actions use the latest in-batch get_app_state screenshot frame; the batch stops on first failure.",
			inputSchema: batchSchema,
		},
		async ({ actions }): Promise<ToolResult> => runBatch(computer, appStateCache, actions),
	);
}
