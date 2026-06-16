import type { AXTreeElement, AppState } from "@macos-cua/core";
import { describe, expect, it } from "vitest";

import { computeSomMarks } from "./som-layout.js";

const BASE_STATE: AppState = {
	app: "Fixture",
	bundleId: "com.example.fixture",
	pid: 42,
	frontmost: true,
	axAvailable: true,
	elements: [],
	screenshotBase64: "",
	screenshotWidth: 400,
	screenshotHeight: 300,
	display: { width: 400, height: 300, scaleFactor: 1 },
	windowBounds: { x: 0, y: 0, width: 400, height: 300 },
};

function element(input: {
	readonly id: number;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly label?: string | null;
	readonly value?: string | null;
	readonly actions?: readonly string[];
}): AXTreeElement {
	return {
		id: input.id,
		role: "AXButton",
		label: input.label ?? null,
		value: input.value ?? null,
		frame: { x: input.x, y: input.y, width: input.width, height: input.height },
		actions: [...(input.actions ?? [])],
		children: [],
	};
}

function stateWith(elements: readonly AXTreeElement[], overrides: Partial<AppState> = {}): AppState {
	return { ...BASE_STATE, ...overrides, elements: [...elements] };
}

describe("#given normalized elements whose id differs from array index #when computing SoM marks #then labels use element ids", () => {
	it("labels a filtered interactive element with String(element.id)", () => {
		const layout = computeSomMarks(
			stateWith([
				element({ id: 0, x: 0, y: 0, width: 400, height: 300 }),
				element({ id: 5, x: 30, y: 40, width: 60, height: 24, label: "Five", actions: ["AXPress"] }),
			]),
		);

		expect(layout.dropped).toBe(0);
		expect(layout.marks).toHaveLength(1);
		expect(layout.marks[0]).toMatchObject({ id: 5, label: "5", colorIndex: 0 });
		expect(layout.marks[0]?.label).not.toBe("1");
	});
});

describe("#given elements outside drawable criteria #when computing SoM marks #then tiny and offscreen frames are filtered", () => {
	it("keeps only eligible in-bounds descriptive or interactive elements", () => {
		const layout = computeSomMarks(
			stateWith([
				element({ id: 1, x: 10, y: 10, width: 9, height: 30, label: "Tiny width" }),
				element({ id: 2, x: 10, y: 10, width: 30, height: 9, actions: ["AXPress"] }),
				element({ id: 3, x: -1, y: 10, width: 30, height: 30, label: "Off left" }),
				element({ id: 4, x: 390, y: 10, width: 20, height: 20, label: "Off right" }),
				element({ id: 5, x: 10, y: 10, width: 30, height: 30 }),
				element({ id: 6, x: 20, y: 20, width: 30, height: 30, value: "descriptive value" }),
			]),
		);

		expect(layout.marks.map((mark) => mark.id)).toEqual([6]);
		expect(layout.dropped).toBe(0);
	});
});

describe("#given neighboring marks #when computing SoM labels #then label boxes avoid collisions", () => {
	it("places the second label in a non-intersecting candidate position", () => {
		const layout = computeSomMarks(
			stateWith([
				element({ id: 101, x: 40, y: 40, width: 60, height: 30, label: "First" }),
				element({ id: 102, x: 108, y: 40, width: 60, height: 30, label: "Second" }),
			]),
		);

		expect(layout.marks).toHaveLength(2);
		const first = layout.marks[0]?.labelBox;
		const second = layout.marks[1]?.labelBox;

		expect(first).toBeDefined();
		expect(second).toBeDefined();
		expect(first && second ? boxesIntersect(first, second) : true).toBe(false);
	});
});

describe("#given more eligible elements than the SoM cap #when computing SoM marks #then largest areas are kept and dropped is counted", () => {
	it("returns 200 marks ordered by descending frame area with the remainder dropped", () => {
		const elements = Array.from({ length: 205 }, (_, index) =>
			element({
				id: index + 1,
				x: index % 20,
				y: Math.floor(index / 20),
				width: 20 + index,
				height: 10,
				actions: ["AXPress"],
			}),
		);

		const layout = computeSomMarks(stateWith(elements, { screenshotWidth: 260, screenshotHeight: 220 }));

		expect(layout.marks).toHaveLength(200);
		expect(layout.dropped).toBe(5);
		expect(layout.marks[0]?.id).toBe(205);
		expect(layout.marks.at(-1)?.id).toBe(6);
	});
});

describe("#given unavailable AX or unscoped screenshot state #when computing SoM marks #then no marks are returned", () => {
	it("returns an empty layout when the screenshot has no window bounds", () => {
		const layout = computeSomMarks(
			stateWith([element({ id: 1, x: 10, y: 10, width: 40, height: 40, actions: ["AXPress"] })], {
				windowBounds: undefined,
			}),
		);

		expect(layout).toEqual({ marks: [], dropped: 0 });
	});

	it("returns an empty layout when accessibility is unavailable", () => {
		const layout = computeSomMarks(
			stateWith([element({ id: 1, x: 10, y: 10, width: 40, height: 40, actions: ["AXPress"] })], {
				axAvailable: false,
			}),
		);

		expect(layout).toEqual({ marks: [], dropped: 0 });
	});
});

function boxesIntersect(
	a: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
	b: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
