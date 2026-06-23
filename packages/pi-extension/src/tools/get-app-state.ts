import { type ComputerInterface, createDebugLog, getAppStateForApp } from "@macos-cua/core";
import { type Static, Type } from "typebox";

import { drawCursorOnWindowScreenshot } from "../computer-use/screenshot-result.js";
import { computeSomMarks } from "../computer-use/som-layout.js";
import { renderSomOverlay } from "../computer-use/som-render.js";
import { GET_APP_STATE_TOOL_DESCRIPTION } from "../coordinate-contract.js";
import { type ToolDefinition, defineTool } from "../pi/index.js";
import type { AppStateCache } from "./app-state-cache.js";

const logOverlay = createDebugLog("overlay");

export const GetAppStateParams = Type.Object(
	{
		app: Type.String({ description: "App name or bundle identifier." }),
	},
	{ additionalProperties: false },
);

export type GetAppStateInput = Static<typeof GetAppStateParams>;

export function createGetAppStateTool(computer: ComputerInterface, cache?: AppStateCache): ToolDefinition {
	return defineTool({
		name: "get_app_state",
		label: "Computer Use: get app state",
		description: GET_APP_STATE_TOOL_DESCRIPTION,
		parameters: GetAppStateParams,
		async execute(_toolCallId, params) {
			const state = await getAppStateForApp(computer, params.app);
			cache?.store(state);
			const layout = computeSomMarks(state);
			const baseImage = Buffer.from(state.screenshotBase64, "base64");
			const somImage =
				state.windowBounds !== undefined && layout.marks.length > 0
					? await renderSomOverlay(baseImage, layout.marks)
					: baseImage;
			const annotatedImage =
				state.windowBounds !== undefined && state.observation?.cursor !== undefined
					? await drawCursorOnWindowScreenshot(somImage, state.observation.cursor, state.windowBounds)
					: somImage;
			const imageBase64 = annotatedImage.toString("base64");
			const mimeType = annotatedImage.equals(baseImage) ? (state.screenshotMimeType ?? "image/png") : "image/png";
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
				{ type: "image" as const, data: imageBase64, mimeType },
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
