import type { Buffer } from "node:buffer";
import { surfaceActionPayload, toSurfaceJsonValue } from "../surface-vocabulary.js";
import { CodeModeError } from "./errors.js";
import type { ScreenshotStore } from "./screenshot-store.js";

export type CodeModeRunResult = {
	readonly images: readonly {
		readonly data: Buffer;
		readonly mimeType: "image/png" | "image/jpeg";
	}[];
	readonly text: string;
};

export function assembleRunResult(
	raw: { readonly logs: readonly string[]; readonly result: unknown; readonly surfaced: readonly string[] },
	store: ScreenshotStore,
): CodeModeRunResult {
	const images: CodeModeRunResult["images"][number][] = [];
	const textLines: string[] = [...raw.logs];
	for (const id of raw.surfaced) {
		try {
			const screenshot = store.get(id);
			images.push({
				data: screenshot.data,
				mimeType: screenshot.mimeType,
			});
		} catch (error) {
			if (error instanceof CodeModeError && error.code === "SCREENSHOT_HANDLE_STALE") {
				textLines.push(`surface failed: SCREENSHOT_HANDLE_STALE ${id}`);
				continue;
			}
			throw error;
		}
	}
	const capture = raw.surfaced.length === 0 ? undefined : { surfaced: raw.surfaced, imageCount: images.length };
	if (raw.result !== undefined) {
		textLines.push(JSON.stringify(normalizeRunResult(raw.result, capture)) ?? "undefined");
	}
	const text =
		textLines.length === 0
			? JSON.stringify(surfaceActionPayload(capture === undefined ? {} : { capture }))
			: textLines.join("\n");
	return {
		images,
		text,
	};
}

function normalizeRunResult(
	result: unknown,
	capture: { readonly surfaced: readonly string[]; readonly imageCount: number } | undefined,
): unknown {
	const jsonResult = toSurfaceJsonValue(result);
	if (isOkRecord(result)) {
		return surfaceActionPayload({
			...(capture === undefined ? {} : { capture }),
			...(jsonResult === undefined ? {} : { result: jsonResult }),
		});
	}
	return result;
}

function isOkRecord(value: unknown): value is { readonly ok: true } {
	return typeof value === "object" && value !== null && "ok" in value && value.ok === true;
}
