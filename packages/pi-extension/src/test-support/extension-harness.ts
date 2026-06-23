import { vi } from "vitest";

const macOSHostComputerMock = vi.hoisted(() => {
	const instance = {
		capabilities: {
			supportsScreenshot: true,
			supportsInput: true,
			supportsAccessibility: true,
			supportsClipboard: true,
		},
		screenshot: vi.fn(),
		setTarget: vi.fn(),
		move: vi.fn(),
		click: vi.fn(),
		rightClick: vi.fn(),
		middleClick: vi.fn(),
		doubleClick: vi.fn(),
		type: vi.fn(),
		key: vi.fn(),
		scroll: vi.fn(),
		drag: vi.fn(),
		getCursorPosition: vi.fn(),
		getScreenSize: vi.fn().mockResolvedValue({ width: 2560, height: 1440 }),
		getAppState: vi.fn().mockResolvedValue({
			app: "Finder",
			bundleId: "com.apple.finder",
			pid: 1234,
			frontmost: true,
			axAvailable: true,
			elements: [],
			screenshotBase64: "",
			screenshotWidth: 1280,
			screenshotHeight: 720,
		}),
		listApps: vi
			.fn()
			.mockResolvedValue([{ name: "Finder", bundleId: "com.apple.finder", pid: 1234, isRunning: true }]),
		setValue: vi.fn().mockResolvedValue(undefined),
		performAction: vi.fn().mockResolvedValue(undefined),
		pressAtPosition: vi.fn().mockResolvedValue(false),
		typeIntoFocused: vi.fn().mockResolvedValue(false),
		close: vi.fn().mockResolvedValue(undefined),
	};
	return {
		constructor: vi.fn(() => instance),
		instance,
	};
});

const fsMock = vi.hoisted(() => ({
	existsSync: vi.fn(() => false),
}));

vi.mock("node:fs", () => ({
	existsSync: fsMock.existsSync,
}));

vi.mock("@macos-cua/core", () => ({
	MacOSHostComputer: macOSHostComputerMock.constructor,
	createDebugLog: vi.fn(() => vi.fn()),
	executeDiscreteBatch: vi.fn(),
}));

import extensionFactory from "../index.js";
import type { ExtensionAPI } from "../pi/index.js";

type EventHandler = (...parameters: ReadonlyArray<unknown>) => unknown;

export type RegisteredTool = {
	readonly name: string;
	readonly executeScreenshot: () => Promise<unknown>;
};

export interface MockPi extends ExtensionAPI {
	readonly handlers: Map<string, EventHandler>;
	readonly registeredTools: RegisteredTool[];
}

export interface TestModel {
	readonly api: string;
	readonly baseUrl?: string;
	readonly provider?: string;
	readonly id?: string;
}

export const macosCuaExtension = extensionFactory;
export { fsMock, macOSHostComputerMock };

export function createMockPi(): MockPi {
	const handlers = new Map<string, EventHandler>();
	const registeredTools: RegisteredTool[] = [];
	const activeTools: string[] = [];
	const on = ((eventName: string, handler: EventHandler) => {
		handlers.set(eventName, handler);
	}) as ExtensionAPI["on"];
	return {
		handlers,
		registeredTools,
		on,
		registerTool(tool) {
			registeredTools.push({
				name: tool.name,
				executeScreenshot: async () =>
					await Reflect.apply(tool.execute, tool, [
						"tool-call",
						{ action: "screenshot" },
						undefined,
						undefined,
						{},
					]),
			});
			activeTools.push(tool.name);
		},
		registerCommand() {},
		registerShortcut() {},
		registerFlag() {},
		getFlag() {
			return undefined;
		},
		registerMessageRenderer() {},
		sendMessage() {},
		sendUserMessage() {},
		appendEntry() {},
		setSessionName() {},
		getSessionName() {
			return undefined;
		},
		setLabel() {},
		exec: vi.fn<ExtensionAPI["exec"]>(),
		getActiveTools() {
			return [...activeTools];
		},
		getAllTools() {
			return [];
		},
		setActiveTools(toolNames) {
			activeTools.splice(0, activeTools.length, ...toolNames);
		},
		getCommands() {
			return [];
		},
		setModel: vi.fn<ExtensionAPI["setModel"]>().mockResolvedValue(false),
		getThinkingLevel: vi.fn<ExtensionAPI["getThinkingLevel"]>(),
		setThinkingLevel() {},
		registerProvider() {},
		unregisterProvider() {},
		events: {} as ExtensionAPI["events"],
	};
}

export function resetExtensionHarness(): void {
	process.env["MACOS_CUA_DISABLE_COMPUTER_USE_BETA"] = undefined;
	process.env["MACOS_CUA_CODE_MODE"] = undefined;
	vi.clearAllMocks();
	fsMock.existsSync.mockReturnValue(false);
	macOSHostComputerMock.instance.getScreenSize.mockResolvedValue({ width: 2560, height: 1440 });
	macOSHostComputerMock.instance.close.mockResolvedValue(undefined);
}

export async function runSessionStart(pi: MockPi, model?: TestModel): Promise<void> {
	const sessionStart = pi.handlers.get("session_start");
	if (sessionStart === undefined) {
		throw new Error("session_start handler missing");
	}
	await sessionStart({ reason: "startup" }, { model });
}

export async function runModelSelect(pi: MockPi, model: TestModel): Promise<void> {
	const modelSelect = pi.handlers.get("model_select");
	if (modelSelect === undefined) {
		throw new Error("model_select handler missing");
	}
	await modelSelect({ model, previousModel: undefined, source: "set" }, { model });
}

export function runBeforeProviderRequest(pi: MockPi, model: string | TestModel, payload: unknown): unknown {
	const beforeProviderRequest = pi.handlers.get("before_provider_request");
	if (beforeProviderRequest === undefined) {
		throw new Error("before_provider_request handler missing");
	}
	const resolvedModel = typeof model === "string" ? { api: model } : model;
	return beforeProviderRequest({ payload }, { model: resolvedModel });
}

export function registeredComputerTool(pi: MockPi): RegisteredTool {
	const tool = pi.registeredTools.find((candidate) => candidate.name === "computer");
	if (tool === undefined) {
		throw new Error("computer tool missing");
	}
	return tool;
}

export async function runBeforeAgentStart(pi: MockPi, model: string | TestModel): Promise<unknown> {
	const beforeAgentStart = pi.handlers.get("before_agent_start");
	if (beforeAgentStart === undefined) {
		throw new Error("before_agent_start handler missing");
	}
	const resolvedModel = typeof model === "string" ? { api: model } : model;
	return beforeAgentStart({ systemPrompt: "base prompt" }, { model: resolvedModel });
}
