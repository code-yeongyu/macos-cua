import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const CODE_MODE_ENV = "MACOS_CUA_CODE_MODE";
export const DISABLE_COMPUTER_USE_BETA_ENV = "MACOS_CUA_DISABLE_COMPUTER_USE_BETA";

const TRUE_SETTING_VALUES = new Set(["1", "true", "yes", "on"]);
const SETTINGS_PATH_SEGMENTS = [".senpi", "settings.json"] as const;

export function isMacOSCuaCodeModeEnabled(
	cwd: string | undefined,
	env: Readonly<NodeJS.ProcessEnv> = process.env,
): boolean {
	const envValue = env[CODE_MODE_ENV];
	if (envValue !== undefined) {
		return isOptedIn(envValue);
	}
	if (cwd === undefined) {
		return false;
	}
	const projectSetting = readProjectCodeModeSetting(cwd);
	if (projectSetting !== undefined) {
		return projectSetting;
	}
	return false;
}

export function isComputerUseBetaEnabled(env: Readonly<NodeJS.ProcessEnv> = process.env): boolean {
	return !isOptedIn(env[DISABLE_COMPUTER_USE_BETA_ENV]);
}

function readProjectCodeModeSetting(cwd: string): boolean | undefined {
	for (const settingsPath of projectSettingsPaths(cwd)) {
		if (!existsSync(settingsPath)) {
			continue;
		}
		const parsed = parseSettingsJson(readFileSync(settingsPath, "utf8"));
		if (!isObjectRecord(parsed)) {
			return undefined;
		}
		const macosCua = parsed["macosCua"];
		if (!isObjectRecord(macosCua)) {
			return undefined;
		}
		const codeMode = macosCua["codeMode"];
		return typeof codeMode === "boolean" ? codeMode : undefined;
	}
	return undefined;
}

function projectSettingsPaths(cwd: string): readonly string[] {
	const paths: string[] = [];
	let currentDirectory = path.resolve(cwd);
	while (true) {
		paths.push(path.join(currentDirectory, ...SETTINGS_PATH_SEGMENTS));
		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
			return paths;
		}
		currentDirectory = parentDirectory;
	}
}

function parseSettingsJson(content: string): unknown {
	try {
		return JSON.parse(content);
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}
		return undefined;
	}
}

function isObjectRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptedIn(value: string | undefined): boolean {
	return value !== undefined && TRUE_SETTING_VALUES.has(value.trim().toLowerCase());
}
