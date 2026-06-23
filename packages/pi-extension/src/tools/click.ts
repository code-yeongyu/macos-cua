import {
	type ComputerInterface,
	type Point,
	clickElementByIndex,
	clickPoint,
	parseElementIndex,
	resolveAppPid,
	resolveScreenPoint,
	withTargetedApp,
} from "@macos-cua/core";
import { type Static, Type } from "typebox";

import { CLICK_TOOL_DESCRIPTION } from "../coordinate-contract.js";
import { type ToolDefinition, defineTool } from "../pi/index.js";
import { clickCompleteResult, clickCompleteWithCursor } from "./result.js";

const MouseButton = Type.Union([Type.Literal("left"), Type.Literal("right"), Type.Literal("middle")]);

export const ClickParams = Type.Object(
	{
		app: Type.String({ description: "App name or bundle identifier." }),
		element_index: Type.Optional(Type.String({ description: "Element index from get_app_state." })),
		x: Type.Optional(Type.Number({ description: "X coordinate in screenshot pixel coordinates." })),
		y: Type.Optional(Type.Number({ description: "Y coordinate in screenshot pixel coordinates." })),
		capture_id: Type.Optional(Type.String({ description: "Capture id from the latest get_app_state metadata." })),
		display_epoch: Type.Optional(
			Type.String({ description: "Display epoch from the latest get_app_state metadata." }),
		),
		click_count: Type.Optional(Type.Integer({ minimum: 1, description: "Number of clicks. Defaults to 1." })),
		mouse_button: Type.Optional(MouseButton),
	},
	{ additionalProperties: false },
);

export type ClickInput = Static<typeof ClickParams>;

export function createClickTool(computer: ComputerInterface): ToolDefinition {
	return defineTool({
		name: "click",
		label: "Computer Use: click",
		description: CLICK_TOOL_DESCRIPTION,
		parameters: ClickParams,
		async execute(_toolCallId, params) {
			const targetPid = await resolveAppPid(computer, params.app);
			const pressCount = Math.max(1, Math.trunc(params.click_count ?? 1));
			const cursorBefore = await readPointerPosition(computer);
			await dispatchClick(computer, targetPid, params, pressCount);
			const cursorAfter = await readPointerPosition(computer);
			if (cursorBefore !== undefined && cursorAfter !== undefined) {
				return clickCompleteWithCursor(cursorBefore, cursorAfter);
			}
			return clickCompleteResult();
		},
	});
}

async function dispatchClick(
	computer: ComputerInterface,
	targetPid: number,
	params: ClickInput,
	pressCount: number,
): Promise<void> {
	if (params.element_index !== undefined) {
		const index = parseElementIndex(params.element_index);
		await clickElementByIndex(computer, targetPid, index, pressCount, params.mouse_button);
		return;
	}
	const point = await resolveScreenPoint(computer, targetPid, parseCoordinate(params.x, params.y, params));
	if ((params.mouse_button ?? "left") === "left") {
		let pressedAll = true;
		for (let pressIndex = 0; pressIndex < pressCount; pressIndex += 1) {
			if (!(await computer.pressAtPosition(targetPid, point))) {
				pressedAll = false;
				break;
			}
		}
		if (pressedAll) {
			return;
		}
	}
	await withTargetedApp(computer, targetPid, async () => {
		await clickPoint(computer, point, params.mouse_button ?? "left", pressCount);
	});
}

async function readPointerPosition(computer: Pick<ComputerInterface, "getCursorPosition">): Promise<Point | undefined> {
	try {
		return await computer.getCursorPosition();
	} catch {
		return undefined;
	}
}

function parseCoordinate(
	x: number | undefined,
	y: number | undefined,
	params: Pick<ClickInput, "capture_id" | "display_epoch">,
): { readonly x: number; readonly y: number; readonly captureId?: string; readonly displayEpoch?: string } {
	if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
		throw new Error("click requires either element_index or finite x and y coordinates");
	}
	return {
		x,
		y,
		...(params.capture_id === undefined ? {} : { captureId: params.capture_id }),
		...(params.display_epoch === undefined ? {} : { displayEpoch: params.display_epoch }),
	};
}
