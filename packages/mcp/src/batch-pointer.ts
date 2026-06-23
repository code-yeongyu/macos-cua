import {
	type CaptureFrame,
	type CaptureFreshnessMarker,
	type ComputerInterface,
	ComputerUseError,
	type DragOptions,
	clickElementByIndex,
	clickPoint,
	parseElementIndex,
	resolveScreenPoint,
	screenshotPointToScreen,
	withTargetedApp,
} from "@macos-cua/core";
import type { McpBatchAction } from "./batch-tool-schema.js";

type CoordinateAction = Extract<McpBatchAction, { action: "click" | "drag" }>;

export async function click(
	computer: ComputerInterface,
	targetPid: number,
	frame: CaptureFrame | undefined,
	action: Extract<McpBatchAction, { action: "click" }>,
): Promise<void> {
	const pressCount = Math.max(1, Math.trunc(action.click_count ?? 1));
	if (action.element_index !== undefined) {
		await clickElementByIndex(
			computer,
			targetPid,
			parseElementIndex(action.element_index),
			pressCount,
			action.mouse_button,
		);
		return;
	}
	const point = await resolvePoint(computer, targetPid, frame, action.x, action.y, action);
	if ((action.mouse_button ?? "left") === "left" && (await pressAtPosition(computer, targetPid, point, pressCount))) {
		return;
	}
	await withTargetedApp(computer, targetPid, async () =>
		clickPoint(computer, point, action.mouse_button ?? "left", pressCount),
	);
}

export async function drag(
	computer: ComputerInterface,
	targetPid: number,
	frame: CaptureFrame | undefined,
	action: Extract<McpBatchAction, { action: "drag" }>,
): Promise<void> {
	const dragOptions: DragOptions = {
		from: await resolvePoint(computer, targetPid, frame, action.from_x, action.from_y, action),
		to: await resolvePoint(computer, targetPid, frame, action.to_x, action.to_y, action),
	};
	await withTargetedApp(computer, targetPid, async () => computer.drag(dragOptions));
}

async function resolvePoint(
	computer: ComputerInterface,
	targetPid: number,
	frame: CaptureFrame | undefined,
	x: number | undefined,
	y: number | undefined,
	action: CoordinateAction,
): Promise<{ readonly x: number; readonly y: number }> {
	if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
		throw new Error("coordinate action requires finite x and y coordinates");
	}
	return frame === undefined
		? await resolveScreenPoint(computer, targetPid, { x, y, ...freshnessFor(action) })
		: screenshotPointToScreen({ x, y }, frame, completeFreshnessForFrame(action));
}

function freshnessFor(action: CoordinateAction): { readonly captureId?: string; readonly displayEpoch?: string } {
	return {
		...(action.capture_id === undefined ? {} : { captureId: action.capture_id }),
		...(action.display_epoch === undefined ? {} : { displayEpoch: action.display_epoch }),
	};
}

function completeFreshnessForFrame(action: CoordinateAction): CaptureFreshnessMarker | undefined {
	if (action.capture_id === undefined && action.display_epoch === undefined) {
		return undefined;
	}
	if (action.capture_id !== undefined && action.display_epoch !== undefined) {
		return { captureId: action.capture_id, displayEpoch: action.display_epoch };
	}
	throw incompleteFreshnessError(action.capture_id, action.display_epoch);
}

async function pressAtPosition(
	computer: ComputerInterface,
	targetPid: number,
	point: { readonly x: number; readonly y: number },
	pressCount: number,
): Promise<boolean> {
	for (let pressIndex = 0; pressIndex < pressCount; pressIndex += 1) {
		if (!(await computer.pressAtPosition(targetPid, point))) {
			return false;
		}
	}
	return true;
}

function incompleteFreshnessError(captureId: string | undefined, displayEpoch: string | undefined): ComputerUseError {
	return new ComputerUseError(
		"STALE_CAPTURE",
		"Coordinate freshness metadata is incomplete: include both captureId and displayEpoch from the latest get_app_state result, or refresh app state before retrying.",
		{ details: { captureId: captureId ?? null, displayEpoch: displayEpoch ?? null } },
	);
}
