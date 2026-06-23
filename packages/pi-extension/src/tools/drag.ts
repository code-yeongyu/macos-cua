import { type ComputerInterface, resolveAppPid, resolveScreenPoint, withTargetedApp } from "@macos-cua/core";
import { type Static, Type } from "typebox";

import { DRAG_TOOL_DESCRIPTION } from "../coordinate-contract.js";
import { type ToolDefinition, defineTool } from "../pi/index.js";
import { actionCompleteResult } from "./result.js";

export const DragParams = Type.Object(
	{
		app: Type.String({ description: "App name or bundle identifier." }),
		from_x: Type.Number({ description: "Start X coordinate." }),
		from_y: Type.Number({ description: "Start Y coordinate." }),
		to_x: Type.Number({ description: "End X coordinate." }),
		to_y: Type.Number({ description: "End Y coordinate." }),
		capture_id: Type.Optional(Type.String({ description: "Capture id from the latest get_app_state metadata." })),
		display_epoch: Type.Optional(
			Type.String({ description: "Display epoch from the latest get_app_state metadata." }),
		),
	},
	{ additionalProperties: false },
);

export type DragInput = Static<typeof DragParams>;

export function createDragTool(computer: ComputerInterface): ToolDefinition {
	return defineTool({
		name: "drag",
		label: "Computer Use: drag",
		description: DRAG_TOOL_DESCRIPTION,
		parameters: DragParams,
		async execute(_toolCallId, params) {
			const targetPid = await resolveAppPid(computer, params.app);
			const freshness = freshnessFor(params);
			const from = await resolveScreenPoint(computer, targetPid, {
				x: params.from_x,
				y: params.from_y,
				...freshness,
			});
			const to = await resolveScreenPoint(computer, targetPid, { x: params.to_x, y: params.to_y, ...freshness });
			await withTargetedApp(computer, targetPid, async () => {
				await computer.drag({ from, to });
			});
			return actionCompleteResult();
		},
	});
}

function freshnessFor(params: DragInput): { readonly captureId?: string; readonly displayEpoch?: string } {
	return {
		...(params.capture_id === undefined ? {} : { captureId: params.capture_id }),
		...(params.display_epoch === undefined ? {} : { displayEpoch: params.display_epoch }),
	};
}
