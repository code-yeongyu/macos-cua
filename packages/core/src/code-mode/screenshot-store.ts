import type { ScreenshotResult } from "../computer/interface.js";
import { CodeModeError } from "./errors.js";

const MAX_SCREENSHOT_COUNT = 8;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;

export interface ScreenshotHandle {
	readonly id: string;
	readonly width: number;
	readonly height: number;
	readonly mimeType: "image/png" | "image/jpeg";
}

export type ScreenshotHandleView = ScreenshotHandle & {
	readonly toJSON: () => string;
	readonly toString: () => string;
};

type StoredScreenshot = {
	readonly result: ScreenshotResult;
	readonly byteLength: number;
};

export function createHandleView(id: string, result: ScreenshotResult): ScreenshotHandleView {
	const label = `[screenshot ${id} ${result.width}x${result.height}]`;
	return Object.freeze({
		id,
		width: result.width,
		height: result.height,
		mimeType: result.mimeType,
		toJSON: () => label,
		toString: () => label,
	});
}

export class ScreenshotStore {
	private counter = 0;
	private bytes = 0;
	private readonly screenshots = new Map<string, StoredScreenshot>();

	put(result: ScreenshotResult): ScreenshotHandle {
		const id = `shot_${this.counter + 1}`;
		this.counter += 1;
		const byteLength = result.data.byteLength;
		this.screenshots.set(id, { result, byteLength });
		this.bytes += byteLength;
		this.evictOldestUntilWithinLimits();
		return createHandleView(id, result);
	}

	get(id: string): ScreenshotResult {
		const stored = this.screenshots.get(id);
		if (stored === undefined) {
			throw new CodeModeError("HANDLE_STALE", `Screenshot handle ${id} is stale or unknown`);
		}
		return stored.result;
	}

	size(): number {
		return this.screenshots.size;
	}

	totalBytes(): number {
		return this.bytes;
	}

	private evictOldestUntilWithinLimits(): void {
		while (this.screenshots.size > MAX_SCREENSHOT_COUNT || this.bytes > MAX_TOTAL_BYTES) {
			const oldest = this.screenshots.entries().next().value;
			if (oldest === undefined) {
				return;
			}
			const [id, stored] = oldest;
			this.screenshots.delete(id);
			this.bytes -= stored.byteLength;
		}
	}
}
