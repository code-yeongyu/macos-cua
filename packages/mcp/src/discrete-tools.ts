import {
	type ComputerInterface,
	type DragOptions,
	clickElementByIndex,
	clickPoint,
	getAppStateForApp,
	parseElementIndex,
	resolveAppPid,
	resolveScreenPoint,
	scrollElement,
	withTargetedApp,
} from "@macos-cua/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { registerPressKeysTool } from "./press-keys.js";
import { type ToolContent, type ToolResult, actionComplete, clickComplete, textResult } from "./tool-result.js";
import { registerZoomTool } from "./zoom.js";

const appSchema = z.string().min(1);
const emptySchema = z.object({});
const getAppStateSchema = z.object({ app: appSchema });
const clickSchema = z.object({
	app: appSchema,
	element_index: z.string().optional(),
	x: z.number().optional(),
	y: z.number().optional(),
	click_count: z.number().int().positive().optional(),
	mouse_button: z.enum(["left", "right", "middle"]).optional(),
});
const performSecondaryActionSchema = z.object({ app: appSchema, element_index: z.string(), action: z.string().min(1) });
const setValueSchema = z.object({ app: appSchema, element_index: z.string(), value: z.string() });
const selectTextSchema = z.object({
	app: appSchema,
	element_index: z.string(),
	text: z.string().optional(),
	prefix: z.string().optional(),
	suffix: z.string().optional(),
	selection: z.enum(["text", "before", "after"]).optional(),
});
const dragSchema = z.object({
	app: appSchema,
	from_x: z.number(),
	from_y: z.number(),
	to_x: z.number(),
	to_y: z.number(),
});
const scrollSchema = z.object({
	app: appSchema,
	direction: z.enum(["up", "down", "left", "right"]),
	element_index: z.string().optional(),
	pages: z.number().positive().optional(),
});
const typeTextSchema = z.object({ app: appSchema, text: z.string() });

export function registerDiscreteTools(server: McpServer, computer: ComputerInterface): void {
	registerListAppsTool(server, computer);
	registerGetAppStateTool(server, computer);
	registerClickTool(server, computer);
	registerAccessibilityTools(server, computer);
	registerDragScrollAndTypeTools(server, computer);
	registerZoomTool(server, computer);
	registerPressKeysTool(server, computer, actionComplete);
}

function registerListAppsTool(server: McpServer, computer: ComputerInterface): void {
	server.registerTool(
		"list_apps",
		{
			description:
				"List the apps on this computer. Returns the set of apps that are currently running, including details on usage frequency where available.",
			inputSchema: emptySchema,
		},
		async (): Promise<ToolResult> => textResult(JSON.stringify(await computer.listApps(), null, 2)),
	);
}

function registerGetAppStateTool(server: McpServer, computer: ComputerInterface): void {
	server.registerTool(
		"get_app_state",
		{
			description:
				"Start an app use session if needed, then get the state of the app's key window and return a screenshot and accessibility tree.",
			inputSchema: getAppStateSchema,
		},
		async ({ app }): Promise<ToolResult> => {
			const state = await getAppStateForApp(computer, app);
			const content: ToolContent[] = [
				{ type: "image", data: state.screenshotBase64, mimeType: state.screenshotMimeType ?? "image/png" },
				{ type: "text", text: JSON.stringify({ ...state, screenshotBase64: undefined }, null, 2) },
			];
			if (state.appInstructions !== undefined) {
				content.push({
					type: "text",
					text: `<app_specific_instructions>\n${state.appInstructions}\n</app_specific_instructions>`,
				});
			}
			return { content };
		},
	);
}

function registerClickTool(server: McpServer, computer: ComputerInterface): void {
	server.registerTool(
		"click",
		{ description: "Click an element by index or pixel coordinates from screenshot.", inputSchema: clickSchema },
		async ({ app, element_index, x, y, click_count, mouse_button }): Promise<ToolResult> => {
			const targetPid = await resolveAppPid(computer, app);
			const pressCount = Math.max(1, Math.trunc(click_count ?? 1));
			if (element_index !== undefined) {
				await clickElementByIndex(computer, targetPid, parseElementIndex(element_index), pressCount, mouse_button);
				return clickComplete();
			}
			const point = await resolveScreenPoint(computer, targetPid, parseCoordinate(x, y));
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

function registerAccessibilityTools(server: McpServer, computer: ComputerInterface): void {
	server.registerTool(
		"perform_secondary_action",
		{
			description: "Invoke a secondary accessibility action exposed by an element.",
			inputSchema: performSecondaryActionSchema,
		},
		async ({ app, element_index, action }): Promise<ToolResult> => {
			await computer.performAction(await resolveAppPid(computer, app), parseElementIndex(element_index), action);
			return actionComplete();
		},
	);
	server.registerTool(
		"set_value",
		{ description: "Set the value of a settable accessibility element.", inputSchema: setValueSchema },
		async ({ app, element_index, value }): Promise<ToolResult> => {
			await computer.setValue(await resolveAppPid(computer, app), parseElementIndex(element_index), value);
			return actionComplete();
		},
	);
	server.registerTool(
		"select_text",
		{
			description:
				"Select text inside a text element, or place the text cursor before or after it. Use prefix or suffix to disambiguate repeated matches.",
			inputSchema: selectTextSchema,
		},
		async ({ app, element_index, text, prefix, suffix, selection }): Promise<ToolResult> => {
			await computer.selectText(await resolveAppPid(computer, app), parseElementIndex(element_index), {
				selection: selection ?? "text",
				...(text !== undefined ? { text } : {}),
				...(prefix !== undefined ? { prefix } : {}),
				...(suffix !== undefined ? { suffix } : {}),
			});
			return actionComplete();
		},
	);
}

function registerDragScrollAndTypeTools(server: McpServer, computer: ComputerInterface): void {
	server.registerTool(
		"drag",
		{ description: "Drag from one point to another using pixel coordinates.", inputSchema: dragSchema },
		async ({ app, from_x, from_y, to_x, to_y }): Promise<ToolResult> => {
			const targetPid = await resolveAppPid(computer, app);
			const dragOptions: DragOptions = {
				from: await resolveScreenPoint(computer, targetPid, { x: from_x, y: from_y }),
				to: await resolveScreenPoint(computer, targetPid, { x: to_x, y: to_y }),
			};
			await withTargetedApp(computer, targetPid, async () => computer.drag(dragOptions));
			return actionComplete();
		},
	);
	server.registerTool(
		"scroll",
		{ description: "Scroll an element in a direction by a number of pages.", inputSchema: scrollSchema },
		async ({ app, direction, element_index, pages }): Promise<ToolResult> => {
			if (element_index === undefined)
				throw new Error("scroll requires element_index of a scrollable accessibility element");
			await scrollElement(
				computer,
				await resolveAppPid(computer, app),
				parseElementIndex(element_index),
				direction,
				pages ?? 1,
			);
			return actionComplete();
		},
	);
	server.registerTool(
		"type_text",
		{ description: "Type literal text using keyboard input.", inputSchema: typeTextSchema },
		async ({ app, text }): Promise<ToolResult> => {
			const targetPid = await resolveAppPid(computer, app);
			if (await computer.typeIntoFocused(targetPid, text)) return actionComplete();
			await withTargetedApp(computer, targetPid, async () => computer.type(text));
			return actionComplete();
		},
	);
}

function parseCoordinate(x: number | undefined, y: number | undefined): { x: number; y: number } {
	if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
		throw new Error("click requires either element_index or finite x and y coordinates");
	}
	return { x, y };
}
