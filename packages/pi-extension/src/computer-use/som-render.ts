import { createDebugLog } from "@macos-cua/core";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import type { SomMark } from "./som-layout.js";

const SOM_PALETTE = ["#ff1744", "#00c853", "#2979ff", "#ffab00", "#d500f9", "#00b8d4", "#ff6d00", "#76ff03"] as const;
const STROKE_WIDTH = 2;
const LABEL_FONT = "12px sans-serif";
const LABEL_BACKGROUND_FILL = "rgba(15, 23, 42, 0.76)";
const LABEL_TEXT_FILL = "#ffffff";
const LABEL_TEXT_X_PADDING = 4;
const LABEL_TEXT_Y_OFFSET = 1;
const logOverlay = createDebugLog("overlay");

export async function renderSomOverlay(imageBytes: Buffer, marks: readonly SomMark[]): Promise<Buffer> {
	if (marks.length === 0) {
		return imageBytes;
	}

	try {
		const image = await loadImage(imageBytes);
		if (image.width <= 0 || image.height <= 0) {
			logOverlay("skip", {
				reason: "InvalidImageDimensions",
				byteLength: imageBytes.byteLength,
				markCount: marks.length,
			});
			return imageBytes;
		}

		const canvas = createCanvas(image.width, image.height);
		const context = canvas.getContext("2d");
		context.drawImage(image, 0, 0);

		for (const mark of marks) {
			const stroke = markColor(mark);
			context.strokeStyle = stroke;
			context.lineWidth = STROKE_WIDTH;
			context.strokeRect(mark.box.x, mark.box.y, mark.box.width, mark.box.height);

			context.fillStyle = LABEL_BACKGROUND_FILL;
			context.fillRect(mark.labelBox.x, mark.labelBox.y, mark.labelBox.width, mark.labelBox.height);

			context.fillStyle = LABEL_TEXT_FILL;
			context.font = LABEL_FONT;
			context.textAlign = "left";
			context.textBaseline = "middle";
			context.fillText(
				mark.label,
				mark.labelBox.x + LABEL_TEXT_X_PADDING,
				mark.labelBox.y + mark.labelBox.height / 2 + LABEL_TEXT_Y_OFFSET,
				Math.max(0, mark.labelBox.width - LABEL_TEXT_X_PADDING * 2),
			);
		}

		return canvas.toBuffer("image/png");
	} catch (error) {
		if (error instanceof Error) {
			logOverlay("skip", {
				reason: error.name,
				message: error.message,
				byteLength: imageBytes.byteLength,
				markCount: marks.length,
			});
			return imageBytes;
		}

		logOverlay("skip", {
			reason: "NonErrorThrow",
			byteLength: imageBytes.byteLength,
			markCount: marks.length,
		});
		return imageBytes;
	}
}

function markColor(mark: SomMark): string {
	const normalizedIndex = ((mark.colorIndex % SOM_PALETTE.length) + SOM_PALETTE.length) % SOM_PALETTE.length;
	return SOM_PALETTE[normalizedIndex] ?? SOM_PALETTE[0];
}
