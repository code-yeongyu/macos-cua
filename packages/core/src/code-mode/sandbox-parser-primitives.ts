import type {
	AppStateOptions,
	DragOptions,
	Point,
	Rect,
	ScreenshotOptions,
	SelectTextOptions,
	Size,
} from "../types/index.js";
import { CodeModeError } from "./errors.js";
import { isRecord } from "./sandbox-errors.js";
import type { CodeModeScrollTarget, ParsedKeyInput, ParsedPressOptions } from "./sandbox-types.js";

export function parsePoint(value: unknown): Point {
	const record = requiredRecord(value, "point");
	return { x: requiredNumber(record["x"], "x"), y: requiredNumber(record["y"], "y") };
}

export function parseDragOptions(value: unknown): DragOptions {
	const record = requiredRecord(value, "drag options");
	return {
		from: { x: requiredNumber(record["fromX"], "fromX"), y: requiredNumber(record["fromY"], "fromY") },
		to: { x: requiredNumber(record["toX"], "toX"), y: requiredNumber(record["toY"], "toY") },
	};
}

export function parseKeyInputs(value: unknown): readonly ParsedKeyInput[] {
	if (!Array.isArray(value)) {
		throw new CodeModeError("COMPILE_ERROR", "keys must be an array");
	}
	return value.map((entry) => {
		if (typeof entry === "string") {
			return { key: entry };
		}
		const record = requiredRecord(entry, "key input");
		const holdSeconds = optionalNumber(record["holdSeconds"], "holdSeconds");
		return holdSeconds === undefined
			? { key: parseString(record["key"], "key") }
			: { key: parseString(record["key"], "key"), holdMilliseconds: holdSeconds * 1000 };
	});
}

export function parsePressOptions(value: unknown): ParsedPressOptions {
	const record = optionalRecord(value, "press key options");
	if (record === undefined) {
		return {};
	}
	const intervalSeconds = optionalNumber(record["intervalSeconds"], "intervalSeconds");
	return intervalSeconds === undefined ? {} : { intervalMs: intervalSeconds * 1000 };
}

export function parseSelectTextOptions(value: unknown): SelectTextOptions {
	const record = requiredRecord(value, "select text options");
	const options: SelectTextOptions = {
		selection: parseStringUnion(record["selection"], ["text", "before", "after"], "selection"),
	};
	assignOptional(options, "text", optionalString(record["text"], "text"));
	assignOptional(options, "prefix", optionalString(record["prefix"], "prefix"));
	assignOptional(options, "suffix", optionalString(record["suffix"], "suffix"));
	return options;
}

export function parseElementIndex(value: unknown): number {
	const parsed = optionalElementIndex(value);
	if (parsed === undefined) {
		throw new CodeModeError("COMPILE_ERROR", "element index must be a non-negative integer");
	}
	return parsed;
}

export function optionalElementIndex(value: unknown): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	return requiredInteger(value, "element index", 0);
}

export function parseOptionalRect(value: unknown, label: string): Rect | undefined {
	if (value === undefined) {
		return undefined;
	}
	const record = requiredRecord(value, label);
	return {
		x: requiredNumber(record["x"], `${label}.x`),
		y: requiredNumber(record["y"], `${label}.y`),
		width: requiredNumber(record["width"], `${label}.width`),
		height: requiredNumber(record["height"], `${label}.height`),
	};
}

export function parseOptionalSize(value: unknown, label: string): Size | undefined {
	if (value === undefined) {
		return undefined;
	}
	const record = requiredRecord(value, label);
	return {
		width: requiredNumber(record["width"], `${label}.width`),
		height: requiredNumber(record["height"], `${label}.height`),
	};
}

export function optionalRecord(value: unknown, label: string): Record<string, unknown> | undefined {
	if (value === undefined) {
		return undefined;
	}
	return requiredRecord(value, label);
}

export function requiredRecord(value: unknown, label: string): Record<string, unknown> {
	if (isRecord(value)) {
		return value;
	}
	throw new CodeModeError("COMPILE_ERROR", `${label} must be an object`);
}

export function optionalNumber(value: unknown, label: string): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	return requiredNumber(value, label);
}

export function parseString(value: unknown, label: string): string {
	if (typeof value === "string") {
		return value;
	}
	throw new CodeModeError("COMPILE_ERROR", `${label} must be a string`);
}

export function parseStringUnion<const TValues extends readonly string[]>(
	value: unknown,
	values: TValues,
	label: string,
): TValues[number] {
	if (typeof value === "string" && values.includes(value)) {
		return value;
	}
	throw new CodeModeError("COMPILE_ERROR", `${label} must be one of ${values.join(", ")}`);
}

export function parseOptionalStringUnion<const TValues extends readonly string[]>(
	value: unknown,
	values: TValues,
	label: string,
): TValues[number] | undefined {
	if (value === undefined) {
		return undefined;
	}
	return parseStringUnion(value, values, label);
}

export function assignOptional<TObject extends object, TKey extends keyof TObject>(
	target: TObject,
	key: TKey,
	value: TObject[TKey] | undefined,
): void {
	if (value !== undefined) {
		target[key] = value;
	}
}

export function optionalScrollTarget(
	direction: CodeModeScrollTarget["direction"],
	amount: number | undefined,
	elementIndex: number | undefined,
): CodeModeScrollTarget {
	if (amount !== undefined && elementIndex !== undefined) {
		return { direction, amount, elementIndex };
	}
	if (elementIndex !== undefined) {
		return { direction, elementIndex };
	}
	return amount === undefined ? { direction } : { direction, amount };
}

export function optionalScreenshotCall(options: ScreenshotOptions | undefined): {
	readonly options?: ScreenshotOptions;
} {
	return options === undefined ? {} : { options };
}

export function optionalAppStateCall(
	app: string | number | undefined,
	options: AppStateOptions | undefined,
): { readonly app?: string | number; readonly options?: AppStateOptions } {
	if (app !== undefined && options !== undefined) {
		return { app, options };
	}
	if (app !== undefined) {
		return { app };
	}
	return options === undefined ? {} : { options };
}

function requiredNumber(value: unknown, label: string): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	throw new CodeModeError("COMPILE_ERROR", `${label} must be a finite number`);
}

function requiredInteger(value: unknown, label: string, minimum: number): number {
	if (typeof value === "number" && Number.isSafeInteger(value) && value >= minimum) {
		return value;
	}
	throw new CodeModeError("COMPILE_ERROR", `${label} must be an integer >= ${minimum}`);
}

function optionalString(value: unknown, label: string): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return parseString(value, label);
}
