import {
	type ComputerInterface,
	type DragOptions,
	clickElementByIndex,
	clickPoint,
	getAppStateForApp,
	parseElementIndex,
	pressKeySequence,
	resolveAppPid,
	resolveScreenPoint,
	scrollElement,
	withTargetedApp,
} from "@macos-cua/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createAppStateCache } from "./app-state-cache.js";
import { appStateImageContent } from "./app-state-image.js";
import { registerBatchTool } from "./batch-tool.js";
import { registerPressKeysTool } from "./press-keys.js";
import { type ToolContent, type ToolResult, actionComplete, clickComplete, textResult } from "./tool-result.js";
import { registerZoomTool } from "./zoom.js";

const SCROLL_HINT =
	"Call get_app_state to fetch the updated UI state. For browser pages, scroll without element_index uses page_down/page_up keys. If axChangeSummary is 0/0/0, retry with a scrollable element_index from get_app_state, or use press_keys with page_down, page_up, space, or shift+space.";

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
	const appStateCache = createAppStateCache();
	registerListAppsTool(server, computer);
	registerGetAppStateTool(server, computer, appStateCache);
	registerClickTool(server, computer);
	registerAccessibilityTools(server, computer);
	registerDragScrollAndTypeTools(server, computer);
	registerZoomTool(server, computer, appStateCache);
	registerPressKeysTool(server, computer, actionComplete);
	registerBatchTool(server, computer, appStateCache);
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

function registerGetAppStateTool(
	server: McpServer,
	computer: ComputerInterface,
	appStateCache: ReturnType<typeof createAppStateCache>,
): void {
	server.registerTool(
		"get_app_state",
		{
			description:
				"Start an app use session if needed, then get the state of the app's key window and return a screenshot and accessibility tree.",
			inputSchema: getAppStateSchema,
		},
		async ({ app }): Promise<ToolResult> => {
			const state = await getAppStateForApp(computer, app);
			appStateCache.store(state);
			const image = await appStateImageContent(state);
			const content: ToolContent[] = [
				{ type: "image", data: image.data, mimeType: image.mimeType },
				{ type: "text", text: JSON.stringify({ ...state, screenshotBase64: undefined }, null, 2) },
			];
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
		{
			description:
				"Scroll a page or accessibility element. Without element_index, vertical browser scrolling uses page_down/page_up keys; with element_index, it invokes AX page-scroll on that element.",
			inputSchema: scrollSchema,
		},
		async ({ app, direction, element_index, pages }): Promise<ToolResult> => {
			const pageCount = Math.max(1, Math.trunc(pages ?? 1));
			const targetPid = await resolveAppPid(computer, app);
			if (element_index !== undefined) {
				await scrollElement(computer, targetPid, parseElementIndex(element_index), direction, pageCount);
				return actionCompleteWithHint(SCROLL_HINT);
			}
			await withTargetedApp(computer, targetPid, async () => {
				await scrollWithoutElement(computer, direction, pageCount);
			});
			return actionCompleteWithHint(SCROLL_HINT);
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

async function scrollWithoutElement(
	computer: ComputerInterface,
	direction: z.infer<typeof scrollSchema>["direction"],
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
			await computer.scroll({ direction, amount: pages * 10 });
			return;
	}
}

function repeatKey(key: string, count: number): readonly { readonly key: string }[] {
	return Array.from({ length: count }, () => ({ key }));
}

function actionCompleteWithHint(recoveryHint: string): ToolResult {
	return textResult(JSON.stringify({ ok: true, code: "ACTION_COMPLETED", recoveryHint, auditRef: null }));
}

function parseCoordinate(x: number | undefined, y: number | undefined): { x: number; y: number } {
	if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
		throw new Error("click requires either element_index or finite x and y coordinates");
	}
	return { x, y };
}
