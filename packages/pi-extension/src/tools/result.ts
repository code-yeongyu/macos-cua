import type { Point } from "@macos-cua/core";
import type { AgentToolResult } from "../pi/index.js";
import { ACTION_COMPLETED_HINT, formatActionComplete } from "../surface-vocabulary.js";

const CLICK_VERIFY_TEXT =
	"The click was dispatched but may not have registered on the target. Confirm by calling get_app_state; if axChangeSummary is 0/0/0, retry once or use element_index for a reliable accessibility press. Do not use osascript, AppleScript, JXA, Swift, or shell scripting to work around this `click` tool.";

export interface CursorFeedback {
	cursorBefore: Point;
	cursorAfter: Point;
}

export function actionCompleteWithCursor(cursorBefore: Point, cursorAfter: Point): AgentToolResult<CursorFeedback> {
	return {
		content: [
			{
				type: "text",
				text: formatActionComplete({
					recoveryHint: `${ACTION_COMPLETED_HINT} Pointer before (${cursorBefore.x}, ${cursorBefore.y}); after (${cursorAfter.x}, ${cursorAfter.y}).`,
				}),
			},
		],
		details: { cursorBefore, cursorAfter },
	};
}

export function clickCompleteWithCursor(cursorBefore: Point, cursorAfter: Point): AgentToolResult<CursorFeedback> {
	return {
		content: [
			{
				type: "text",
				text: formatActionComplete({
					recoveryHint: `${ACTION_COMPLETED_HINT} Pointer before (${cursorBefore.x}, ${cursorBefore.y}); after (${cursorAfter.x}, ${cursorAfter.y}). ${CLICK_VERIFY_TEXT}`,
				}),
			},
		],
		details: { cursorBefore, cursorAfter },
	};
}

export function clickCompleteResult(): AgentToolResult<undefined> {
	return textResult(formatActionComplete({ recoveryHint: `${ACTION_COMPLETED_HINT} ${CLICK_VERIFY_TEXT}` }));
}

export function textResult<TDetails = undefined>(
	text: string,
	details?: TDetails,
): AgentToolResult<TDetails | undefined> {
	return {
		content: [{ type: "text", text }],
		details: details as TDetails | undefined,
	};
}

export function actionCompleteResult(): AgentToolResult<undefined> {
	return textResult(formatActionComplete({}));
}

export function imageResult<TDetails = undefined>(
	pngBase64: string,
	details?: TDetails,
): AgentToolResult<TDetails | undefined> {
	return {
		content: [{ type: "image", data: pngBase64, mimeType: "image/png" }],
		details: details as TDetails | undefined,
	};
}

export function multiContentResult<TDetails = undefined>(
	pngBase64: string,
	text: string,
	details?: TDetails,
): AgentToolResult<TDetails | undefined> {
	return {
		content: [
			{ type: "image", data: pngBase64, mimeType: "image/png" },
			{ type: "text", text },
		],
		details: details as TDetails | undefined,
	};
}
