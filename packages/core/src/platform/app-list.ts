import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppInfo } from "../accessibility/types.js";
import { type AppUsage, parseAppUsageBlocks } from "./app-usage.js";
import { execFileStdout } from "./exec-util.js";
import { appLookupKey } from "./macos-app-resolver.js";

const execFileAsync = promisify(execFile);
const LIST_APPS_TIMEOUT_MILLISECONDS = 20_000;
const TARGET_APP_TIMEOUT_MILLISECONDS = 2_000;

export interface RunningAppInfo extends AppInfo {
	readonly isActive: boolean;
	readonly path: string;
}

export async function collectAppUsage(paths: readonly string[]): Promise<Map<string, AppUsage>> {
	if (paths.length === 0) {
		return new Map();
	}
	try {
		const result = await execFileAsync(
			"mdls",
			["-name", "kMDItemLastUsedDate", "-name", "kMDItemUseCount", ...paths],
			{
				encoding: "utf8",
				timeout: LIST_APPS_TIMEOUT_MILLISECONDS,
			},
		);
		return parseAppUsageBlocks(execFileStdout(result), paths);
	} catch {
		return new Map(paths.map((path) => [path, {}]));
	}
}

export async function getRunningMacOSApps(): Promise<RunningAppInfo[]> {
	const result = await execFileAsync("osascript", ["-l", "JavaScript", "-e", LIST_APPS_JXA], {
		encoding: "utf8",
		timeout: LIST_APPS_TIMEOUT_MILLISECONDS,
	});
	return parseRunningApps(execFileStdout(result));
}

export async function resolveRunningMacOSAppByName(appName: string): Promise<RunningAppInfo> {
	const lookup = appLookupKey(appName);
	const bundleId = lookup.includes(".") ? lookup : await resolveBundleIdentifier(appName);
	const result = await execFileAsync("osascript", ["-e", targetAppScript(bundleId)], {
		encoding: "utf8",
		timeout: TARGET_APP_TIMEOUT_MILLISECONDS,
	});
	return parseTargetApp(execFileStdout(result));
}

export function parseRunningApps(output: string): RunningAppInfo[] {
	const parsed: unknown = JSON.parse(output);
	if (!Array.isArray(parsed)) {
		throw new Error("list apps output must be a JSON array");
	}
	return parsed.map(parseRunningApp).sort((left, right) => left.name.localeCompare(right.name));
}

function parseRunningApp(value: unknown): RunningAppInfo {
	if (!isRecord(value)) {
		throw new Error("running app entry must be an object");
	}
	const name = stringField(value, "name");
	const pid = numberField(value, "pid");
	const bundleId = stringField(value, "bundleId");
	const isActive = booleanField(value, "isActive");
	const path = optionalStringField(value, "path");
	return { name, pid, bundleId, isActive, isRunning: true, path };
}

function optionalStringField(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	return typeof value === "string" ? value : "";
}

async function resolveBundleIdentifier(appName: string): Promise<string> {
	const result = await execFileAsync("osascript", ["-e", `id of application ${appleScriptString(appName)}`], {
		encoding: "utf8",
		timeout: TARGET_APP_TIMEOUT_MILLISECONDS,
	});
	const bundleId = execFileStdout(result).trim();
	if (bundleId.length === 0) {
		throw new Error(`No installed app matched '${appName}'`);
	}
	return bundleId;
}

function parseTargetApp(output: string): RunningAppInfo {
	const [name, bundleId, pidText, frontmostText, path] = output.trim().split("\t");
	const pid = Number(pidText);
	if (
		name === undefined ||
		bundleId === undefined ||
		path === undefined ||
		!Number.isSafeInteger(pid) ||
		pid <= 0 ||
		(frontmostText !== "true" && frontmostText !== "false")
	) {
		throw new Error("target app lookup returned an invalid row");
	}
	return { name, bundleId, pid, isActive: frontmostText === "true", isRunning: true, path };
}

function targetAppScript(bundleId: string): string {
	const quotedBundleId = appleScriptString(bundleId);
	return `
tell application "System Events"
	set targetProcess to first application process whose bundle identifier is ${quotedBundleId}
	return (name of targetProcess) & tab & (bundle identifier of targetProcess) & tab & (unix id of targetProcess) & tab & (frontmost of targetProcess) & tab & POSIX path of (file of targetProcess)
end tell
`;
}

function appleScriptString(value: string): string {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function stringField(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	if (typeof value !== "string") {
		throw new Error(`running app ${key} must be a string`);
	}
	return value;
}

function numberField(record: Record<string, unknown>, key: string): number {
	const value = record[key];
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`running app ${key} must be a positive integer`);
	}
	return value;
}

function booleanField(record: Record<string, unknown>, key: string): boolean {
	const value = record[key];
	if (typeof value !== "boolean") {
		throw new Error(`running app ${key} must be a boolean`);
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

const LIST_APPS_JXA = `
const systemEvents = Application("System Events");
function readString(value) {
	try {
		const result = value();
		return typeof result === "string" ? result : "";
	} catch {
		return "";
	}
}
function readPath(process) {
	try {
		return process.file().posixPath();
	} catch {
		return "";
	}
}
JSON.stringify(
	systemEvents.applicationProcesses.whose({ backgroundOnly: false })()
		.map((process) => ({
			name: readString(process.name),
			bundleId: readString(process.bundleIdentifier),
			pid: process.unixId(),
			isActive: process.frontmost(),
			path: readPath(process),
		}))
		.filter((app) => app.name.length > 0 && Number.isInteger(app.pid) && app.pid > 0 && app.bundleId.length > 0),
);
`;
