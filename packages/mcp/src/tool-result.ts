import { ACTION_COMPLETED_HINT, formatActionComplete } from "./surface-vocabulary.js";

export type ToolContent =
	| { type: "text"; text: string }
	| { type: "image"; data: string; mimeType: "image/png" | "image/jpeg" };

export type ToolResult = {
	content: ToolContent[];
};

export function textResult(text: string): ToolResult {
	return { content: [{ type: "text", text }] };
}

export function actionComplete(): ToolResult {
	return textResult(formatActionComplete());
}

export function clickComplete(): ToolResult {
	return textResult(formatActionComplete({ recoveryHint: `${ACTION_COMPLETED_HINT} ${CLICK_VERIFY_HINT}` }));
}

const CLICK_VERIFY_HINT =
	"The click was dispatched but may not have registered on the target. Confirm by calling get_app_state; if axChangeSummary is 0/0/0, retry once or use element_index for a reliable accessibility press. Do not use osascript, AppleScript, JXA, Swift, or shell scripting to work around this `click` tool.";
