import {
	type CaptureFrame,
	type ComputerInterface,
	type KeySequenceEntry,
	type KeySequenceOptions,
	getAppStateForApp,
	modelFacingAppState,
	parseElementIndex,
	pressKeySequence,
	resolveAppPid,
	scrollElement,
	withTargetedApp,
} from "@macos-cua/core";
import type { AppStateCache } from "./app-state-cache.js";
import { appStateImageContent } from "./app-state-image.js";
import { click, drag } from "./batch-pointer.js";
import type { McpBatchAction } from "./batch-tool-schema.js";
import { type ToolContent, type ToolResult, actionComplete } from "./tool-result.js";

type BatchDispatchState = {
	readonly framesByPid: Map<number, CaptureFrame>;
	latestFeedback: readonly ToolContent[] | undefined;
};

export type McpBatchDispatcher = {
	readonly execute: (action: McpBatchAction) => Promise<ToolResult>;
	readonly latestFeedback: () => readonly ToolContent[] | undefined;
};

export function createMcpBatchDispatcher(
	computer: ComputerInterface,
	appStateCache: AppStateCache,
): McpBatchDispatcher {
	const state: BatchDispatchState = { framesByPid: new Map(), latestFeedback: undefined };
	return {
		execute: async (action) => dispatchBatchAction(computer, appStateCache, state, action),
		latestFeedback: () => state.latestFeedback,
	};
}

async function dispatchBatchAction(
	computer: ComputerInterface,
	appStateCache: AppStateCache,
	state: BatchDispatchState,
	action: McpBatchAction,
): Promise<ToolResult> {
	switch (action.action) {
		case "list_apps":
			return { content: [{ type: "text", text: JSON.stringify(await computer.listApps(), null, 2) }] };
		case "get_app_state":
			return await getAppState(computer, appStateCache, state, action.app);
		case "click": {
			const targetPid = await resolveAppPid(computer, action.app);
			await click(computer, targetPid, frameForTarget(state, targetPid), action);
			return actionComplete();
		}
		case "perform_secondary_action":
			await computer.performAction(
				await resolveAppPid(computer, action.app),
				parseElementIndex(action.element_index),
				action.action_name,
			);
			return actionComplete();
		case "set_value":
			await computer.setValue(
				await resolveAppPid(computer, action.app),
				parseElementIndex(action.element_index),
				action.value,
			);
			return actionComplete();
		case "select_text":
			await computer.selectText(await resolveAppPid(computer, action.app), parseElementIndex(action.element_index), {
				selection: action.selection ?? "text",
				...(action.text !== undefined ? { text: action.text } : {}),
				...(action.prefix !== undefined ? { prefix: action.prefix } : {}),
				...(action.suffix !== undefined ? { suffix: action.suffix } : {}),
			});
			return actionComplete();
		case "drag": {
			const targetPid = await resolveAppPid(computer, action.app);
			await drag(computer, targetPid, frameForTarget(state, targetPid), action);
			return actionComplete();
		}
		case "scroll":
			await scroll(computer, action);
			return actionComplete();
		case "type_text":
			await typeText(computer, action.app, action.text);
			return actionComplete();
		case "press_keys":
			await pressKeys(computer, action);
			return actionComplete();
	}
	assertNever(action);
}

async function getAppState(
	computer: ComputerInterface,
	appStateCache: AppStateCache,
	state: BatchDispatchState,
	app: string,
): Promise<ToolResult> {
	const appState = await getAppStateForApp(computer, app);
	appStateCache.store(appState);
	if (appState.captureFrame !== undefined) {
		state.framesByPid.set(appState.pid, appState.captureFrame);
	}
	const image = await appStateImageContent(appState);
	const content: ToolContent[] = [
		{ type: "image", data: image.data, mimeType: image.mimeType },
		{ type: "text", text: JSON.stringify(modelFacingAppState(appState), null, 2) },
	];
	state.latestFeedback = content;
	return { content };
}

function frameForTarget(state: BatchDispatchState, targetPid: number): CaptureFrame | undefined {
	const frame = state.framesByPid.get(targetPid);
	return frame?.target.pid === targetPid ? frame : undefined;
}

async function scroll(
	computer: ComputerInterface,
	action: Extract<McpBatchAction, { action: "scroll" }>,
): Promise<void> {
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
	action: Extract<McpBatchAction, { action: "press_keys" }>,
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

function keyEntry(input: Extract<McpBatchAction, { action: "press_keys" }>["keys"][number]): KeySequenceEntry {
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
