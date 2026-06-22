import { MacOSHostComputer } from "@macos-cua/core";
import { Type } from "typebox";

import {
	ANTHROPIC_NATIVE_COMPUTER_TOOL_NAME,
	type ComputerToolInput,
	addAnthropicComputerUseToPayload,
	buildCodexComputerUseSection,
	buildComputerUseSection,
	computerToolSchema,
	executeNativeComputerAction,
	supportsAnthropicNativeComputerUse,
} from "./anthropic-computer-use.js";
import { CODE_MODE_RUN_TOOL_DESCRIPTION } from "./code-mode-description.js";
import { type DisplayConfig, displayProfileForModel, resolveDisplayConfig } from "./computer-use/coords.js";
import { toAgentToolErrorResult, toAgentToolResult } from "./computer-use/run-result.js";
import { type OpenAIComputerBatchResultDetails, executeOpenAIComputerActionBatch } from "./openai-computer-batch.js";
import {
	type OpenAIComputerAction,
	type OpenAIComputerActionBatch,
	addOpenAIComputerUseToPayload,
	executeOpenAIComputerAction,
	openaiComputerActionBatchSchema,
	openaiComputerToolSchema,
	sanitizeOpenAIComputerUsePayload,
} from "./openai-computer-use.js";
import { type AgentToolResult, type ExtensionAPI, defineTool } from "./pi/index.js";
import { isComputerUseBetaEnabled, isMacOSCuaCodeModeEnabled } from "./settings.js";
import { registerAllTools } from "./tools/index.js";

// Verified Pi ImageContent shape: { type: "image"; data: string; mimeType: string }.
interface ExtensionState {
	readonly computer: MacOSHostComputer;
	readonly screenSize: { readonly width: number; readonly height: number };
	display: DisplayConfig;
	readonly enabled: boolean;
	readonly codeMode: boolean;
}

type ComputerFallbackInput = ComputerToolInput | OpenAIComputerAction | OpenAIComputerActionBatch;

interface ComputerUseModel {
	readonly api?: string;
	readonly provider?: string;
	readonly baseUrl?: string;
	readonly id?: string;
}

const NOOP_OVERLAY = {
	set(): void {},
	highlight(): void {},
	hide(): void {},
	close(): void {},
};

const computerFallbackToolSchema = Type.Union([
	computerToolSchema,
	openaiComputerToolSchema,
	openaiComputerActionBatchSchema,
]);

let state: ExtensionState | undefined;

export default function macosCuaExtension(pi: ExtensionAPI): void {
	pi.on("resources_discover", () => {
		return { skillPaths: [] };
	});

	pi.on("session_start", async (_event, ctx) => {
		const codeMode = isMacOSCuaCodeModeEnabled(ctx.cwd);
		const computer = new MacOSHostComputer(codeMode ? { overlay: NOOP_OVERLAY } : {});
		const screenSize = await computer.getScreenSize();
		const display = resolveDisplayConfig(screenSize, displayProfileForModel(ctx.model?.api, ctx.model?.id));
		const enabled = isComputerUseBetaEnabled();
		state = { computer, screenSize, display, enabled, codeMode };

		if (codeMode) {
			await registerCodeModeRunTool(pi, computer);
			return;
		}

		registerAllTools(pi, { computer });

		if (!enabled) {
			return;
		}

		pi.registerTool(
			defineTool({
				name: ANTHROPIC_NATIVE_COMPUTER_TOOL_NAME,
				label: "Computer Use",
				description:
					"Native computer-use actions for Anthropic and OpenAI Responses: screenshots, pointer, keyboard, scroll, drag, type, and wait.",
				parameters: computerFallbackToolSchema,
				async execute(_toolCallId, params) {
					const currentState = state;
					if (currentState === undefined) {
						throw new Error("Computer use session is not active");
					}
					return executeComputerFallback(params, currentState.computer, currentState.display);
				},
			}),
		);
		syncComputerToolActivation(pi, ctx.model);
	});

	pi.on("model_select", (event) => {
		recomputeDisplayForModel(event.model);
		syncComputerToolActivation(pi, event.model);
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (state === undefined || !state.enabled || state.codeMode) {
			return event.payload;
		}
		const api = ctx.model?.api;
		if (api === "anthropic-messages") {
			return addAnthropicComputerUseToPayload(api, event.payload, state.display, ctx.model?.id);
		}
		if (api === "openai-responses") {
			const payload = sanitizeOpenAIComputerUsePayload(api, event.payload);
			if (shouldInjectOpenAINativeComputerUse(ctx.model)) {
				return addOpenAIComputerUseToPayload(api, payload, state.display);
			}
			return payload;
		}
		return sanitizeOpenAIComputerUsePayload(api, event.payload);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (state === undefined || !state.enabled || state.codeMode) {
			return undefined;
		}
		if (ctx.model?.api !== "anthropic-messages") {
			return undefined;
		}
		const computerPrompt = supportsAnthropicNativeComputerUse(ctx.model.id)
			? buildComputerUseSection(state.display.modelWidth, state.display.modelHeight)
			: buildCodexComputerUseSection();
		return {
			systemPrompt: `${event.systemPrompt}\n${computerPrompt}`,
		};
	});

	pi.on("session_shutdown", async () => {
		if (state === undefined) return;
		const { computer } = state;
		state = undefined;
		await computer.close();
	});
}

