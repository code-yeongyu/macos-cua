import type { AppInfo } from "../accessibility/types.js";
import type { AppStateOptions, KeyOptions, ScreenshotOptions } from "../types/index.js";
import { CODE_MODE_METHOD_NAMES } from "./api-surface.js";
import { CodeModeError } from "./errors.js";
import {
	assignOptional,
	optionalAppStateCall,
	optionalElementIndex,
	optionalNumber,
	optionalRecord,
	optionalScreenshotCall,
	optionalScrollTarget,
	parseDragOptions,
	parseElementIndex,
	parseKeyInputs,
	parseOptionalRect,
	parseOptionalSize,
	parseOptionalStringUnion,
	parsePoint,
	parsePressOptions,
	parseSelectTextOptions,
	parseString,
	parseStringUnion,
	requiredRecord,
} from "./sandbox-parser-primitives.js";
import type {
	CodeModeClickTarget,
	CodeModeMethodName,
	CodeModePointerTarget,
	CodeModeScrollTarget,
	ParsedHostCall,
	ParsedKeyChord,
} from "./sandbox-types.js";

const METHOD_NAMES = new Set<string>(CODE_MODE_METHOD_NAMES);
const MODIFIER_ALIASES = new Map<string, NonNullable<KeyOptions["modifiers"]>[number]>([
	["cmd", "command"],
	["command", "command"],
	["meta", "command"],
	["option", "option"],
	["alt", "option"],
	["control", "control"],
	["ctrl", "control"],
	["shift", "shift"],
]);

export function parseHostCall(methodInput: unknown, argsInput: unknown): ParsedHostCall {
	const method = parseMethodName(methodInput);
	const args = Array.isArray(argsInput) ? argsInput : [];
	switch (method) {
		case "screenshot":
			return { method, ...optionalScreenshotCall(parseScreenshotOptions(args[0])) };
		case "getAppState":
			return { method, ...optionalAppStateCall(parseOptionalAppTarget(args[0]), parseAppStateOptions(args[1])) };
		case "listApps":
		case "getCursorPosition":
			return { method };
		case "click":
			return { method, app: parseAppTarget(args[0]), target: parseClickTarget(args[1]) };
		case "doubleClick":
		case "rightClick":
			return { method, app: parseAppTarget(args[0]), target: parsePointerTarget(args[1]) };
		case "move":
			return { method, app: parseAppTarget(args[0]), point: parsePoint(args[1]) };
		case "drag":
			return { method, app: parseAppTarget(args[0]), options: parseDragOptions(args[1]) };
		case "scroll":
			return { method, app: parseAppTarget(args[0]), target: parseScrollTarget(args[1]) };
		case "type":
			return { method, app: parseAppTarget(args[0]), text: parseString(args[1], "text") };
		case "pressKeys":
			return {
				method,
				app: parseAppTarget(args[0]),
				keys: parseKeyInputs(args[1]),
				options: parsePressOptions(args[2]),
			};
		case "setValue":
			return {
				method,
				app: parseAppTarget(args[0]),
				elementIndex: parseElementIndex(args[1]),
				value: parseString(args[2], "value"),
			};
		case "selectText":
			return {
				method,
				app: parseAppTarget(args[0]),
				elementIndex: parseElementIndex(args[1]),
				options: parseSelectTextOptions(args[2]),
			};
		case "performAction":
			return {
				method,
				app: parseAppTarget(args[0]),
				elementIndex: parseElementIndex(args[1]),
				action: parseString(args[2], "action"),
			};
	}
}

export function parseKeyChord(key: string): ParsedKeyChord {
	const parts = key
		.split("+")
		.map((part) => part.trim())
		.filter(Boolean);
	const finalKey = parts.at(-1);
	if (finalKey === undefined) {
		throw new CodeModeError("COMPILE_ERROR", "key must be non-empty");
	}
	const modifiers = parts.slice(0, -1).map((part) => {
		const modifier = MODIFIER_ALIASES.get(part.toLowerCase());
		if (modifier === undefined) {
			throw new CodeModeError("COMPILE_ERROR", `unsupported key modifier: ${part}`);
		}
		return modifier;
	});
	return { key: finalKey, modifiers };
}

