import type { Point } from "../types/index.js";
import type { CaptureFrame, CaptureFreshnessMarker } from "./capture-frame.js";
import { ComputerUseError } from "./errors.js";
import type { ComputerInterface } from "./interface.js";
import { screenshotPointToScreen } from "./viewport.js";

export type CaptureFramePoint = Point & Partial<CaptureFreshnessMarker>;

/**
 * Map a model-supplied window-screenshot pixel coordinate to a global logical
 * screen point via the target app's fresh capture frame. Input dispatch expects
 * global points; the model sees window pixels.
 */
export async function resolveScreenPoint(
	computer: ComputerInterface,
	targetPid: number,
	point: CaptureFramePoint,
): Promise<Point> {
	const viewport = await computer.getScreenshotViewport(targetPid);
	if (viewport === undefined || !isCaptureFrame(viewport)) {
		throw new ComputerUseError(
			"MISSING_TARGET_WINDOW",
			`No fresh capture frame is available for target pid ${targetPid}. Call get_app_state and retry with coordinates from that capture.`,
			{ details: { targetPid } },
		);
	}
	return screenshotPointToScreen(point, viewport, freshnessFor(point));
}

function isCaptureFrame(
	viewport: Awaited<ReturnType<ComputerInterface["getScreenshotViewport"]>>,
): viewport is CaptureFrame {
	return viewport !== undefined && "captureId" in viewport && "displayEpoch" in viewport;
}

function freshnessFor(point: CaptureFramePoint): CaptureFreshnessMarker | undefined {
	if (point.captureId === undefined && point.displayEpoch === undefined) {
		return undefined;
	}
	if (point.captureId !== undefined && point.displayEpoch !== undefined) {
		return { captureId: point.captureId, displayEpoch: point.displayEpoch };
	}
	throw new ComputerUseError(
		"STALE_CAPTURE",
		"Coordinate freshness metadata is incomplete: include both captureId and displayEpoch from the latest get_app_state result, or refresh app state before retrying.",
		{
			details: { captureId: point.captureId ?? null, displayEpoch: point.displayEpoch ?? null },
		},
	);
}
