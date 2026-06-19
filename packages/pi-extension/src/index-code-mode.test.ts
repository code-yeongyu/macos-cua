import { beforeEach, describe, expect, it, vi } from "vitest";

const macOSHostComputerMock = vi.hoisted(() => {
	const instance = {
		getScreenSize: vi.fn().mockResolvedValue({ width: 2560, height: 1440 }),
		close: vi.fn().mockResolvedValue(undefined),
	};
	return { constructor: vi.fn(() => instance), instance };
});
const sandboxRunMock = vi.hoisted(() => vi.fn());
const fsMock = vi.hoisted(() => ({
	existsSync: vi.fn(() => false),
	readFileSync: vi.fn(() => "{}"),
}));

vi.mock("node:fs", () => ({
	existsSync: fsMock.existsSync,
	readFileSync: fsMock.readFileSync,
}));
vi.mock("@macos-cua/core", () => ({
	MacOSHostComputer: macOSHostComputerMock.constructor,
	createDebugLog: vi.fn(() => vi.fn()),
	ScreenshotStore: vi.fn(),
	CodeModeSandbox: vi.fn(() => ({ run: sandboxRunMock })),
	assembleRunResult: (raw: {
		readonly logs: readonly string[];
		readonly result: unknown;
		readonly surfaced: readonly string[];
	}) => ({
		images: raw.surfaced.map((id) => ({ data: Buffer.from(`image:${id}`), mimeType: "image/png" as const })),
		text: [...raw.logs, JSON.stringify(raw.result)].join("\n"),
	}),
}));

import macosCuaExtension from "./index.js";
import type { ExtensionAPI } from "./pi/index.js";

type EventHandler = (...parameters: ReadonlyArray<unknown>) => unknown;
type RegisteredTool = {
	readonly name: string;
	readonly execute: (params: unknown) => Promise<unknown>;
};

interface MockPi extends ExtensionAPI {
	readonly handlers: Map<string, EventHandler>;
	readonly registeredTools: RegisteredTool[];
}

function createMockPi(): MockPi {
	const handlers = new Map<string, EventHandler>();
	const registeredTools: RegisteredTool[] = [];
	return {
		handlers,
		registeredTools,
		on: ((eventName: string, handler: EventHandler) => handlers.set(eventName, handler)) as ExtensionAPI["on"],
		registerTool(tool) {
			registeredTools.push({
				name: tool.name,
				execute: async (params: unknown) =>
					await Reflect.apply(tool.execute, tool, ["tool-call", params, undefined, undefined, {}]),
			});
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
			return registeredTools.map((tool) => tool.name);
		},
		getAllTools() {
			return [];
		},
		setActiveTools() {},
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

beforeEach(() => {
	Reflect.deleteProperty(process.env, "MACOS_CUA_CODE_MODE");
	vi.clearAllMocks();
	fsMock.existsSync.mockReturnValue(false);
	fsMock.readFileSync.mockReturnValue("{}");
	sandboxRunMock.mockResolvedValue({ logs: ["ok"], result: { done: true }, surfaced: ["shot_1"] });
});

async function runSessionStart(pi: MockPi): Promise<void> {
	const handler = pi.handlers.get("session_start");
	if (handler === undefined) {
		throw new Error("session_start handler missing");
	}
	await handler({ reason: "startup" }, { model: undefined });
}

async function runSessionStartInCwd(pi: MockPi, cwd: string): Promise<void> {
	const handler = pi.handlers.get("session_start");
	if (handler === undefined) {
		throw new Error("session_start handler missing");
	}
	await handler({ reason: "startup" }, { model: undefined, cwd });
}

function runBeforeProviderRequest(pi: MockPi, payload: unknown): unknown {
	const handler = pi.handlers.get("before_provider_request");
	if (handler === undefined) {
		throw new Error("before_provider_request handler missing");
	}
	return handler(
		{ payload },
		{ model: { api: "openai-responses", provider: "openai", baseUrl: "https://api.openai.com/v1" } },
	);
}

async function runBeforeAgentStart(pi: MockPi): Promise<unknown> {
	const handler = pi.handlers.get("before_agent_start");
	if (handler === undefined) {
		throw new Error("before_agent_start handler missing");
	}
	return await handler(
		{ systemPrompt: "base prompt" },
		{ model: { api: "anthropic-messages", provider: "anthropic" } },
	);
}

describe("#given codeMode env var #when session_start runs #then only run is registered", () => {
	it("skips discrete tools and native payload injection", async () => {
		process.env["MACOS_CUA_CODE_MODE"] = "1";
		const pi = createMockPi();
		macosCuaExtension(pi);

		await runSessionStart(pi);
		const payload = { tools: [] };

		expect(pi.registeredTools.map((tool) => tool.name)).toEqual(["run"]);
		expect(macOSHostComputerMock.constructor).toHaveBeenCalledWith({
			overlay: {
				set: expect.any(Function),
				highlight: expect.any(Function),
				hide: expect.any(Function),
				close: expect.any(Function),
			},
		});
		expect(runBeforeProviderRequest(pi, payload)).toBe(payload);
		expect(await runBeforeAgentStart(pi)).toBeUndefined();
	});

	it("still registers a live run tool when node snapshot flags are managed by the host app", async () => {
		process.env["MACOS_CUA_CODE_MODE"] = "1";
		const pi = createMockPi();
		macosCuaExtension(pi);

		await runSessionStart(pi);
		await pi.registeredTools[0]?.execute({ code: "return 1" });

		expect(sandboxRunMock).toHaveBeenCalledWith("return 1");
	});

	it("maps run results to ordered images and text", async () => {
		process.env["MACOS_CUA_CODE_MODE"] = "1";
		const pi = createMockPi();
		macosCuaExtension(pi);

		await runSessionStart(pi);
		const result = await pi.registeredTools[0]?.execute({ code: "console.log('ok')" });

		expect(sandboxRunMock).toHaveBeenCalledWith("console.log('ok')");
		expect(result).toEqual({
			content: [
				{ type: "image", data: Buffer.from("image:shot_1").toString("base64"), mimeType: "image/png" },
				{ type: "text", text: 'ok\n{"done":true}' },
			],
			details: undefined,
		});
	});

	it("enables code mode from project settings when the env var is unset", async () => {
		const pi = createMockPi();
		fsMock.existsSync.mockReturnValue(true);
		fsMock.readFileSync.mockReturnValue(JSON.stringify({ macosCua: { codeMode: true } }));
		macosCuaExtension(pi);

		await runSessionStartInCwd(pi, "/repo");

		expect(fsMock.existsSync).toHaveBeenCalledWith("/repo/.senpi/settings.json");
		expect(pi.registeredTools.map((tool) => tool.name)).toEqual(["run"]);
	});
});
