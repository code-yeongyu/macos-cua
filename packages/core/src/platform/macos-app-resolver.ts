import type { RunningAppInfo } from "./app-list.js";

export function appLookupKey(appName: string): string {
	const normalizedApp = appName.trim().toLowerCase();
	if (normalizedApp.length === 0) {
		throw new Error("app must be a non-empty app name, bundle id, or pid");
	}
	return normalizedApp;
}

export function resolveTargetApp(apps: readonly RunningAppInfo[], targetPid: number): RunningAppInfo {
	const app = apps.find((candidate) => candidate.pid === targetPid);
	if (app === undefined) {
		throw new Error(`No running app matched pid ${targetPid}`);
	}
	return app;
}

export function resolveTargetAppByName(apps: readonly RunningAppInfo[], appName: string): RunningAppInfo {
	const normalizedApp = appLookupKey(appName);
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

	const partialMatch = apps.find((candidate) => {
		const normalizedName = candidate.name.toLowerCase();
		const normalizedBundleId = candidate.bundleId.toLowerCase();
		return normalizedName.includes(normalizedApp) || normalizedBundleId.includes(normalizedApp);
	});
	if (partialMatch !== undefined) {
		return partialMatch;
	}

	throw new Error(`No running app matched '${appName}'`);
}
