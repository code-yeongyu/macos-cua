import { createCanvas } from "@napi-rs/canvas";

const BACKGROUND_FILL = "#f8fafc";
const BORDER_STROKE = "#0f172a";
const TEXT_FILL = "#111827";
const INSET_PX = 1.5;

export function renderTestCard(width: number, height: number, label: string): Buffer {
	const canvas = createCanvas(width, height);
	const context = canvas.getContext("2d");

	context.fillStyle = BACKGROUND_FILL;
	context.fillRect(0, 0, width, height);

	context.strokeStyle = BORDER_STROKE;
	context.lineWidth = 2;
	context.strokeRect(INSET_PX, INSET_PX, Math.max(0, width - INSET_PX * 2), Math.max(0, height - INSET_PX * 2));

	context.fillStyle = TEXT_FILL;
	context.font = `${labelFontSize(height)}px sans-serif`;
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillText(label, width / 2, height / 2);

	return canvas.toBuffer("image/png");
}

function labelFontSize(height: number): number {
	return Math.max(10, Math.min(24, Math.floor(height * 0.5)));
}
