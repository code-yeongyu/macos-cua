import type { Buffer } from "node:buffer";
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
	if (raw.result !== undefined) {
		textLines.push(JSON.stringify(raw.result) ?? "undefined");
	}
	const text = textLines.length === 0 ? '{"ok":true}' : textLines.join("\n");
	return {
		images,
		text,
	};
}
