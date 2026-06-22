import type { ScrollOptions } from "../types/index.js";
import { scrollElement, withTargetedApp } from "./actions.js";
import type { ComputerInterface } from "./interface.js";
import { type KeySequenceEntry, pressKeySequence } from "./key-sequence.js";

const LINES_PER_PAGE = 10;

export type ScrollDirection = ScrollOptions["direction"];

export interface ExecuteScrollInput {
	readonly targetPid: number;
	readonly direction: ScrollDirection;
	readonly pages: number;
	readonly elementIndex?: number;
}

export async function executeScrollAction(computer: ComputerInterface, input: ExecuteScrollInput): Promise<void> {
	const pages = pageCount(input.pages);
	if (input.elementIndex !== undefined) {
		await scrollElement(computer, input.targetPid, input.elementIndex, input.direction, pages);
		return;
	}
	await withTargetedApp(computer, input.targetPid, async () => {
		await scrollWithoutElement(computer, input.direction, pages);
	});
}

async function scrollWithoutElement(
	computer: ComputerInterface,
	direction: ScrollDirection,
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
			await computer.scroll({ direction, amount: pages * LINES_PER_PAGE });
			return;
	}
}

function repeatKey(key: string, count: number): readonly KeySequenceEntry[] {
	return Array.from({ length: count }, () => ({ key }));
}

function pageCount(pages: number): number {
	return Math.max(1, Math.trunc(pages));
}