function recomputeDisplayForModel(model: ComputerUseModel | undefined): void {
	if (state === undefined) {
		return;
	}
	state.display = resolveDisplayConfig(state.screenSize, displayProfileForModel(model?.api, model?.id));
}

function syncComputerToolActivation(pi: ExtensionAPI, model: ComputerUseModel | undefined): void {
	if (state === undefined || !state.enabled || state.codeMode) {
		return;
	}
	const activeTools = pi.getActiveTools();
	const shouldActivate =
		(model?.api === "anthropic-messages" && supportsAnthropicNativeComputerUse(model.id)) ||
		(model?.api === "openai-responses" && shouldInjectOpenAINativeComputerUse(model));
	if (shouldActivate) {
		if (!activeTools.includes(ANTHROPIC_NATIVE_COMPUTER_TOOL_NAME)) {
			pi.setActiveTools([...activeTools, ANTHROPIC_NATIVE_COMPUTER_TOOL_NAME]);
		}
		return;
	}
	if (activeTools.includes(ANTHROPIC_NATIVE_COMPUTER_TOOL_NAME)) {
		pi.setActiveTools(activeTools.filter((toolName) => toolName !== ANTHROPIC_NATIVE_COMPUTER_TOOL_NAME));
	}
}

async function registerCodeModeRunTool(pi: ExtensionAPI, computer: MacOSHostComputer): Promise<void> {
	const { CodeModeSandbox, ScreenshotStore, assembleRunResult } = await import("@macos-cua/core");
	const store = new ScreenshotStore();
	const sandbox = new CodeModeSandbox(computer, store);
	pi.registerTool(
		defineTool({
			name: "run",
			label: "Code Mode: run",
			description: CODE_MODE_RUN_TOOL_DESCRIPTION,
			parameters: Type.Object({ code: Type.String() }, { additionalProperties: false }),
			async execute(_toolCallId, params) {
				try {
					return toAgentToolResult(assembleRunResult(await sandbox.run(params.code), store));
				} catch (error) {
					return toAgentToolErrorResult(error);
				}
			},
		}),
	);
}

function shouldInjectOpenAINativeComputerUse(model: ComputerUseModel | undefined): boolean {
	if (model?.provider !== "openai") {
		return false;
	}
	const baseUrl = model.baseUrl ?? "https://api.openai.com/v1";
	try {
		const hostname = new URL(baseUrl).hostname.toLowerCase();
		return hostname === "api.openai.com";
	} catch {
		return false;
	}
}

async function executeComputerFallback(
	params: ComputerFallbackInput,
	computer: MacOSHostComputer,
	display: DisplayConfig,
): Promise<AgentToolResult<OpenAIComputerBatchResultDetails | undefined>> {
	if (isOpenAIComputerActionBatch(params)) {
		return executeOpenAIComputerActionBatch(params, computer, display);
	}
	if (isOpenAIComputerAction(params)) {
		return executeOpenAIComputerAction(params, computer, display);
	}
	return executeNativeComputerAction(params, computer, display);
}

function isOpenAIComputerActionBatch(params: ComputerFallbackInput): params is OpenAIComputerActionBatch {
	return "actions" in params;
}

function isOpenAIComputerAction(params: ComputerFallbackInput): params is OpenAIComputerAction {
	return "type" in params;
}
