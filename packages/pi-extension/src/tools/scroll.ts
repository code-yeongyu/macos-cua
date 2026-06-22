import { type ComputerInterface, executeScrollAction, parseElementIndex, resolveAppPid } from "@macos-cua/core";
import { type Static, Type } from "typebox";

import { type ToolDefinition, defineTool } from "../pi/index.js";
import { actionCompleteWithHint } from "./result.js";

const SCROLL_HINT =
	"Call get_app_state to fetch the updated UI state. For browser pages, scroll without element_index uses page_down/page_up keys. If axChangeSummary is 0/0/0, retry with a scrollable element_index from get_app_state, or use press_keys with page_down, page_up, space, or shift+space.";

export const ScrollParams = Type.Object(
	{
		app: Type.String({ description: "App name or bundle identifier." }),
		direction: Type.Union([Type.Literal("up"), Type.Literal("down"), Type.Literal("left"), Type.Literal("right")], {
			description: "Scroll direction.",
		}),
		element_index: Type.Optional(Type.String({ description: "Element index from get_app_state." })),
		pages: Type.Optional(Type.Number({ description: "Number of pages to scroll. Defaults to 1." })),
	},
	{ additionalProperties: false },
);

export type ScrollInput = Static<typeof ScrollParams>;

export function createScrollTool(computer: ComputerInterface): ToolDefinition {
	return defineTool({
		name: "scroll",
		label: "Computer Use: scroll",
		description: "Scroll an element in a direction by a number of pages.",
		parameters: ScrollParams,
		async execute(_toolCallId, params) {
			const targetPid = await resolveAppPid(computer, params.app);
			await executeScrollAction(computer, {
				targetPid,
				direction: params.direction,
				pages: params.pages ?? 1,
				...(params.element_index === undefined
					? {}
					: {
							elementIndex: parseElementIndex(params.element_index),
						}),
			});
			return actionCompleteWithHint(SCROLL_HINT);
		},
	});
}
