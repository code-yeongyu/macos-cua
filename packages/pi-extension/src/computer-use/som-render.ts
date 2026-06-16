import { createDebugLog } from "@macos-cua/core";
import { Image, createCanvas } from "@napi-rs/canvas";

import type { SomMark } from "./som-layout.js";

const SOM_PALETTE = ["#ff1744", "#00c853", "#2979ff", "#ffab00", "#d500f9", "#00b8d4", "#ff6d00", "#76ff03"] as const;
const STROKE_WIDTH = 2;
const LABEL_FONT = "12px sans-serif";
const LABEL_BACKGROUND_FILL = "rgba(15, 23, 42, 0.76)";
const LABEL_TEXT_FILL = "#ffffff";
const LABEL_TEXT_X_PADDING = 4;
const LABEL_TEXT_Y_OFFSET = 1;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const logOverlay = createDebugLog("overlay");

export function renderSomOverlay(pngBytes: Buffer, marks: readonly SomMark[]): Buffer {
	if (marks.length === 0) {
		return pngBytes;
	}

	if (!hasPngSignature(pngBytes)) {
		logOverlay("skip", {
			reason: "InvalidPngSignature",
			byteLength: pngBytes.byteLength,
			markCount: marks.length,
		});
		return pngBytes;
	}

	try {
		const image = new Image();
		image.src = pngBytes;

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
				byteLength: pngBytes.byteLength,
				markCount: marks.length,
			});
			return pngBytes;
		}

		logOverlay("skip", {
			reason: "NonErrorThrow",
			byteLength: pngBytes.byteLength,
			markCount: marks.length,
		});
		return pngBytes;
	}
}

function markColor(mark: SomMark): string {
	const normalizedIndex = ((mark.colorIndex % SOM_PALETTE.length) + SOM_PALETTE.length) % SOM_PALETTE.length;
	return SOM_PALETTE[normalizedIndex] ?? SOM_PALETTE[0];
}

function hasPngSignature(bytes: Buffer): boolean {
	return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}
