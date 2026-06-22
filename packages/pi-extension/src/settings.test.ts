import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
	existsSync: vi.fn(() => false),
	readFileSync: vi.fn(() => "{}"),
}));
const osMock = vi.hoisted(() => ({
	homedir: vi.fn(() => "/Users/tester"),
}));

vi.mock("node:fs", () => ({
	existsSync: fsMock.existsSync,
	readFileSync: fsMock.readFileSync,
}));
vi.mock("node:os", () => ({
	homedir: osMock.homedir,
}));

import { CODE_MODE_ENV, isMacOSCuaCodeModeEnabled } from "./settings.js";

const PACKAGE_PATH = "/Users/tester/.senpi/agent/code-mode-packages/macos-cua/package.json";
const WRAPPER_PATH = "/Users/tester/.senpi/agent/code-mode-packages/macos-cua/macos-cua.js";

beforeEach(() => {
	vi.clearAllMocks();
	fsMock.existsSync.mockReturnValue(false);
	fsMock.readFileSync.mockReturnValue("{}");
	osMock.homedir.mockReturnValue("/Users/tester");
});

describe("code mode settings #given activation sources #when resolving mode #then precedence is stable", () => {
	it("#given ancestor project codeMode true #when the cwd is nested #then code mode is enabled", () => {
		fsMock.existsSync.mockImplementation((targetPath) => targetPath === "/repo/.senpi/settings.json");
		fsMock.readFileSync.mockReturnValue(JSON.stringify({ macosCua: { codeMode: true } }));

		const enabled = isMacOSCuaCodeModeEnabled("/repo/packages/pi-extension");

		expect(fsMock.existsSync).toHaveBeenCalledWith("/repo/packages/pi-extension/.senpi/settings.json");
		expect(fsMock.existsSync).toHaveBeenCalledWith("/repo/packages/.senpi/settings.json");
		expect(fsMock.existsSync).toHaveBeenCalledWith("/repo/.senpi/settings.json");
		expect(enabled).toBe(true);
	});

	it("#given an installed Senpi code-mode package #when project settings are absent #then code mode is enabled", () => {
		fsMock.existsSync.mockImplementation((targetPath) => targetPath === PACKAGE_PATH || targetPath === WRAPPER_PATH);
		fsMock.readFileSync.mockImplementation((targetPath) => {
			if (targetPath === PACKAGE_PATH) {
				return JSON.stringify({
					name: "macos-cua-senpi-code-mode",
					type: "module",
					pi: { extensions: ["./macos-cua.js"] },
				});
			}
			if (targetPath === WRAPPER_PATH) {
				return `process.env.${CODE_MODE_ENV} = "1";`;
			}
			return "{}";
		});

		const enabled = isMacOSCuaCodeModeEnabled("/Users/tester/local-workspaces");

		expect(fsMock.existsSync).toHaveBeenCalledWith("/Users/tester/local-workspaces/.senpi/settings.json");
		expect(fsMock.existsSync).toHaveBeenCalledWith(PACKAGE_PATH);
		expect(fsMock.existsSync).toHaveBeenCalledWith(WRAPPER_PATH);
		expect(enabled).toBe(true);
	});

	it("#given project codeMode false and an installed package #when resolving mode #then code mode is disabled", () => {
		const settingsPath = "/repo/.senpi/settings.json";
		fsMock.existsSync.mockImplementation(
			(targetPath) => targetPath === settingsPath || targetPath === PACKAGE_PATH || targetPath === WRAPPER_PATH,
		);
		fsMock.readFileSync.mockImplementation((targetPath) => {
			if (targetPath === settingsPath) {
				return JSON.stringify({ macosCua: { codeMode: false } });
			}
			if (targetPath === PACKAGE_PATH) {
				return JSON.stringify({
					name: "macos-cua-senpi-code-mode",
					type: "module",
					pi: { extensions: ["./macos-cua.js"] },
				});
			}
			if (targetPath === WRAPPER_PATH) {
				return `process.env.${CODE_MODE_ENV} = "1";`;
			}
			return "{}";
		});

		const enabled = isMacOSCuaCodeModeEnabled("/repo");

		expect(fsMock.existsSync).not.toHaveBeenCalledWith(PACKAGE_PATH);
		expect(enabled).toBe(false);
	});

	it("#given env codeMode false and project package activation #when resolving mode #then code mode is disabled", () => {
		const settingsPath = "/repo/.senpi/settings.json";
		fsMock.existsSync.mockImplementation(
			(targetPath) => targetPath === settingsPath || targetPath === PACKAGE_PATH || targetPath === WRAPPER_PATH,
		);
		fsMock.readFileSync.mockReturnValue(JSON.stringify({ macosCua: { codeMode: true } }));

		const enabled = isMacOSCuaCodeModeEnabled("/repo", { [CODE_MODE_ENV]: "0" });

		expect(fsMock.existsSync).not.toHaveBeenCalled();
		expect(enabled).toBe(false);
	});
});
