import type {
	AppState,
	CaptureFrame,
	ComputerInterface,
	DiscreteBatchDetails,
	DiscreteBatchStepDetails,
} from "@macos-cua/core";
import { executeDiscreteBatch } from "@macos-cua/core";

import type { AgentToolResult, ExtensionContext, ToolDefinition } from "../pi/index.js";
import type { AppStateCache } from "./app-state-cache.js";
import type { BatchAction } from "./batch-schema.js";
import { createClickTool } from "./click.js";
import { createDragTool } from "./drag.js";
import { createGetAppStateTool } from "./get-app-state.js";
import { createListAppsTool } from "./list-apps.js";
import { createPerformSecondaryActionTool } from "./perform-secondary-action.js";
import { createPressKeysTool } from "./press-key.js";
import { createScrollTool } from "./scroll.js";
import { createSelectTextTool } from "./select-text.js";
import { createSetValueTool } from "./set-value.js";
import { createTypeTextTool } from "./type-text.js";
import { createZoomTool } from "./zoom.js";

export type BatchStepDetails = DiscreteBatchStepDetails<BatchAction["action"]>;
export type BatchResultDetails = DiscreteBatchDetails<BatchAction["action"]>;

type BatchToolResult = AgentToolResult<BatchResultDetails>;

type BatchExecutionContext = {
	readonly toolCallId: string;
	readonly signal: AbortSignal | undefined;
	readonly onUpdate: Parameters<ToolDefinition["execute"]>[3];
	readonly ctx: ExtensionContext;
};

type PiBatchExecutor = (actions: readonly BatchAction[], context: BatchExecutionContext) => Promise<BatchToolResult>;

type BatchTools = {
	readonly listApps: ToolDefinition;
	readonly getAppState: ToolDefinition;
	readonly click: ToolDefinition;
	readonly performSecondaryAction: ToolDefinition;
	readonly setValue: ToolDefinition;
	readonly selectText: ToolDefinition;
	readonly drag: ToolDefinition;
	readonly scroll: ToolDefinition;
	readonly zoom: ToolDefinition;
	readonly typeText: ToolDefinition;
	readonly pressKeys: ToolDefinition;
};

export function createPiBatchExecutor(computer: ComputerInterface, cache: AppStateCache): PiBatchExecutor {
	const batchComputer = computerWithBatchViewportCache(computer, cache);
	const tools = createBatchTools(batchComputer, cache);
	return async (actions, context) => executePiDiscreteBatch(actions, tools, context);
}

export async function executePiDiscreteBatch(
	actions: readonly BatchAction[],
	tools: BatchTools,
	context: BatchExecutionContext,
): Promise<BatchToolResult> {
	return await executeDiscreteBatch({
		actions,
		executeAction: async (action) => await executeBatchAction(action, tools, context),
	});
}

function createBatchTools(computer: ComputerInterface, cache: AppStateCache): BatchTools {
	return {
		listApps: createListAppsTool(computer),
		getAppState: createGetAppStateTool(computer, cache),
		click: createClickTool(computer),
		performSecondaryAction: createPerformSecondaryActionTool(computer),
		setValue: createSetValueTool(computer),
		selectText: createSelectTextTool(computer),
		drag: createDragTool(computer),
		scroll: createScrollTool(computer),
		zoom: createZoomTool(computer, cache),
		typeText: createTypeTextTool(computer),
		pressKeys: createPressKeysTool(computer),
	};
}

async function executeBatchAction(
	action: BatchAction,
	tools: BatchTools,
	context: BatchExecutionContext,
): Promise<AgentToolResult<unknown>> {
	switch (action.action) {
		case "list_apps":
			return await tools.listApps.execute(context.toolCallId, {}, context.signal, context.onUpdate, context.ctx);
		case "get_app_state": {
			const { action: _action, ...params } = action;
			return await tools.getAppState.execute(
				context.toolCallId,
				params,
				context.signal,
				context.onUpdate,
				context.ctx,
			);
		}
		case "click": {
			const { action: _action, ...params } = action;
			return await tools.click.execute(context.toolCallId, params, context.signal, context.onUpdate, context.ctx);
		}
		case "perform_secondary_action": {
			const { action: _action, action_name, ...params } = action;
			return await tools.performSecondaryAction.execute(
				context.toolCallId,
				{ ...params, action: action_name },
				context.signal,
				context.onUpdate,
				context.ctx,
			);
		}
		case "set_value": {
			const { action: _action, ...params } = action;
			return await tools.setValue.execute(context.toolCallId, params, context.signal, context.onUpdate, context.ctx);
		}
		case "select_text": {
			const { action: _action, ...params } = action;
			return await tools.selectText.execute(
				context.toolCallId,
				params,
				context.signal,
				context.onUpdate,
				context.ctx,
			);
		}
		case "drag": {
			const { action: _action, ...params } = action;
			return await tools.drag.execute(context.toolCallId, params, context.signal, context.onUpdate, context.ctx);
		}
		case "scroll": {
			const { action: _action, ...params } = action;
			return await tools.scroll.execute(context.toolCallId, params, context.signal, context.onUpdate, context.ctx);
		}
		case "zoom": {
			const { action: _action, ...params } = action;
			return await tools.zoom.execute(context.toolCallId, params, context.signal, context.onUpdate, context.ctx);
		}
		case "type_text": {
			const { action: _action, ...params } = action;
			return await tools.typeText.execute(context.toolCallId, params, context.signal, context.onUpdate, context.ctx);
		}
		case "press_keys": {
			const { action: _action, ...params } = action;
			return await tools.pressKeys.execute(
				context.toolCallId,
				params,
				context.signal,
				context.onUpdate,
				context.ctx,
			);
		}
		default:
			return assertNever(action);
	}
}

function computerWithBatchViewportCache(computer: ComputerInterface, cache: AppStateCache): ComputerInterface {
	return {
		...computer,
		async getScreenshotViewport(targetPid) {
			return captureFrameFrom(cache.get(targetPid)) ?? (await computer.getScreenshotViewport(targetPid));
		},
	};
}

function captureFrameFrom(state: AppState | undefined): CaptureFrame | undefined {
	return state?.captureFrame;
}

function assertNever(value: never): never {
	throw new Error(`Unsupported batch action: ${String(value)}`);
}
