import {
	type ComputerInterface,
	type DragOptions,
	clickElementByIndex,
	clickPoint,
	parseElementIndex,
	resolveAppPid,
	resolveScreenPoint,
	withTargetedApp,
} from "@macos-cua/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { MCP_CLICK_DESCRIPTION, MCP_DRAG_DESCRIPTION } from "./coordinate-contract.js";
import { type ToolResult, actionComplete, clickComplete } from "./tool-result.js";

const clickSchema = z.object({
	app: z.string().min(1),
	element_index: z.string().optional(),
	x: z.number().optional(),
	y: z.number().optional(),
	capture_id: z.string().optional(),
	display_epoch: z.string().optional(),
	click_count: z.number().int().positive().optional(),
	mouse_button: z.enum(["left", "right", "middle"]).optional(),
});

const dragSchema = z.object({
	app: z.string().min(1),
	from_x: z.number(),
	from_y: z.number(),
	to_x: z.number(),
	to_y: z.number(),
	capture_id: z.string().optional(),
	display_epoch: z.string().optional(),
});

export function registerClickTool(server: McpServer, computer: ComputerInterface): void {
	server.registerTool(
		"click",
		{ description: MCP_CLICK_DESCRIPTION, inputSchema: clickSchema },
		async ({
			app,
			element_index,
			x,
			y,
			capture_id,
			display_epoch,
			click_count,
			mouse_button,
		}): Promise<ToolResult> => {
			const targetPid = await resolveAppPid(computer, app);
			const pressCount = Math.max(1, Math.trunc(click_count ?? 1));
			if (element_index !== undefined) {
				await clickElementByIndex(computer, targetPid, parseElementIndex(element_index), pressCount, mouse_button);
				return clickComplete();
			}
			const point = await resolveScreenPoint(computer, targetPid, parseCoordinate(x, y, capture_id, display_epoch));
			if ((mouse_button ?? "left") === "left") {
				let pressedAll = true;
				for (let pressIndex = 0; pressIndex < pressCount; pressIndex += 1) {
					if (!(await computer.pressAtPosition(targetPid, point))) {
						pressedAll = false;
						break;
					}
				}
				if (pressedAll) return clickComplete();
			}
			await withTargetedApp(computer, targetPid, async () =>
				clickPoint(computer, point, mouse_button ?? "left", pressCount),
			);
			return clickComplete();
		},
	);
}

export function registerDragTool(server: McpServer, computer: ComputerInterface): void {
	server.registerTool(
		"drag",
		{ description: MCP_DRAG_DESCRIPTION, inputSchema: dragSchema },
		async ({ app, from_x, from_y, to_x, to_y, capture_id, display_epoch }): Promise<ToolResult> => {
			const targetPid = await resolveAppPid(computer, app);
			const freshness = freshnessFor(capture_id, display_epoch);
			const dragOptions: DragOptions = {
				from: await resolveScreenPoint(computer, targetPid, { x: from_x, y: from_y, ...freshness }),
				to: await resolveScreenPoint(computer, targetPid, { x: to_x, y: to_y, ...freshness }),
			};
			await withTargetedApp(computer, targetPid, async () => computer.drag(dragOptions));
			return actionComplete();
		},
	);
}

function parseCoordinate(
	x: number | undefined,
	y: number | undefined,
	captureId: string | undefined,
	displayEpoch: string | undefined,
): { readonly x: number; readonly y: number; readonly captureId?: string; readonly displayEpoch?: string } {
	if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
		throw new Error("click requires either element_index or finite x and y coordinates");
	}
	return { x, y, ...freshnessFor(captureId, displayEpoch) };
}

function freshnessFor(
	captureId: string | undefined,
	displayEpoch: string | undefined,
): { readonly captureId?: string; readonly displayEpoch?: string } {
	return {
		...(captureId === undefined ? {} : { captureId }),
		...(displayEpoch === undefined ? {} : { displayEpoch }),
	};
}
