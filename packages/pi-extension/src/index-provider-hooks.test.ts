import { beforeEach, describe, expect, it } from "vitest";

import {
	createMockPi,
	macosCuaExtension,
	resetExtensionHarness,
	runBeforeAgentStart,
	runBeforeProviderRequest,
	runSessionStart,
} from "./test-support/extension-harness.js";

beforeEach(resetExtensionHarness);

describe("#given enabled session and non-computer provider #when provider payload hook runs #then payload passes through", () => {
	it("returns the original payload for other APIs", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);
		await runSessionStart(pi);
		const payload = { tools: [] };

		const result = runBeforeProviderRequest(pi, "google-generative-ai", payload);

		expect(result).toBe(payload);
	});
});

describe("#given enabled session and OpenAI Chat Completions #when provider payload hook runs #then fallback computer function is stripped", () => {
	it("removes the computer function before OpenAI-compatible Chat providers see it", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);
		await runSessionStart(pi);
		const shellTool = { type: "function", function: { name: "shell", parameters: { type: "object" } } };
		const payload = {
			tools: [{ type: "function", function: { name: "computer", parameters: { type: null } } }, shellTool],
		};

		const result = runBeforeProviderRequest(pi, "openai-completions", payload);

		expect(result).toEqual({ tools: [shellTool] });
	});
});

describe("#given enabled session and OpenAI Responses #when provider payload hook runs #then native computer tool is added", () => {
	it("appends the OpenAI computer tool for direct OpenAI", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);
		await runSessionStart(pi);
		const computerFunction = { type: "function", name: "computer", parameters: { anyOf: [] } };
		const shellTool = { type: "function", name: "shell" };

		const result = runBeforeProviderRequest(
			pi,
			{ api: "openai-responses", provider: "openai", baseUrl: "https://api.openai.com/v1" },
			{ tools: [computerFunction, shellTool] },
		);

		expect(result).toEqual({ tools: [shellTool, { type: "computer" }] });
	});

	it("leaves OpenAI-compatible proxy payloads on Codex-style tools", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);
		await runSessionStart(pi);
		const getStateTool = { type: "function", name: "get_app_state" };
		const payload = { tools: [{ type: "function", name: "computer", parameters: { anyOf: [] } }, getStateTool] };

		const result = runBeforeProviderRequest(
			pi,
			{ api: "openai-responses", provider: "openai", baseUrl: "https://quotio.mengmota.com/v1" },
			payload,
		);

		expect(result).toEqual({ tools: [getStateTool] });
	});
});

describe("#given unsupported Anthropic model #when provider payload hook runs #then native computer tool is not injected", () => {
	it.each(["claude-opus-4-8", "claude-opus-4-6", "claude-future-9-0", undefined])(
		"leaves the payload untouched for %s",
		async (modelId) => {
			const pi = createMockPi();
			macosCuaExtension(pi);
			await runSessionStart(pi, { api: "anthropic-messages", provider: "anthropic", id: modelId });

			const payload = { messages: [] };
			const result = runBeforeProviderRequest(
				pi,
				{ api: "anthropic-messages", provider: "anthropic", id: modelId },
				payload,
			);

			expect(result).toBe(payload);
		},
	);
});

describe("#given unsupported Anthropic model #when agent prompt hook runs #then Codex computer guidance is used", () => {
	it("adds Codex tool guidance without native computer dimensions", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);
		await runSessionStart(pi, { api: "anthropic-messages", provider: "anthropic", id: "claude-opus-4-8" });

		const result = await runBeforeAgentStart(pi, {
			api: "anthropic-messages",
			provider: "anthropic",
			id: "claude-opus-4-8",
		});

		expect(result).toEqual({
			systemPrompt: expect.stringContaining("Use Codex tools"),
		});
		expect(result).toEqual({
			systemPrompt: expect.not.stringContaining("1280x720"),
		});
	});
});

describe("#given supported sonnet session #when provider payload hook runs #then model-profile native computer tool is added", () => {
	it("injects Anthropic computer use with 1024x576 display dimensions", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);
		await runSessionStart(pi, { api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-5" });

		const result = runBeforeProviderRequest(
			pi,
			{ api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-5" },
			{ messages: [] },
		);

		expect(result).toMatchObject({
			tools: [
				{
					type: "computer_20250124",
					name: "computer",
					display_width_px: 1024,
					display_height_px: 576,
				},
			],
			headers: { "anthropic-beta": "computer-use-2025-01-24" },
			extra_body: { betas: ["computer-use-2025-01-24"] },
		});
	});
});

describe("#given enabled session #when agent prompt hook runs #then native computer scaffolds match provider", () => {
	it("adds Anthropic native computer prompt for supported sonnet model", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);
		await runSessionStart(pi, { api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-5" });

		const result = await runBeforeAgentStart(pi, {
			api: "anthropic-messages",
			provider: "anthropic",
			id: "claude-sonnet-4-5",
		});

		expect(result).toEqual({
			systemPrompt: expect.stringContaining("1024x576"),
		});
	});

	it("does not add an OpenAI computer prompt", async () => {
		const pi = createMockPi();
		macosCuaExtension(pi);
		await runSessionStart(pi);

		const result = await runBeforeAgentStart(pi, "openai-responses");

		expect(result).toBeUndefined();
	});
});
