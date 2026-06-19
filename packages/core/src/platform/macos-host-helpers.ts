import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppInfo, DisplayInfo } from "../accessibility/types.js";
import { resolveDisplayMetadata } from "../computer/display-metadata.js";
import { ComputerUseError } from "../computer/errors.js";
import type { ScreenshotResult } from "../computer/interface.js";
import type { AppApprovalStore } from "../permission/app-approval.js";
import { blockedUrl, browserUrlScript, isBrowserBundle } from "../permission/url-blocklist.js";
import type { ScreenshotOptions } from "../types/index.js";
import { type RunningAppInfo, collectAppUsage, getRunningMacOSApps } from "./app-list.js";
import { execFileStdout } from "./exec-util.js";
import { parseImageDimensions, sniffImageMimeType } from "./image-format.js";
import type { MacOSAppStateTargetWindow } from "./macos-desktop-session-types.js";
import { getMainDisplayLogicalSize, getMainDisplayNativePixelSize } from "./macos-ffi/screenshot.js";
import { captureMacOSScreenshot, targetSizeFromRegion } from "./macos-screen.js";
import { systemEventsTargetWindowBounds } from "./macos-window-target-fallback.js";

const execFileAsync = promisify(execFile);

const BROWSER_URL_TIMEOUT_MILLISECONDS = 2_000;

export async function captureMacOSScreenshotResult(
	options: ScreenshotOptions | undefined,
	windowId: number | undefined,
	getScreenSize: () => Promise<{ width: number; height: number }>,
): Promise<ScreenshotResult> {
	const size =
		options?.targetSize ??
		(options?.region === undefined ? await getScreenSize() : targetSizeFromRegion(options.region));
	const data = await captureMacOSScreenshot(
		size,
		windowId,
		options?.format ?? "png",
		options?.quality ?? 72,
		options?.region,
	);
	const dimensions = parseImageDimensions(data);
	return {
		data,
		mimeType: sniffImageMimeType(data),
		width: dimensions.width,
		height: dimensions.height,
	};
}

export async function resolveAppStateTargetWindow(
	rememberTargetWindow: (pid: number) => Promise<MacOSAppStateTargetWindow | undefined>,
	pid: number,
): Promise<MacOSAppStateTargetWindow | undefined> {
	try {
		return await rememberTargetWindow(pid);
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}
		const bounds = await systemEventsTargetWindowBounds(pid);
		return bounds === undefined ? undefined : { bounds };
	}
}

export async function assertBrowserUrlAllowed(app: RunningAppInfo, urlBlocklist: readonly string[]): Promise<void> {
	if (urlBlocklist.length === 0 || !isBrowserBundle(app.bundleId)) {
		return;
	}
	const script = browserUrlScript(app.bundleId);
	if (script === undefined) {
		return;
	}
	let url: string;
	try {
		const result = await execFileAsync("osascript", ["-e", script], {
			encoding: "utf8",
			timeout: BROWSER_URL_TIMEOUT_MILLISECONDS,
		});
		url = execFileStdout(result).trim();
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}
		return;
	}
	if (url.length > 0 && blockedUrl(url, urlBlocklist)) {
		throw new ComputerUseError("BLOCKED_URL", `Computer Use is not allowed on the current browser URL: ${url}`, {
			details: { bundleId: app.bundleId, pid: app.pid, url },
		});
	}
}

export function assertAppApproved(app: RunningAppInfo, appApproval: AppApprovalStore | undefined): void {
	if (appApproval === undefined) {
		return;
	}
	const decision = appApproval.decide(app.bundleId);
	if (decision === "denied") {
		throw new ComputerUseError("UNAPPROVED_APP", `Computer Use is not allowed to use the app '${app.name}'.`, {
			details: { appName: app.name, bundleId: app.bundleId, pid: app.pid },
		});
	}
	if (decision === "needs-approval") {
		throw new ComputerUseError(
			"UNAPPROVED_APP",
			`Computer Use needs your approval to use '${app.name}'. Approve the app and try again.`,
			{ details: { appName: app.name, bundleId: app.bundleId, pid: app.pid } },
		);
	}
}

export async function listMacOSAppInfo(): Promise<AppInfo[]> {
	const running = await getRunningMacOSApps();
	const usage = await collectAppUsage(running.map((app) => app.path).filter((path) => path.length > 0));
	return running.map((app) => {
		const appUsage = usage.get(app.path) ?? {};
		return {
			bundleId: app.bundleId,
			name: app.name,
			pid: app.pid,
			isRunning: true,
			isFrontmost: app.isActive,
			...(appUsage.lastUsedDate !== undefined ? { lastUsedDate: appUsage.lastUsedDate } : {}),
			...(appUsage.useCount !== undefined ? { useCount: appUsage.useCount } : {}),
		};
	});
}

export function resolveDisplayInfo(): DisplayInfo {
	const logical = getMainDisplayLogicalSize();
	let nativePixel: { width: number; height: number } | undefined;
	try {
		nativePixel = getMainDisplayNativePixelSize();
	} catch {
		nativePixel = undefined;
	}
	return resolveDisplayMetadata(nativePixel === undefined ? { logical } : { logical, nativePixel });
}

export function resolveTargetAppByName(apps: readonly RunningAppInfo[], appName: string): RunningAppInfo {
	const normalizedApp = appName.trim().toLowerCase();
	if (normalizedApp.length === 0) {
		throw new Error("app must be a non-empty app name, bundle id, or pid");
	}

	const numericPid = Number(normalizedApp);
	if (Number.isSafeInteger(numericPid) && numericPid > 0) {
		return resolveTargetApp(apps, numericPid);
	}

	const exactMatch = apps.find((candidate) => {
		const normalizedName = candidate.name.toLowerCase();
		const normalizedBundleId = candidate.bundleId.toLowerCase();
		return normalizedName === normalizedApp || normalizedBundleId === normalizedApp;
	});
	if (exactMatch !== undefined) {
		return exactMatch;
	}

	const partialMatch = apps.find((candidate) => candidate.name.toLowerCase().includes(normalizedApp));
	if (partialMatch !== undefined) {
		return partialMatch;
	}

	throw new Error(`No running app matched '${appName}'`);
}

function resolveTargetApp(apps: readonly RunningAppInfo[], targetPid: number): RunningAppInfo {
	const app = apps.find((candidate) => candidate.pid === targetPid);
	if (app === undefined) {
		throw new Error(`No running app matched pid ${targetPid}`);
	}
	return app;
}
