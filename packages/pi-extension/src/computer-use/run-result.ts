import type { CodeModeRunResult } from "@macos-cua/core";
import type { AgentToolResult } from "../pi/index.js";

export function toAgentToolResult(result: CodeModeRunResult): AgentToolResult<undefined> {
	return {
		content: [
			...result.images.map((image) => ({
				type: "image" as const,
				data: image.data.toString("base64"),
				mimeType: image.mimeType,
			})),
			{ type: "text" as const, text: result.text },
		],
		details: undefined,
	};
}

export function toAgentToolErrorResult(error: unknown): AgentToolResult<undefined> {
	if (isCodeModeErrorLike(error)) {
		return textResult(`${error.code}: ${error.message}`);
	}
	throw error;
}

function textResult(text: string): AgentToolResult<undefined> {
	return { content: [{ type: "text", text }], details: undefined };
}

function isCodeModeErrorLike(error: unknown): error is { readonly code: string; readonly message: string } {
	return error instanceof Error && error.name === "CodeModeError" && "code" in error && typeof error.code === "string";
}
