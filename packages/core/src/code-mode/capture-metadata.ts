import type { AppState } from "../accessibility/types.js";
import type { ComputerInterface } from "../computer/interface.js";
import type { CodeModeActionPostObservation, CodeModeAppState, CodeModeCaptureFrame } from "./api-surface.js";
import { splitAppState } from "./app-state-split.js";
import type { ScreenshotHandle, ScreenshotStore } from "./screenshot-store.js";

export function toCodeModeAppState(state: AppState, store: ScreenshotStore): CodeModeAppState {
	const split = splitAppState(state);
	const screenshot = store.put(split.screenshotBytes);
	const { captureFrame, ...structured } = split.structured;
	if (captureFrame === undefined) {
		return { ...structured, screenshot };
	}
	return {
		...structured,
		captureFrame: toCodeModeCaptureFrame(captureFrame, screenshot),
		screenshot,
	};
}

export async function capturePostActionObservation(
	computer: ComputerInterface,
	store: ScreenshotStore,
): Promise<CodeModeActionPostObservation> {
	const screenshot = store.put(await computer.screenshot());
	return {
		screenshot,
	};
}

function toCodeModeCaptureFrame(
	frame: NonNullable<AppState["captureFrame"]>,
	screenshot: ScreenshotHandle,
): CodeModeCaptureFrame {
	return { ...frame, screenshot };
}
