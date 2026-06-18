import type { CodeModeRunResult } from "@macos-cua/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { formatToolError } from "./surface-vocabulary.js";
import type { ToolContent, ToolResult } from "./tool-result.js";

export interface CodeModeRunner {
	run(code: string): Promise<CodeModeRunResult>;
}

export type CodeModeRunnerFactory = () => Promise<CodeModeRunner>;

const runSchema = z.object({
	code: z.string().min(1),
});

export function registerRunTool(server: McpServer, runnerFactory: CodeModeRunnerFactory): void {
	server.registerTool(
		"run",
		{
			description:
				"Run TypeScript that drives the desktop via mac.*. Call surface(handle) to show screenshots; return a value or console.log text.",
			inputSchema: runSchema,
		},
		async ({ code }): Promise<ToolResult> => {
			try {
				return runResultToToolResult(await (await runnerFactory()).run(code));
			} catch (error) {
				if (isCodeModeErrorLike(error)) {
					return { content: [{ type: "text", text: formatToolError(error) }] };
				}
				throw error;
			}
		},
	);
}

export function runResultToToolResult(result: CodeModeRunResult): ToolResult {
	const content: ToolContent[] = result.images.map((image) => ({
		type: "image",
		data: image.data.toString("base64"),
		mimeType: image.mimeType,
	}));
	content.push({ type: "text", text: result.text });
	return { content };
}

function isCodeModeErrorLike(error: unknown): error is { readonly code: string; readonly message: string } {
	return error instanceof Error && error.name === "CodeModeError" && "code" in error && typeof error.code === "string";
}
