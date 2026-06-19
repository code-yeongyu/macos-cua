import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import type { AppInfo } from "../accessibility/types.js";
import { ComputerUseError } from "../computer/errors.js";
import { blockedUrl, isBrowserBundle } from "../permission/url-blocklist.js";
import type { AppOpenOptions } from "../types/index.js";
import { type RunningAppInfo, resolveBundleIdentifier, resolveRunningMacOSAppByName } from "./app-list.js";
import { appLookupKey } from "./macos-app-resolver.js";

const execFileAsync = promisify(execFile);
const OPEN_APP_TIMEOUT_MILLISECONDS = 10_000;
const APP_SETTLE_MILLISECONDS = 300;

export async function openMacOSApp(
	appName: string,
	options: AppOpenOptions = {},
	urlBlocklist: readonly string[] = [],
): Promise<AppInfo> {
	const bundleId = await resolveOpenBundleId(appName);
	assertOpenUrlAllowed(bundleId, options.url, urlBlocklist);
	const args = options.url === undefined ? ["-b", bundleId] : ["-b", bundleId, options.url];
	await execFileAsync("open", args, { timeout: OPEN_APP_TIMEOUT_MILLISECONDS });
	await sleep(APP_SETTLE_MILLISECONDS);
	return toAppInfo(await resolveRunningMacOSAppByName(bundleId));
}

async function resolveOpenBundleId(appName: string): Promise<string> {
	const normalized = appLookupKey(appName);
	if (normalized.length === 0) {
		throw new Error("app name must be non-empty");
	}
	return normalized.includes(".") ? appName.trim() : await resolveBundleIdentifier(appName);
}

function assertOpenUrlAllowed(bundleId: string, url: string | undefined, urlBlocklist: readonly string[]): void {
	if (url === undefined || urlBlocklist.length === 0 || !isBrowserBundle(bundleId)) {
		return;
	}
	if (blockedUrl(url, urlBlocklist)) {
		throw new ComputerUseError("BLOCKED_URL", `Computer Use is not allowed to open browser URL: ${url}`, {
			details: { bundleId, url },
		});
	}
}

function toAppInfo(app: RunningAppInfo): AppInfo {
	return { bundleId: app.bundleId, isFrontmost: app.isActive, isRunning: true, name: app.name, pid: app.pid };
}