export function findAppMatch(apps: readonly AppInfo[], normalized: string): AppInfo | undefined {
	return (
		apps.find((app) => app.name.toLowerCase() === normalized || app.bundleId.toLowerCase() === normalized) ??
		apps.find((app) => app.name.toLowerCase().includes(normalized) || app.bundleId.toLowerCase().includes(normalized))
	);
}

function parseMethodName(value: unknown): CodeModeMethodName {
	if (typeof value === "string" && METHOD_NAMES.has(value)) {
		for (const method of CODE_MODE_METHOD_NAMES) {
			if (value === method) {
				return method;
			}
		}
	}
	throw new CodeModeError("COMPILE_ERROR", `Unknown code-mode method: ${String(value)}`);
}

function parseScreenshotOptions(value: unknown): ScreenshotOptions | undefined {
	const record = optionalRecord(value, "screenshot options");
	if (record === undefined) {
		return undefined;
	}
	const options: ScreenshotOptions = {};
	assignOptional(options, "region", parseOptionalRect(record["region"], "region"));
	assignOptional(options, "targetSize", parseOptionalSize(record["targetSize"], "targetSize"));
	assignOptional(options, "format", parseOptionalStringUnion(record["format"], ["png", "jpeg"], "format"));
	assignOptional(options, "quality", optionalNumber(record["quality"], "quality"));
	return options;
}

function parseAppStateOptions(value: unknown): AppStateOptions | undefined {
	const record = optionalRecord(value, "app state options");
	if (record === undefined) {
		return undefined;
	}
	const options: AppStateOptions = {};
	assignOptional(options, "screenshotSize", parseOptionalSize(record["screenshotSize"], "screenshotSize"));
	assignOptional(options, "timeoutMs", optionalNumber(record["timeoutMs"], "timeoutMs"));
	assignOptional(options, "settleMs", optionalNumber(record["settleMs"], "settleMs"));
	return options;
}

function parseOptionalAppTarget(value: unknown): string | number | undefined {
	return value === undefined ? undefined : parseAppTarget(value);
}

function parseAppTarget(value: unknown): string | number {
	if (typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value) && value > 0)) {
		return value;
	}
	throw new CodeModeError("COMPILE_ERROR", "app target must be a string or positive integer pid");
}

function parseClickTarget(value: unknown): CodeModeClickTarget {
	const pointer = parsePointerTarget(value);
	const record = requiredRecord(value, "click target");
	const button = parseOptionalStringUnion(record["button"], ["left", "right", "middle"], "button");
	return button === undefined ? pointer : { ...pointer, button };
}

function parsePointerTarget(value: unknown): CodeModePointerTarget {
	const record = requiredRecord(value, "pointer target");
	const x = optionalNumber(record["x"], "x");
	const y = optionalNumber(record["y"], "y");
	const elementIndex = optionalElementIndex(record["elementIndex"]);
	if ((x === undefined) !== (y === undefined)) {
		throw new CodeModeError("COMPILE_ERROR", "pointer target must include both x and y");
	}
	if (x !== undefined && y !== undefined) {
		return elementIndex === undefined ? { x, y } : { x, y, elementIndex };
	}
	return elementIndex === undefined ? {} : { elementIndex };
}

function parseScrollTarget(value: unknown): CodeModeScrollTarget {
	const record = requiredRecord(value, "scroll options");
	const direction = parseStringUnion(record["direction"], ["up", "down", "left", "right"], "direction");
	const amount = optionalNumber(record["amount"], "amount");
	const elementIndex = optionalElementIndex(record["elementIndex"]);
	return optionalScrollTarget(direction, amount, elementIndex);
}
