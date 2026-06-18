import { type ComputerInterface, createDebugLog, getAppStateForApp } from "@macos-cua/core";
import { type Static, Type } from "typebox";

import { computeSomMarks } from "../computer-use/som-layout.js";
import { renderSomOverlay } from "../computer-use/som-render.js";
import { type ToolDefinition, defineTool } from "../pi/index.js";

const logOverlay = createDebugLog("overlay");

export const GetAppStateParams = Type.Object(
	{
		app: Type.String({ description: "App name or bundle identifier." }),
	},
	{ additionalProperties: false },
);

export type GetAppStateInput = Static<typeof GetAppStateParams>;

export function createGetAppStateTool(computer: ComputerInterface): ToolDefinition {
	return defineTool({
		name: "get_app_state",
		label: "Computer Use: get app state",
		description:
			"Start an app use session if needed, then get the state of the app's key window and return a screenshot and accessibility tree. The numbered boxes in the screenshot are element_index values from the JSON accessibility tree.",
		parameters: GetAppStateParams,
		async execute(_toolCallId, params) {
			const state = await getAppStateForApp(computer, params.app);
			const layout = computeSomMarks(state);
			const imageBase64 =
				state.windowBounds !== undefined && layout.marks.length > 0
					? renderSomOverlay(Buffer.from(state.screenshotBase64, "base64"), layout.marks).toString("base64")
					: state.screenshotBase64;
			if (imageBase64 !== state.screenshotBase64) {
				logOverlay("annotated", { marks: layout.marks.length, dropped: layout.dropped });
			} else {
				logOverlay("skip", {
					reason: skipReason(state.windowBounds, layout.marks.length),
					marks: layout.marks.length,
					dropped: layout.dropped,
				});
			}
			const content = [
				{ type: "image" as const, data: imageBase64, mimeType: state.screenshotMimeType ?? "image/png" },
				{ type: "text" as const, text: JSON.stringify({ ...state, screenshotBase64: undefined }, null, 2) },
			];
			return { content, details: state };
		},
	});
}

function skipReason(windowBounds: unknown, markCount: number): string {
	if (windowBounds === undefined) {
		return "no_window_bounds";
	}
	return markCount === 0 ? "no_marks" : "overlay_unchanged";
}
