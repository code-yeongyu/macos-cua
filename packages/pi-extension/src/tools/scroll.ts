import {
	type ComputerInterface,
	parseElementIndex,
	pressKeySequence,
	resolveAppPid,
	scrollElement,
	withTargetedApp,
} from "@macos-cua/core";
import { type Static, Type } from "typebox";

import { type ToolDefinition, defineTool } from "../pi/index.js";
import { actionCompleteWithHint } from "./result.js";

const LINES_PER_PAGE = 10;
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
			if (params.element_index !== undefined) {
				await scrollElement(
					computer,
					targetPid,
					parseElementIndex(params.element_index),
					params.direction,
					params.pages ?? 1,
				);
				return actionCompleteWithHint(SCROLL_HINT);
			}
			await withTargetedApp(computer, targetPid, async () => {
				await scrollWithoutElement(computer, params.direction, pageCount(params.pages));
			});
			return actionCompleteWithHint(SCROLL_HINT);
		},
	});
}

async function scrollWithoutElement(
	computer: ComputerInterface,
	direction: ScrollInput["direction"],
	pages: number,
): Promise<void> {
	switch (direction) {
		case "down":
			await pressKeySequence(computer, repeatKey("page_down", pages));
			return;
		case "up":
			await pressKeySequence(computer, repeatKey("page_up", pages));
			return;
		case "left":
		case "right":
			await computer.scroll({ direction, amount: pages * LINES_PER_PAGE });
			return;
	}
}

function repeatKey(key: string, count: number): readonly { readonly key: string }[] {
	return Array.from({ length: count }, () => ({ key }));
}

function pageCount(pages: number | undefined): number {
	return Math.max(1, Math.trunc(pages ?? 1));
}
