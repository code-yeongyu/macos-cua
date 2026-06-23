import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ComputerInterface } from "@macos-cua/core";
import { describe, expect, it, vi } from "vitest";

import { buildCodexComputerUseSection, buildComputerUseSection } from "../anthropic-computer-use.js";
import type { ExtensionAPI } from "../pi/index.js";
import { buildAllTools, registerAllTools } from "./index.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, "../../../..");
const macosCuaSkillPath = path.join(repoRoot, "skills/macos-cua/SKILL.md");

function createPiApi(): ExtensionAPI {
	const on = ((eventName: string, handler: (...parameters: ReadonlyArray<unknown>) => unknown) => {
		void eventName;
		void handler;
	}) as ExtensionAPI["on"];
	return {
		on,
		registerTool() {},
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
			return [];
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

function createComputer(): ComputerInterface {
	return {
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
		getScreenSize: vi.fn(),
		getAppState: vi.fn(),
		getScreenshotViewport: vi.fn().mockResolvedValue(undefined),
		listApps: vi.fn(),
		setValue: vi.fn(),
		selectText: vi.fn(),
		performAction: vi.fn(),
		pressAtPosition: vi.fn(),
		typeIntoFocused: vi.fn(),
		close: vi.fn(),
	};
}

describe("#given all tool factories #when built #then every Codex Computer Use tool is present", () => {
	it("builds the expected tool names", () => {
		const tools = buildAllTools({ computer: createComputer() });

		expect(tools.map((tool) => tool.name)).toEqual([
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

describe("#given all tools #when registered #then pi.registerTool is called for each tool", () => {
	it("registers every built tool", () => {
		const pi = createPiApi();
		const registerToolSpy = vi.spyOn(pi, "registerTool");

		registerAllTools(pi, { computer: createComputer() });

		expect(registerToolSpy).toHaveBeenCalledTimes(12);
	});
});

describe("#given computer-use prompt text #when small targets are present #then zoom is recommended", () => {
	it("tells models to zoom before clicking small targets", () => {
		const prompt = `${buildComputerUseSection(1280, 720)}\n${buildCodexComputerUseSection()}`;

		expect(prompt).toContain("zoom");
		expect(prompt).toContain("small targets");
		expect(prompt).toContain("click element_index=<number>");
	});

	it("#given coordinate guidance #when prompt text is read #then screenshot pixels and recovery are explicit", () => {
		const prompt = `${buildComputerUseSection(1280, 720)}\n${buildCodexComputerUseSection()}`;

		expect(prompt).toContain("screenshot pixels");
		expect(prompt).toContain("fresh screenshot");
		expect(prompt).toContain("Do not guess");
		expect(prompt).toContain("capture metadata");
		expect(prompt).toContain("click element_index=<number>");
		expect(prompt).toContain("zoom");
	});
});

describe("#given Senpi pi-extension tool guides #when desktop automation starts #then app state is the primary path", () => {
	it("#given registered tools #when descriptions are read #then get_app_state tells models to start there", () => {
		const tools = buildAllTools({ computer: createComputer() });
		const getAppState = tools.find((tool) => tool.name === "get_app_state");

		expect(getAppState?.description).toContain("first");
		expect(getAppState?.description).toContain("click");
		expect(getAppState?.description).toContain("type_text");
		expect(getAppState?.description).toContain("press_keys");
	});

	it("#given the Senpi skill guide #when pi-extension tools are available #then bash is fallback-only", () => {
		const skill = readFileSync(macosCuaSkillPath, "utf8");
		const piExtensionMode = skill.indexOf("| **pi-extension** |");
		const cliMode = skill.indexOf("| **CLI** |");

		expect(skill).not.toContain("NO custom tools registered");
		expect(piExtensionMode).toBeGreaterThanOrEqual(0);
		expect(cliMode).toBeGreaterThanOrEqual(0);
		expect(piExtensionMode).toBeLessThan(cliMode);
		expect(skill).not.toContain("MUST USE whenever the user wants to automate");
		expect(skill).toContain("Registered tools carry their own guides");
		expect(skill).toContain("## Senpi/pi-extension fallback note");
		expect(skill).toContain("If this skill is already loaded while Senpi/pi-extension tools are visible");
		expect(skill).toContain("Use bash/CLI only when the discrete tools are unavailable");
		expect(skill).toContain("Only check permissions after a black screenshot, missing window, or ignored input");
		expect(skill).not.toContain("Before starting any automation session, verify permissions");
	});

	it("#given registered schemas #when computer-use policy is enforced #then batch exists without deferred fields", () => {
		const tools = buildAllTools({ computer: createComputer() });
		const toolNames = tools.map((tool) => tool.name);
		const schemaText = JSON.stringify(tools.map((tool) => tool.parameters));

		expect(toolNames).toContain("batch");
		expect(schemaText).toContain("capture_id");
		expect(schemaText).toContain("display_epoch");
		expect(schemaText).not.toContain("scroll_x");
		expect(schemaText).not.toContain("scroll_y");
	});
});
