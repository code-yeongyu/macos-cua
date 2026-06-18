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
	targetPid: number,
): Promise<CodeModeActionPostObservation> {
	const state = toCodeModeAppState(await computer.getAppState(targetPid), store);
	return {
		screenshot: state.screenshot,
		...captureId(state),
		...displayEpoch(state),
		...axChangeSummary(state),
		...elementCount(state),
	};
}

function toCodeModeCaptureFrame(
	frame: NonNullable<AppState["captureFrame"]>,
	screenshot: ScreenshotHandle,
): CodeModeCaptureFrame {
	return { ...frame, screenshot };
}

function captureId(state: CodeModeAppState): { readonly captureId?: string } {
	const value = state.observation?.capture.captureId ?? state.captureFrame?.captureId;
	return value === undefined ? {} : { captureId: value };
}

function displayEpoch(state: CodeModeAppState): { readonly displayEpoch?: string } {
	const value = state.observation?.freshness.displayEpoch ?? state.captureFrame?.displayEpoch;
	return value === undefined ? {} : { displayEpoch: value };
}

function axChangeSummary(state: CodeModeAppState): Pick<CodeModeActionPostObservation, "axChangeSummary"> {
	const value = state.observation?.ax.changeSummary ?? state.axChangeSummary;
	return value === undefined ? {} : { axChangeSummary: value };
}

function elementCount(state: CodeModeAppState): Pick<CodeModeActionPostObservation, "elementCount"> {
	return { elementCount: state.observation?.ax.elementCount ?? state.elements.length };
}
