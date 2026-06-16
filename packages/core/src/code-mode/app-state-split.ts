import type { AppState } from "../accessibility/types.js";
import type { ScreenshotResult } from "../computer/interface.js";

export type SplitAppStateResult = {
	readonly structured: Omit<AppState, "screenshotBase64">;
	readonly screenshotBytes: ScreenshotResult;
};

export function splitAppState(state: AppState): SplitAppStateResult {
	const { screenshotBase64, ...structured } = state;

	return {
		structured,
		screenshotBytes: {
			data: Buffer.from(screenshotBase64, "base64"),
			mimeType: state.screenshotMimeType ?? "image/png",
			width: state.screenshotWidth,
			height: state.screenshotHeight,
		},
	};
}
