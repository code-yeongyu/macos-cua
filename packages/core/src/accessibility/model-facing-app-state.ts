import { screenshotMetadataForCaptureFrame } from "../computer/capture-frame.js";
import type { AppState } from "./types.js";

export function modelFacingAppState(state: AppState): object {
	const screenshotMetadata =
		state.screenshotMetadata ??
		(state.captureFrame !== undefined ? screenshotMetadataForCaptureFrame(state.captureFrame) : undefined);
	return {
		...state,
		...(screenshotMetadata !== undefined ? { screenshotMetadata } : {}),
		screenshotBase64: undefined,
	};
}
