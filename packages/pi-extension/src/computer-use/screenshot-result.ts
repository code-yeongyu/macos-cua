import type { ComputerInterface, Point, ScreenshotResult } from "@macos-cua/core";

import type { ComputerUseResult } from "../anthropic-computer-use.js";
import type { DisplayConfig } from "./coords.js";
import { containsDisplayPoint, cursorImagePoint } from "./screenshot-cursor-geometry.js";
import { drawCursorOnScreenshot as drawCursorOnExactScreenshot, ensureModelDimensions } from "./screenshot-png.js";
export { drawCursorOnScreenshot } from "./screenshot-png.js";
export { drawCursorOnWindowScreenshot } from "./screenshot-window-cursor.js";

type CursorScreenshotComputer = Pick<ComputerInterface, "getCursorPosition" | "screenshot">;
type ScreenshotDowngradeReason = "adaptive_target_downscale" | "capture_dimensions_mismatch";
export type ScreenshotFidelityMetadata = {
	readonly format: ScreenshotResult["mimeType"];
	readonly byteCount: number;
	readonly downgraded: boolean;
	readonly reason?: ScreenshotDowngradeReason;
	readonly actual: {
		readonly width: number;
		readonly height: number;
	};
	readonly target: {
		readonly width: number;
		readonly height: number;
	};
	readonly original?: {
		readonly width: number;
		readonly height: number;
	};
};
export type ScreenshotCursorMetadata = {
	readonly captureFrame: {
		readonly width: number;
		readonly height: number;
	};
	readonly cursor: {
		readonly logical: Point;
		readonly image?: Point;
	};
	readonly fidelity: ScreenshotFidelityMetadata;
};
export type ScreenshotResultWithCursorMetadata = {
	readonly result: ComputerUseResult;
	readonly metadata: ScreenshotCursorMetadata;
};

export async function screenshotResultWithCursor(
	computer: CursorScreenshotComputer,
	display: DisplayConfig,
): Promise<ComputerUseResult> {
	return (await screenshotResultWithCursorMetadata(computer, display)).result;
}

export async function screenshotResultWithCursorMetadata(
	computer: CursorScreenshotComputer,
	display: DisplayConfig,
): Promise<ScreenshotResultWithCursorMetadata> {
	const captureFrame = { width: display.modelWidth, height: display.modelHeight };
	const screenshot = await computer.screenshot({
		targetSize: captureFrame,
	});
	const cursor = await computer.getCursorPosition();
	const exactScreenshot = ensureModelDimensions(screenshot, display);
	const cursorImage = containsDisplayPoint(display, cursor)
		? cursorImagePoint(cursor, display, {
				width: exactScreenshot.screenshot.width,
				height: exactScreenshot.screenshot.height,
			})
		: undefined;
	const cursorMetadata = cursorImage === undefined ? { logical: cursor } : { logical: cursor, image: cursorImage };
	const imageData = drawCursorOnExactScreenshot(exactScreenshot.screenshot, cursor, display);
	const metadata = {
		captureFrame,
		cursor: cursorMetadata,
		fidelity: {
			...exactScreenshot.fidelity,
			byteCount: imageData.byteLength,
		},
	};
	return {
		result: imageResult(imageData.toString("base64"), exactScreenshot.screenshot.mimeType, metadata),
		metadata,
	};
}

function imageResult(
	imageBase64: string,
	mimeType: ScreenshotResult["mimeType"],
	metadata: ScreenshotCursorMetadata,
): ComputerUseResult {
	return { content: [{ type: "image", data: imageBase64, mimeType }], details: metadata };
}
