import {
	type AXTreeElement,
	type AppState,
	type ComputerInterface,
	type Rect,
	type ScreenshotViewport,
	type Size,
	createDebugLog,
	parseElementIndex,
	resolveAppPid,
	screenshotPointToScreen,
} from "@macos-cua/core";
import { type Static, Type } from "typebox";

import { computeSomMarks } from "../computer-use/som-layout.js";
import { renderSomOverlay } from "../computer-use/som-render.js";
import { type ToolDefinition, defineTool } from "../pi/index.js";

const logZoom = createDebugLog("zoom");

const ZoomRegionParams = Type.Object(
	{
		x: Type.Number({ description: "Crop X coordinate in get_app_state screenshot pixels." }),
		y: Type.Number({ description: "Crop Y coordinate in get_app_state screenshot pixels." }),
		width: Type.Number({ description: "Crop width in get_app_state screenshot pixels." }),
		height: Type.Number({ description: "Crop height in get_app_state screenshot pixels." }),
	},
	{ additionalProperties: false },
);

export const ZoomParams = Type.Object(
	{
		app: Type.String({ description: "App name or bundle identifier." }),
		element_index: Type.Optional(Type.String({ description: "Element index from get_app_state to zoom around." })),
		region: Type.Optional(ZoomRegionParams),
	},
	{ additionalProperties: false },
);

export type ZoomInput = Static<typeof ZoomParams>;

export type ZoomDetails = {
	readonly rect: {
		readonly source: Rect;
		readonly screen: Rect;
		readonly crop: Size;
	};
	readonly marks: ReturnType<typeof computeSomMarks>["marks"];
};

export function cropScreenRect(rectInScreenshotPx: Rect, sourceViewport: ScreenshotViewport): Rect {
	const rect = positiveRect(rectInScreenshotPx, "rect");
	const topLeft = screenshotPointToScreen({ x: rect.x, y: rect.y }, sourceViewport);
	const bottomRight = screenshotPointToScreen({ x: rect.x + rect.width, y: rect.y + rect.height }, sourceViewport);
	return normalizeRect(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y);
}

export function remapFrameToCrop(
	frameInScreenshotPx: Rect,
	sourceViewport: ScreenshotViewport,
	screenRect: Rect,
	cropDims: Size,
): Rect {
	const screenFrame = cropScreenRect(frameInScreenshotPx, sourceViewport);
	const scaleX =
		positiveFinite(cropDims.width, "cropDims.width") / positiveFinite(screenRect.width, "screenRect.width");
	const scaleY =
		positiveFinite(cropDims.height, "cropDims.height") / positiveFinite(screenRect.height, "screenRect.height");
	return normalizeRect(
		(screenFrame.x - screenRect.x) * scaleX,
		(screenFrame.y - screenRect.y) * scaleY,
		(screenFrame.x + screenFrame.width - screenRect.x) * scaleX,
		(screenFrame.y + screenFrame.height - screenRect.y) * scaleY,
	);
}

export function createZoomTool(computer: ComputerInterface): ToolDefinition {
	return defineTool({
		name: "zoom",
		label: "Computer Use: zoom",
		description:
			"Capture a high-resolution crop of a get_app_state element_index or screenshot-pixel region, with numbered element_index labels inside the crop.",
		parameters: ZoomParams,
		async execute(_toolCallId, params) {
			const targetPid = await resolveAppPid(computer, params.app);
			const state = await computer.getAppState(targetPid);
			const sourceViewport = await computer.getScreenshotViewport(targetPid);
			if (sourceViewport === undefined) {
				throw new Error("zoom requires a prior window-scoped get_app_state screenshot for the target app");
			}
			const sourceRect = sourceRectForTarget(params, state);
			const screenRect = cropScreenRect(sourceRect, sourceViewport);
			const crop = await computer.screenshot({ region: screenRect });
			const cropDims = { width: crop.width, height: crop.height };
			const cropState = appStateForCrop(state, sourceViewport, screenRect, cropDims);
			const layout = computeSomMarks(cropState);
			const annotated = renderSomOverlay(crop.data, layout.marks);
			const details: ZoomDetails = {
				rect: { source: sourceRect, screen: screenRect, crop: cropDims },
				marks: layout.marks,
			};
			logZoom("crop", { cropW: crop.width, cropH: crop.height, marks: layout.marks });
			return {
				content: [
					{ type: "image" as const, data: annotated.toString("base64"), mimeType: crop.mimeType },
					{
						type: "text" as const,
						text: "The zoom numbers are element_index values. To click a target from this crop, call click element_index=<number>.",
					},
				],
				details,
			};
		},
	});
}

