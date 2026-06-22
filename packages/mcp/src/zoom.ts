import {
	type AXTreeElement,
	type CaptureFrame,
	type ComputerInterface,
	type Rect,
	type ScreenshotViewport,
	type Size,
	parseElementIndex,
	resolveAppPid,
	screenshotPointToScreen,
} from "@macos-cua/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { AppStateCache } from "./app-state-cache.js";
import type { ToolResult } from "./tool-result.js";

const zoomSchema = z.object({
	app: z.string().min(1),
	element_index: z.string().optional(),
	region: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
});

export function registerZoomTool(server: McpServer, computer: ComputerInterface, cache?: AppStateCache): void {
	server.registerTool(
		"zoom",
		{
			description: "Capture a high-resolution crop for an element_index or screenshot-pixel region.",
			inputSchema: zoomSchema,
		},
		async ({ app, element_index, region }): Promise<ToolResult> => {
			const targetPid = await resolveAppPid(computer, app);
			const state = cache?.get(targetPid) ?? (await computer.getAppState(targetPid));
			const viewport = state.captureFrame ?? (await computer.getScreenshotViewport(targetPid));
			if (viewport === undefined) {
				throw new Error("zoom requires a prior window-scoped get_app_state screenshot for the target app");
			}
			const source = zoomSourceRect(element_index, region, state.elements);
			const screen = cropScreenRect(source, viewport);
			const crop = await computer.screenshot({ region: screen });
			const cropBounds = { x: 0, y: 0, width: crop.width, height: crop.height };
			const marks = state.elements
				.map((element) => ({ element, frame: clipRect(element.frame, screenshotBounds(viewport)) }))
				.filter(hasClippedFrame)
				.filter(({ element }) => shouldMarkElement(element))
				.filter((entry) => rectsIntersect(cropScreenRect(entry.frame, viewport), screen))
				.map((entry) => ({
					id: entry.element.id,
					frame: clipRect(
						remapFrameToCrop(entry.frame, viewport, screen, { width: crop.width, height: crop.height }),
						cropBounds,
					),
				}))
				.filter(hasMarkFrame);
			return {
				content: [
					{ type: "image", data: crop.data.toString("base64"), mimeType: crop.mimeType },
					{
						type: "text",
						text: JSON.stringify(
							{
								message:
									"The zoom numbers are element_index values. To click a target from this crop, call click element_index=<number>.",
								rect: { source, screen, crop: { width: crop.width, height: crop.height } },
								marks,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);
}

function zoomSourceRect(
	elementIndex: string | undefined,
	region: Rect | undefined,
	elements: readonly AXTreeElement[],
): Rect {
	if ((elementIndex === undefined) === (region === undefined)) {
		throw new Error("zoom requires exactly one of element_index or region");
	}
	if (region !== undefined) {
		return positiveRect(region, "region");
	}
	if (elementIndex === undefined) {
		throw new Error("zoom requires exactly one of element_index or region");
	}
	const index = parseElementIndex(elementIndex);
	const element = elements.find((candidate) => candidate.id === index);
	if (element === undefined) {
		throw new Error(`Element index ${index} not found in AX tree`);
	}
	return positiveRect(element.frame, "element frame");
}

function cropScreenRect(rect: Rect, viewport: ScreenshotViewport): Rect {
	const source = positiveRect(rect, "rect");
	const topLeft = screenshotPointToScreen({ x: source.x, y: source.y }, viewport);
	const bottomRight = screenshotPointToScreen({ x: source.x + source.width, y: source.y + source.height }, viewport);
	return normalizeRect(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y);
}

function remapFrameToCrop(frame: Rect, viewport: ScreenshotViewport, screen: Rect, crop: Size): Rect {
	const screenFrame = cropScreenRect(frame, viewport);
	return normalizeRect(
		((screenFrame.x - screen.x) * crop.width) / screen.width,
		((screenFrame.y - screen.y) * crop.height) / screen.height,
		((screenFrame.x + screenFrame.width - screen.x) * crop.width) / screen.width,
		((screenFrame.y + screenFrame.height - screen.y) * crop.height) / screen.height,
	);
}

function clipRect(rect: Rect, bounds: Rect): Rect | undefined {
	const x = Math.max(rect.x, bounds.x);
	const y = Math.max(rect.y, bounds.y);
	const right = Math.min(rect.x + rect.width, bounds.x + bounds.width);
	const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height);
	if (right <= x || bottom <= y) {
		return undefined;
	}
	return { x, y, width: right - x, height: bottom - y };
}

function hasClippedFrame(entry: {
	readonly element: AXTreeElement;
	readonly frame: Rect | undefined;
}): entry is { readonly element: AXTreeElement; readonly frame: Rect } {
	return entry.frame !== undefined;
}

function hasMarkFrame(entry: {
	readonly id: number;
	readonly frame: Rect | undefined;
}): entry is { readonly id: number; readonly frame: Rect } {
	return entry.frame !== undefined;
}

function shouldMarkElement(element: AXTreeElement): boolean {
	return hasInteractiveAction(element) || hasDescription(element);
}

function hasInteractiveAction(element: AXTreeElement): boolean {
	return element.actions.length > 0;
}

function hasDescription(element: AXTreeElement): boolean {
	if (element.role === "AXStaticText") {
		return false;
	}
	return hasText(element.label) || hasText(element.value);
}

function hasText(value: string | null): boolean {
	return value !== null && value.trim().length > 0;
}

function screenshotBounds(viewport: ScreenshotViewport): Rect {
	if (isCaptureFrameViewport(viewport)) {
		return { x: 0, y: 0, width: viewport.model.width, height: viewport.model.height };
	}
	return { x: 0, y: 0, width: viewport.screenshotWidth, height: viewport.screenshotHeight };
}

function isCaptureFrameViewport(viewport: ScreenshotViewport): viewport is CaptureFrame {
	return "model" in viewport;
}

function rectsIntersect(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function positiveRect(rect: Rect, name: string): Rect {
	if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
		throw new Error(`${name} must be a positive finite rect`);
	}
	return rect;
}

function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
	return {
		x: Math.round(Math.min(x1, x2)),
		y: Math.round(Math.min(y1, y2)),
		width: Math.max(1, Math.round(Math.abs(x2 - x1))),
		height: Math.max(1, Math.round(Math.abs(y2 - y1))),
	};
}
