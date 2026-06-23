import type { ComputerInterface, Point } from "@macos-cua/core";

import { ComputerUseError, toComputerUseExecutionError } from "./anthropic-computer-error.js";
import type { ComputerToolInput } from "./anthropic-payload.js";
import { type CaptureFreshnessMarker, type DisplayConfig, unscaleCoord } from "./computer-use/coords.js";
import { type ScreenshotCursorMetadata, screenshotResultWithCursor } from "./computer-use/screenshot-result.js";
import type { AgentToolResult } from "./pi/index.js";
import { formatActionComplete } from "./surface-vocabulary.js";

export type ComputerUseResult = AgentToolResult<ScreenshotCursorMetadata | undefined>;
type KeyModifier = "command" | "option" | "control" | "shift";
type ScrollDirection = "up" | "down" | "left" | "right";

export interface ComputerActionDriver extends Omit<ComputerInterface, "key" | "scroll"> {
	key(key: string, options?: { readonly modifiers?: readonly KeyModifier[] }): Promise<void>;
	scroll(options: { readonly direction: ScrollDirection; readonly amount: number }): Promise<void>;
}

const TRIPLE_CLICK_GAP_MILLISECONDS = 30;
const DEFAULT_DRAG_DURATION_MILLISECONDS = 500;
const MAX_WAIT_SECONDS = 10;

export async function executeNativeComputerAction(
	input: ComputerToolInput,
	computer: ComputerActionDriver,
	display: DisplayConfig,
	freshness?: CaptureFreshnessMarker,
): Promise<ComputerUseResult> {
	try {
		switch (input.action) {
			case "screenshot":
				return await screenshotResultWithCursor(computer, display);
			case "mouse_move":
				await computer.move(unscaleCoord(parseCoordinate(input.coordinate, "mouse_move"), display, freshness));
				return okResult(input.action);
			case "left_click":
				await computer.click(unscaleCoord(parseCoordinate(input.coordinate, "left_click"), display, freshness));
				return okResult(input.action);
			case "right_click":
				await computer.rightClick(
					unscaleCoord(parseCoordinate(input.coordinate, "right_click"), display, freshness),
				);
				return okResult(input.action);
			case "middle_click":
				await computer.middleClick(
					unscaleCoord(parseCoordinate(input.coordinate, "middle_click"), display, freshness),
				);
				return okResult(input.action);
			case "double_click":
				await computer.doubleClick(
					unscaleCoord(parseCoordinate(input.coordinate, "double_click"), display, freshness),
				);
				return okResult(input.action);
			case "triple_click":
				await tripleClick(
					computer,
					unscaleCoord(parseCoordinate(input.coordinate, "triple_click"), display, freshness),
				);
				return okResult(input.action);
			case "left_click_drag":
				await computer.drag({
					from: unscaleCoord(
						parseCoordinate(input.start_coordinate, "left_click_drag.start_coordinate"),
						display,
						freshness,
					),
					to: unscaleCoord(parseCoordinate(input.coordinate, "left_click_drag.coordinate"), display, freshness),
					duration: DEFAULT_DRAG_DURATION_MILLISECONDS,
				});
				return okResult(input.action);
			case "cursor_position": {
				const position = scaleCoord(await computer.getCursorPosition(), display);
				return textResult(`${position.x},${position.y}`);
			}
			case "key": {
				const combo = parseKeyCombo(input.text ?? input.key);
				await computer.key(combo.key, combo.modifiers.length === 0 ? undefined : { modifiers: combo.modifiers });
				return okResult(input.action);
			}
			case "type":
				await computer.type(parseText(input.text, "type"));
				return okResult(input.action);
			case "scroll":
				await computer.scroll(parseScroll(input.scroll_direction, input.scroll_amount));
				return okResult(input.action);
			case "wait":
				await sleep(parseWaitDurationMilliseconds(input.duration));
				return textResult("wait complete");
			case "left_mouse_down":
			case "left_mouse_up":
			case "hold_key":
				throwUnsupportedAction(input.action);
		}
	} catch (error) {
		throw toComputerUseExecutionError(error);
	}
}

function textResult(text: string): ComputerUseResult {
	return { content: [{ type: "text", text }], details: undefined };
}

function okResult(action: string): ComputerUseResult {
	return textResult(formatActionComplete({ action }));
}

function scaleCoord(point: Point, display: DisplayConfig): Point {
	return {
		x: Math.round(point.x * (display.modelWidth / display.logicalWidth)),
		y: Math.round(point.y * (display.modelHeight / display.logicalHeight)),
	};
}

function parseCoordinate(coordinate: readonly number[] | undefined, action: string): Point {
	if (coordinate === undefined || coordinate.length !== 2) {
		throw new ComputerUseError("invalid_arguments", `${action} requires coordinate [x, y]`);
	}
	const x = coordinate[0];
	const y = coordinate[1];
	if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
		throw new ComputerUseError("invalid_arguments", `${action} requires finite coordinate [x, y]`);
	}
	return { x, y };
}

function parseText(text: string | undefined, action: string): string {
	if (text === undefined || text.length === 0) {
		throw new ComputerUseError("invalid_arguments", `${action} requires text`);
	}
	return text;
}

function parseKeyCombo(text: string | undefined): { readonly key: string; readonly modifiers: KeyModifier[] } {
	const parts = parseText(text, "key")
		.split("+")
		.map((part) => part.trim().toLowerCase())
		.filter(Boolean);
	const key = parts.at(-1);
	if (key === undefined) {
		throw new ComputerUseError("invalid_arguments", "key requires a non-empty key combo");
	}
	return { key, modifiers: parts.slice(0, -1).map(parseModifier) };
}

function parseModifier(modifier: string): KeyModifier {
	switch (modifier) {
		case "cmd":
		case "command":
			return "command";
		case "option":
		case "alt":
			return "option";
		case "control":
		case "ctrl":
			return "control";
		case "shift":
			return "shift";
		default:
			throw new ComputerUseError("invalid_arguments", `unsupported key modifier: ${modifier}`);
	}
}

function parseScroll(
	direction: ScrollDirection | undefined,
	amount: number | undefined,
): { readonly direction: ScrollDirection; readonly amount: number } {
	if (direction === undefined) {
		throw new ComputerUseError("invalid_arguments", "scroll requires scroll_direction");
	}
	if (amount === undefined || !Number.isFinite(amount) || amount <= 0) {
		throw new ComputerUseError("invalid_arguments", "scroll requires positive scroll_amount");
	}
	return { direction, amount };
}

function parseWaitDurationMilliseconds(duration: number | undefined): number {
	if (duration === undefined || !Number.isFinite(duration)) {
		throw new ComputerUseError("invalid_arguments", "wait requires finite duration");
	}
	return Math.min(MAX_WAIT_SECONDS, Math.max(0, duration)) * 1000;
}

async function tripleClick(computer: ComputerActionDriver, position: Point): Promise<void> {
	await computer.click(position);
	await sleep(TRIPLE_CLICK_GAP_MILLISECONDS);
	await computer.click(position);
	await sleep(TRIPLE_CLICK_GAP_MILLISECONDS);
	await computer.click(position);
}

function throwUnsupportedAction(action: "left_mouse_down" | "left_mouse_up" | "hold_key"): never {
	throw new ComputerUseError("unsupported_action", "Use click or drag tools for fine-grained mouse phases", {
		action,
	});
}

async function sleep(milliseconds: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