function sourceRectForTarget(params: ZoomInput, state: AppState): Rect {
	const hasElement = params.element_index !== undefined;
	const hasRegion = params.region !== undefined;
	if (hasElement === hasRegion) {
		throw new Error("zoom requires exactly one of element_index or region");
	}
	if (params.region !== undefined) {
		return positiveRect(params.region, "region");
	}
	const elementIndexInput = params.element_index;
	if (elementIndexInput === undefined) {
		throw new Error("zoom requires exactly one of element_index or region");
	}
	const elementIndex = parseElementIndex(elementIndexInput);
	const element = state.elements.find((candidate) => candidate.id === elementIndex);
	if (element === undefined) {
		throw new Error(`Element index ${elementIndex} not found in AX tree`);
	}
	return positiveRect(element.frame, "element frame");
}

function appStateForCrop(
	state: AppState,
	sourceViewport: ScreenshotViewport,
	screenRect: Rect,
	cropDims: Size,
): AppState {
	const cropBounds = { x: 0, y: 0, width: cropDims.width, height: cropDims.height };
	return {
		...state,
		elements: cropElements(state.elements, sourceViewport, screenRect, cropDims, cropBounds),
		screenshotBase64: "",
		screenshotWidth: cropDims.width,
		screenshotHeight: cropDims.height,
		windowBounds: screenRect,
	};
}

function cropElements(
	elements: readonly AXTreeElement[],
	sourceViewport: ScreenshotViewport,
	screenRect: Rect,
	cropDims: Size,
	cropBounds: Rect,
): AXTreeElement[] {
	const cropped: AXTreeElement[] = [];
	for (const element of elements) {
		if (!isPositiveRect(element.frame)) {
			continue;
		}
		if (!rectsIntersect(cropScreenRect(element.frame, sourceViewport), screenRect)) {
			continue;
		}
		const frame = clipRect(remapFrameToCrop(element.frame, sourceViewport, screenRect, cropDims), cropBounds);
		if (frame !== undefined) {
			cropped.push({ ...element, frame });
		}
	}
	return cropped;
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

function rectsIntersect(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function isPositiveRect(rect: Rect): boolean {
	return (
		Number.isFinite(rect.x) &&
		Number.isFinite(rect.y) &&
		Number.isFinite(rect.width) &&
		Number.isFinite(rect.height) &&
		rect.width > 0 &&
		rect.height > 0
	);
}

function positiveRect(rect: Rect, name: string): Rect {
	return {
		x: finite(rect.x, `${name}.x`),
		y: finite(rect.y, `${name}.y`),
		width: positiveFinite(rect.width, `${name}.width`),
		height: positiveFinite(rect.height, `${name}.height`),
	};
}

function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
	const left = Math.min(x1, x2);
	const top = Math.min(y1, y2);
	const right = Math.max(x1, x2);
	const bottom = Math.max(y1, y2);
	return {
		x: Math.round(left),
		y: Math.round(top),
		width: Math.max(1, Math.round(right - left)),
		height: Math.max(1, Math.round(bottom - top)),
	};
}

function positiveFinite(value: number, name: string): number {
	const finiteValue = finite(value, name);
	if (finiteValue <= 0) {
		throw new Error(`${name} must be positive`);
	}
	return finiteValue;
}

function finite(value: number, name: string): number {
	if (!Number.isFinite(value)) {
		throw new Error(`${name} must be finite`);
	}
	return value;
}
