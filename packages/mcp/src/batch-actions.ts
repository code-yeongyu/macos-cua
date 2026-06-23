import {
	type CaptureFrame,
	type ComputerInterface,
	type DragOptions,
	type KeySequenceEntry,
	type KeySequenceOptions,
	clickElementByIndex,
	clickPoint,
	getAppStateForApp,
	parseElementIndex,
	pressKeySequence,
	resolveAppPid,
	resolveScreenPoint,
	screenshotPointToScreen,
	scrollElement,
	withTargetedApp,
} from "@macos-cua/core";
import type { AppStateCache } from "./app-state-cache.js";
import { appStateImageContent } from "./app-state-image.js";
import type { BatchState } from "./batch-runner.js";
import type { BatchAction } from "./batch-schema.js";

export async function runBatchAction(
	computer: ComputerInterface,
	appStateCache: AppStateCache,
	state: BatchState,
	action: BatchAction,
): Promise<void> {
	switch (action.action) {
		case "list_apps":
			await computer.listApps();
			return;
		case "get_app_state": {
			const appState = await getAppStateForApp(computer, action.app);
			appStateCache.store(appState);
			state.latestFrame = appState.captureFrame;
			const image = await appStateImageContent(appState);
			state.latestImage = { type: "image", data: image.data, mimeType: image.mimeType };
			return;
		}
		case "click":
			await click(computer, state.latestFrame, action);
			return;
		case "perform_secondary_action":
			await computer.performAction(
				await resolveAppPid(computer, action.app),
				parseElementIndex(action.element_index),
				action.action_name,
			);
			return;
		case "set_value":
			await computer.setValue(
				await resolveAppPid(computer, action.app),
				parseElementIndex(action.element_index),
				action.value,
			);
			return;
		case "select_text":
			await computer.selectText(await resolveAppPid(computer, action.app), parseElementIndex(action.element_index), {
				selection: action.selection ?? "text",
				...(action.text !== undefined ? { text: action.text } : {}),
				...(action.prefix !== undefined ? { prefix: action.prefix } : {}),
				...(action.suffix !== undefined ? { suffix: action.suffix } : {}),
			});
			return;
		case "drag":
			await drag(computer, state.latestFrame, action);
			return;
		case "scroll":
			await scroll(computer, action);
			return;
		case "type_text":
			await typeText(computer, action.app, action.text);
			return;
		case "press_keys":
			await pressKeys(computer, action);
			return;
	}
	assertNever(action);
}

async function click(
	computer: ComputerInterface,
	frame: CaptureFrame | undefined,
	action: Extract<BatchAction, { action: "click" }>,
): Promise<void> {
	const targetPid = await resolveAppPid(computer, action.app);
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
	const point = await resolvePoint(computer, targetPid, frame, action.x, action.y);
	if ((action.mouse_button ?? "left") === "left" && (await computer.pressAtPosition(targetPid, point))) {
		return;
	}
	await withTargetedApp(computer, targetPid, async () =>
		clickPoint(computer, point, action.mouse_button ?? "left", pressCount),
	);
}

async function drag(
	computer: ComputerInterface,
	frame: CaptureFrame | undefined,
	action: Extract<BatchAction, { action: "drag" }>,
): Promise<void> {
	const targetPid = await resolveAppPid(computer, action.app);
	const dragOptions: DragOptions = {
		from: await resolvePoint(computer, targetPid, frame, action.from_x, action.from_y),
		to: await resolvePoint(computer, targetPid, frame, action.to_x, action.to_y),
	};
	await withTargetedApp(computer, targetPid, async () => computer.drag(dragOptions));
}

async function scroll(computer: ComputerInterface, action: Extract<BatchAction, { action: "scroll" }>): Promise<void> {
	const pages = Math.max(1, Math.trunc(action.pages ?? 1));
	const targetPid = await resolveAppPid(computer, action.app);
	if (action.element_index !== undefined) {
		await scrollElement(computer, targetPid, parseElementIndex(action.element_index), action.direction, pages);
		return;
	}
	await withTargetedApp(computer, targetPid, async () => {
		if (action.direction === "down" || action.direction === "up") {
			await pressKeySequence(computer, repeatKey(action.direction === "down" ? "page_down" : "page_up", pages));
			return;
		}
		await computer.scroll({ direction: action.direction, amount: pages * 10 });
	});
}

async function typeText(computer: ComputerInterface, app: string, text: string): Promise<void> {
	const targetPid = await resolveAppPid(computer, app);
	if (await computer.typeIntoFocused(targetPid, text)) return;
	await withTargetedApp(computer, targetPid, async () => computer.type(text));
}

async function pressKeys(
	computer: ComputerInterface,
	action: Extract<BatchAction, { action: "press_keys" }>,
): Promise<void> {
	const targetPid = await resolveAppPid(computer, action.app);
	await withTargetedApp(computer, targetPid, async () => {
		await pressKeySequence(
			computer,
			action.keys.map(keyEntry),
			keyOptions(action.hold_seconds, action.interval_seconds),
		);
	});
}

async function resolvePoint(
	computer: ComputerInterface,
	targetPid: number,
	frame: CaptureFrame | undefined,
	x: number | undefined,
	y: number | undefined,
): Promise<{ readonly x: number; readonly y: number }> {
	if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
		throw new Error("coordinate action requires finite x and y coordinates");
	}
	return frame === undefined
		? await resolveScreenPoint(computer, targetPid, { x, y })
		: screenshotPointToScreen({ x, y }, frame);
}

function keyEntry(input: Extract<BatchAction, { action: "press_keys" }>["keys"][number]): KeySequenceEntry {
	return typeof input === "string"
		? { key: input }
		: { key: input.key, ...(input.hold_seconds !== undefined ? { holdSeconds: input.hold_seconds } : {}) };
}

function keyOptions(
	holdSeconds: number | undefined,
	intervalSeconds: number | undefined,
): KeySequenceOptions | undefined {
	return holdSeconds === undefined && intervalSeconds === undefined
		? undefined
		: {
				...(holdSeconds !== undefined ? { holdSeconds } : {}),
				...(intervalSeconds !== undefined ? { intervalSeconds } : {}),
			};
}

function repeatKey(key: string, count: number): readonly { readonly key: string }[] {
	return Array.from({ length: count }, () => ({ key }));
}

function assertNever(value: never): never {
	throw new Error(`Unhandled MCP batch action: ${JSON.stringify(value)}`);
}
