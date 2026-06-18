import type { AppState, AxTreeChangeSummary } from "../accessibility/types.js";
import { resolveElementCoordinate } from "../platform/macos-accessibility.js";
import type { Point } from "../types/index.js";
import type { ComputerUseMouseButton } from "./actions.js";
import type { CaptureFramePoint } from "./coordinate.js";
import { resolveScreenPoint } from "./coordinate.js";
import { ComputerUseError } from "./errors.js";
import type { ComputerInterface } from "./interface.js";
import { screenshotPointToScreen } from "./viewport.js";

const AX_PRESS_ACTION = "AXPress";

export type PointerClickTarget = {
	readonly elementIndex?: number;
	readonly x?: number;
	readonly y?: number;
	readonly captureId?: string;
	readonly displayEpoch?: string;
	readonly button?: ComputerUseMouseButton;
};

export type PointerActionPostObservation = {
	readonly captureId?: string;
	readonly displayEpoch?: string;
	readonly axChangeSummary?: AxTreeChangeSummary;
	readonly elementCount?: number;
};

export type PointerActionResult = {
	readonly actionId: string;
	readonly method: "axPress" | "axPressAtPosition" | "coordinateClick";
	readonly postAction?: PointerActionPostObservation;
};

export type ExecutePointerClickInput = {
	readonly actionId?: string;
	readonly targetPid: number;
	readonly target: PointerClickTarget;
	readonly pressCount?: number;
	readonly observeAfter?: boolean;
};

type PointerClickContext = {
	readonly computer: ComputerInterface;
	readonly targetPid: number;
	readonly count: number;
	readonly button: ComputerUseMouseButton;
};

type ClickPointInput = {
	readonly computer: ComputerInterface;
	readonly point: Point;
	readonly button: ComputerUseMouseButton;
	readonly clickCount: number;
};

export async function executePointerClick(
	computer: ComputerInterface,
	input: ExecutePointerClickInput,
): Promise<PointerActionResult> {
	const count = Math.max(1, Math.trunc(input.pressCount ?? 1));
	const button = input.target.button ?? "left";
	const actionId = input.actionId ?? `pointer-click:${input.targetPid}`;
	const context = { computer, targetPid: input.targetPid, count, button };
	const method =
		input.target.elementIndex !== undefined
			? await clickElementTarget(context, input.target.elementIndex)
			: await clickCoordinateTarget(context, input.target);
	return {
		actionId,
		method,
		...(input.observeAfter === false ? {} : { postAction: await postActionObservation(computer, input.targetPid) }),
	};
}

async function clickElementTarget(
	context: PointerClickContext,
	elementIndex: number,
): Promise<PointerActionResult["method"]> {
	if (context.button === "left") {
		try {
			for (let index = 0; index < context.count; index += 1) {
				await context.computer.performAction(context.targetPid, elementIndex, AX_PRESS_ACTION);
			}
			return "axPress";
		} catch (error) {
			if (!(error instanceof Error)) {
				throw error;
			}
		}
	}

	const state = await context.computer.getAppState(context.targetPid);
	const point = resolveElementScreenPoint(state, elementIndex);
	if (context.button === "left") {
		let pressedAll = true;
		for (let index = 0; index < context.count; index += 1) {
			if (!(await tryPressAtPosition(context.computer, context.targetPid, point))) {
				pressedAll = false;
				break;
			}
		}
		if (pressedAll) {
			return "axPressAtPosition";
		}
	}
	await withTargetedPid(context.computer, context.targetPid, async () =>
		clickPoint({ computer: context.computer, point, button: context.button, clickCount: context.count }),
	);
	return "coordinateClick";
}

async function clickCoordinateTarget(
	context: PointerClickContext,
	target: PointerClickTarget,
): Promise<PointerActionResult["method"]> {
	const point = await resolveScreenPoint(context.computer, context.targetPid, validatedPoint(target));
	assertFreshCoordinateTarget(target);
	if (context.button === "left") {
		let pressedAll = true;
		for (let index = 0; index < context.count; index += 1) {
			if (!(await context.computer.pressAtPosition(context.targetPid, point))) {
				pressedAll = false;
				break;
			}
		}
		if (pressedAll) {
			return "axPressAtPosition";
		}
	}
	await withTargetedPid(context.computer, context.targetPid, async () =>
		clickPoint({ computer: context.computer, point, button: context.button, clickCount: context.count }),
	);
	return "coordinateClick";
}

