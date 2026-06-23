import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	createMockPi,
	macOSHostComputerMock,
	macosCuaExtension,
	registeredComputerTool,
	resetExtensionHarness,
	runBeforeProviderRequest,
	runModelSelect,
	runSessionStart,
} from "./test-support/extension-harness.js";

beforeEach(resetExtensionHarness);

describe("#given macosCuaExtension #when imported #then default export is a named function", () => {
	it("is a function named macosCuaExtension", () => {
		expect(typeof macosCuaExtension).toBe("function");
		expect(macosCuaExtension.name).toBe("macosCuaExtension");
	});
});

describe("#given a pi API #when extension factory runs #then lifecycle handlers are registered", () => {
	it("registers session_start, model_select, request, prompt, and session_shutdown handlers", () => {
		const pi = createMockPi();
		const onSpy = vi.spyOn(pi, "on");

		macosCuaExtension(pi);

		expect(onSpy).toHaveBeenCalledWith("session_start", expect.any(Function));
		expect(onSpy).toHaveBeenCalledWith("model_select", expect.any(Function));
		expect(onSpy).toHaveBeenCalledWith("before_provider_request", expect.any(Function));
		expect(onSpy).toHaveBeenCalledWith("before_agent_start", expect.any(Function));
		expect(onSpy).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
		expect(onSpy).toHaveBeenCalledTimes(5);
		expect([...pi.handlers.keys()]).toEqual([
			"session_start",
			"model_select",
			"before_provider_request",
			"before_agent_start",
			"session_shutdown",
		]);
	});
});

describe("#given default-on session_start #when invoked #then native computer and Codex tools are registered", () => {
	it("registers computer alongside the Codex-compatible tools", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);

		await runSessionStart(pi);

		expect(pi.registeredTools.map((tool) => tool.name)).toEqual([
			"list_apps",
			"get_app_state",
			"click",
			"perform_secondary_action",
			"set_value",
			"select_text",
			"drag",
			"scroll",
			"zoom",
			"type_text",
			"press_keys",
			"batch",
			"computer",
		]);
	});
});

describe("#given opt-out env var #when session_start runs #then native computer tool is not registered", () => {
	it("keeps only the Codex-compatible tools", async () => {
		process.env["MACOS_CUA_DISABLE_COMPUTER_USE_BETA"] = "1";
		const pi = createMockPi();
		macosCuaExtension(pi);

		await runSessionStart(pi);

		expect(pi.registeredTools.map((tool) => tool.name)).toEqual([
			"list_apps",
			"get_app_state",
			"click",
			"perform_secondary_action",
			"set_value",
			"select_text",
			"drag",
			"scroll",
			"zoom",
			"type_text",
			"press_keys",
			"batch",
		]);
	});
});

describe("#given enabled OpenAI Chat session #when session_start runs #then fallback computer tool is inactive", () => {
	it("keeps computer registered for execution but not active for Chat Completions providers", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);

		await runSessionStart(pi, {
			api: "openai-completions",
			provider: "opengateway-dev",
			baseUrl: "https://dev-asmr-v2.sionic.im/v1",
		});

		expect(pi.registeredTools.map((tool) => tool.name)).toContain("computer");
		expect(pi.getActiveTools()).not.toContain("computer");
	});
});

describe("#given supported Anthropic sonnet session #when session_start runs #then fallback computer tool stays active", () => {
	it("keeps computer active for sonnet native computer-use payloads", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);

		await runSessionStart(pi, { api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-5" });

		expect(pi.getActiveTools()).toContain("computer");
	});
});

describe("#given unsupported Anthropic model session #when session_start runs #then fallback computer tool is inactive", () => {
	it("does not activate computer for models without native computer-use support", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);

		await runSessionStart(pi, { api: "anthropic-messages", provider: "anthropic", id: "claude-opus-4-8" });

		expect(pi.getActiveTools()).not.toContain("computer");
	});

	it("does not activate computer when model id is unknown", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);

		await runSessionStart(pi, { api: "anthropic-messages", provider: "anthropic" });

		expect(pi.getActiveTools()).not.toContain("computer");
	});
});

describe("#given enabled OpenAI proxy Responses session #when session_start runs #then fallback computer tool is inactive", () => {
	it("does not activate computer for OpenAI-compatible Responses proxies", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);

		await runSessionStart(pi, {
			api: "openai-responses",
			provider: "openai",
			baseUrl: "https://quotio.mengmota.com/v1",
		});

		expect(pi.getActiveTools()).not.toContain("computer");
	});
});

describe("#given enabled session #when model changes from native computer-use to OpenAI Chat #then computer is deactivated", () => {
	it("removes computer from active tools while preserving other macOS tools", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);
		await runSessionStart(pi, { api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-5" });

		await runModelSelect(pi, {
			api: "openai-completions",
			provider: "opengateway-dev",
			baseUrl: "https://dev-asmr-v2.sionic.im/v1",
		});

		expect(pi.getActiveTools()).toEqual([
			"list_apps",
			"get_app_state",
			"click",
			"perform_secondary_action",
			"set_value",
			"select_text",
			"drag",
			"scroll",
			"zoom",
			"type_text",
			"press_keys",
			"batch",
		]);
	});
});

describe("#given enabled session #when model changes to direct OpenAI Responses #then computer is activated", () => {
	it("adds computer back only for direct OpenAI native computer-use", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);
		await runSessionStart(pi, {
			api: "openai-completions",
			provider: "opengateway-dev",
			baseUrl: "https://dev-asmr-v2.sionic.im/v1",
		});

		await runModelSelect(pi, {
			api: "openai-responses",
			provider: "openai",
			baseUrl: "https://api.openai.com/v1",
		});

		expect(pi.getActiveTools()).toContain("computer");
	});
});

describe("#given enabled session #when model changes display profile #then provider hooks use recomputed display", () => {
	it("updates Anthropic native payload dimensions from the selected model", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);
		await runSessionStart(pi, {
			api: "openai-responses",
			provider: "openai",
			baseUrl: "https://api.openai.com/v1",
			id: "gpt-5.1",
		});

		await runModelSelect(pi, { api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-5" });
		const result = runBeforeProviderRequest(
			pi,
			{ api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-5" },
			{ messages: [] },
		);

		expect(result).toMatchObject({
			tools: [
				{
					name: "computer",
					display_width_px: 1024,
					display_height_px: 576,
				},
			],
		});
	});
});

describe("#given fallback computer tool #when model changes display profile before execution #then current display is used", () => {
	it("passes the selected model display to screenshot execution", async () => {
		const pi = createMockPi();
		macOSHostComputerMock.instance.screenshot.mockResolvedValue({
			data: Buffer.from("png"),
			mimeType: "image/png",
			width: 1024,
			height: 576,
		});
		macOSHostComputerMock.instance.getCursorPosition.mockResolvedValue({ x: 1280, y: 720 });
		macosCuaExtension(pi);
		await runSessionStart(pi, {
			api: "openai-responses",
			provider: "openai",
			baseUrl: "https://api.openai.com/v1",
			id: "gpt-5.1",
		});

		await runModelSelect(pi, { api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-5" });
		await registeredComputerTool(pi).executeScreenshot();

		expect(macOSHostComputerMock.instance.screenshot).toHaveBeenCalledWith({
			targetSize: { width: 1024, height: 576 },
		});
	});
});
