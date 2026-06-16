import type { AXTreeElement, AppState } from "@macos-cua/core";

export const MIN_MARK_PX = 10;
export const MAX_MARKS = 200;

const LABEL_HEIGHT = 18;
const LABEL_CHAR_WIDTH = 8;
const LABEL_X_PADDING = 8;
const LABEL_GAP = 2;

const SOM_PALETTE = ["#ff1744", "#00c853", "#2979ff", "#ffab00", "#d500f9", "#00b8d4", "#ff6d00", "#76ff03"] as const;

type Box = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
};

export type SomMark = {
	readonly id: number;
	readonly box: Box;
	readonly label: string;
	readonly labelBox: Box;
	readonly colorIndex: number;
};

export type SomLayout = {
	readonly marks: readonly SomMark[];
	readonly dropped: number;
};

export function computeSomMarks(state: AppState): SomLayout {
	if (!state.windowBounds || !state.axAvailable || state.elements.length === 0) {
		return { marks: [], dropped: 0 };
	}

	const candidates = state.elements
		.map((element, order) => ({ element, order, area: frameArea(element.frame) }))
		.filter((candidate) => isEligible(candidate.element, state.screenshotWidth, state.screenshotHeight))
		.sort((a, b) => b.area - a.area || a.order - b.order);
	const kept = candidates.slice(0, MAX_MARKS);
	const dropped = Math.max(0, candidates.length - kept.length);
	const placedLabels: Box[] = [];
	const marks = kept.map((candidate, order) => {
		const box = normalizeBox(candidate.element.frame);
		const label = String(candidate.element.id);
		const labelBox = placeLabelBox(label, box, state.screenshotWidth, state.screenshotHeight, placedLabels);
		placedLabels.push(labelBox);
		return {
			id: candidate.element.id,
			box,
			label,
			labelBox,
			colorIndex: order % SOM_PALETTE.length,
		};
	});

	return { marks, dropped };
}

function isEligible(element: AXTreeElement, screenshotWidth: number, screenshotHeight: number): boolean {
	const frame = element.frame;
	return (
		frame.width >= MIN_MARK_PX &&
		frame.height >= MIN_MARK_PX &&
		frame.x >= 0 &&
		frame.y >= 0 &&
		frame.x + frame.width <= screenshotWidth &&
		frame.y + frame.height <= screenshotHeight &&
		(hasInteractiveAction(element) || hasDescription(element))
	);
}

function hasInteractiveAction(element: AXTreeElement): boolean {
	return element.actions.length > 0;
}

function hasDescription(element: AXTreeElement): boolean {
	return hasText(element.label) || hasText(element.value);
}

function hasText(value: string | null): boolean {
	return value !== null && value.trim().length > 0;
}

function frameArea(box: Box): number {
	return box.width * box.height;
}

function normalizeBox(box: Box): Box {
	return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function placeLabelBox(
	label: string,
	box: Box,
	screenshotWidth: number,
	screenshotHeight: number,
	placedLabels: readonly Box[],
): Box {
	const labelSize = {
		width: label.length * LABEL_CHAR_WIDTH + LABEL_X_PADDING,
		height: LABEL_HEIGHT,
	};
	const candidates = labelCandidates(box, labelSize, screenshotWidth, screenshotHeight);
	const firstOpen = candidates.find((candidate) =>
		placedLabels.every((placedLabel) => !boxesIntersect(candidate, placedLabel)),
	);
	const fallback = candidates.at(-1);
	return firstOpen ?? fallback ?? { x: box.x, y: box.y, ...labelSize };
}

function labelCandidates(
	box: Box,
	labelSize: { readonly width: number; readonly height: number },
	screenshotWidth: number,
	screenshotHeight: number,
): readonly Box[] {
	return [
		labelBox(box.x, box.y - labelSize.height - LABEL_GAP, labelSize, screenshotWidth, screenshotHeight),
		labelBox(
			box.x + box.width - labelSize.width,
			box.y - labelSize.height - LABEL_GAP,
			labelSize,
			screenshotWidth,
			screenshotHeight,
		),
		labelBox(box.x, box.y + box.height + LABEL_GAP, labelSize, screenshotWidth, screenshotHeight),
		labelBox(
			box.x + box.width - labelSize.width,
			box.y + box.height + LABEL_GAP,
			labelSize,
			screenshotWidth,
			screenshotHeight,
		),
		labelBox(box.x + LABEL_GAP, box.y + LABEL_GAP, labelSize, screenshotWidth, screenshotHeight),
		labelBox(
			box.x + box.width - labelSize.width - LABEL_GAP,
			box.y + LABEL_GAP,
			labelSize,
			screenshotWidth,
			screenshotHeight,
		),
		labelBox(
			box.x + LABEL_GAP,
			box.y + box.height - labelSize.height - LABEL_GAP,
			labelSize,
			screenshotWidth,
			screenshotHeight,
		),
		labelBox(
			box.x + box.width - labelSize.width - LABEL_GAP,
			box.y + box.height - labelSize.height - LABEL_GAP,
			labelSize,
			screenshotWidth,
			screenshotHeight,
		),
	];
}

function labelBox(
	x: number,
	y: number,
	size: { readonly width: number; readonly height: number },
	screenshotWidth: number,
	screenshotHeight: number,
): Box {
	return {
		x: clamp(x, 0, Math.max(0, screenshotWidth - size.width)),
		y: clamp(y, 0, Math.max(0, screenshotHeight - size.height)),
		width: size.width,
		height: size.height,
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function boxesIntersect(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