function validatedPoint(target: PointerClickTarget): CaptureFramePoint {
	if (target.x === undefined || target.y === undefined || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
		throw new Error("click requires either elementIndex or finite x and y coordinates");
	}
	return target.captureId === undefined || target.displayEpoch === undefined
		? { x: target.x, y: target.y }
		: { x: target.x, y: target.y, captureId: target.captureId, displayEpoch: target.displayEpoch };
}

function assertFreshCoordinateTarget(target: PointerClickTarget): void {
	if (target.captureId === undefined || target.displayEpoch === undefined) {
		throw new ComputerUseError(
			"STALE_CAPTURE",
			"Coordinate clicks must include captureId and displayEpoch from the latest get_app_state capture.",
			{ details: { captureId: target.captureId ?? null, displayEpoch: target.displayEpoch ?? null } },
		);
	}
}

function resolveElementScreenPoint(state: AppState, elementIndex: number): Point {
	const element = state.elements.find((candidate) => candidate.id === elementIndex);
	if (element === undefined) {
		throw new Error(`Element index ${elementIndex} not found in AX tree`);
	}
	if (state.observation?.freshness.stale === true) {
		throw new ComputerUseError("STALE_CAPTURE", `Capture for element index ${elementIndex} is stale.`, {
			details: { elementIndex },
		});
	}
	if (state.captureFrame === undefined) {
		throw new ComputerUseError(
			"MISSING_TARGET_WINDOW",
			`No fresh capture frame is available for element index ${elementIndex}. Call get_app_state and retry.`,
			{ details: { elementIndex } },
		);
	}
	const point = resolveElementCoordinate(state.elements, elementIndex);
	return screenshotPointToScreen(point, state.captureFrame, {
		captureId: state.captureFrame.captureId,
		displayEpoch: state.captureFrame.displayEpoch,
	});
}

async function tryPressAtPosition(computer: ComputerInterface, targetPid: number, point: Point): Promise<boolean> {
	try {
		return await computer.pressAtPosition(targetPid, point);
	} catch (error) {
		if (error instanceof Error) {
			return false;
		}
		throw error;
	}
}

async function withTargetedPid<TValue>(
	computer: ComputerInterface,
	targetPid: number,
	action: () => Promise<TValue>,
): Promise<TValue> {
	computer.setTarget(targetPid);
	try {
		return await action();
	} finally {
		computer.setTarget(undefined);
	}
}

async function clickPoint(input: ClickPointInput): Promise<void> {
	if (input.button === "left" && input.clickCount === 2) {
		await input.computer.doubleClick(input.point);
		return;
	}
	for (let index = 0; index < input.clickCount; index += 1) {
		await clickOnce(input.computer, input.point, input.button);
	}
}

async function clickOnce(computer: ComputerInterface, point: Point, button: ComputerUseMouseButton): Promise<void> {
	switch (button) {
		case "left":
			await computer.click(point);
			return;
		case "right":
			await computer.rightClick(point);
			return;
		case "middle":
			await computer.middleClick(point);
			return;
	}
}

async function postActionObservation(
	computer: ComputerInterface,
	targetPid: number,
): Promise<PointerActionPostObservation> {
	const state = await computer.getAppState(targetPid);
	return {
		...(state.observation?.capture.captureId !== undefined
			? { captureId: state.observation.capture.captureId }
			: state.captureFrame?.captureId !== undefined
				? { captureId: state.captureFrame.captureId }
				: {}),
		...(state.observation?.freshness.displayEpoch !== undefined
			? { displayEpoch: state.observation.freshness.displayEpoch }
			: state.captureFrame?.displayEpoch !== undefined
				? { displayEpoch: state.captureFrame.displayEpoch }
				: {}),
		...(state.observation?.ax.changeSummary !== undefined
			? { axChangeSummary: state.observation.ax.changeSummary }
			: state.axChangeSummary !== undefined
				? { axChangeSummary: state.axChangeSummary }
				: {}),
		...(state.observation?.ax.elementCount !== undefined
			? { elementCount: state.observation.ax.elementCount }
			: { elementCount: state.elements.length }),
	};
}
