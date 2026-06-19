import type { RunningAppInfo } from "./app-list.js";
import { appLookupKey, resolveTargetAppByName } from "./macos-app-resolver.js";
import type { MacOSDesktopSessionBackend } from "./macos-desktop-session-types.js";

type AppLookupBackend = Pick<MacOSDesktopSessionBackend, "listApps" | "resolveAppByName">;

export class MacOSDesktopAppCache {
	private readonly appByPid = new Map<number, RunningAppInfo>();
	private readonly appLookupByKey = new Map<string, number>();

	clear(): void {
		this.appByPid.clear();
		this.appLookupByKey.clear();
	}

	deletePid(pid: number): void {
		this.appByPid.delete(pid);
		for (const [key, cachedPid] of this.appLookupByKey) {
			if (cachedPid === pid) {
				this.appLookupByKey.delete(key);
			}
		}
	}

	async resolvePid(
		targetPid: number | undefined,
		backend: AppLookupBackend,
		refresh: boolean,
	): Promise<RunningAppInfo> {
		if (targetPid !== undefined && !refresh) {
			const cached = this.appByPid.get(targetPid);
			if (cached !== undefined) {
				return cached;
			}
		}
		const apps = await backend.listApps();
		this.rememberApps(apps);
		if (targetPid === undefined) {
			const frontmost = apps.find((candidate) => candidate.isActive);
			if (frontmost === undefined) {
				throw new Error("No frontmost application available");
			}
			return frontmost;
		}
		const app = apps.find((candidate) => candidate.pid === targetPid);
		if (app === undefined) {
			this.deletePid(targetPid);
			throw new Error(`No running app matched pid ${targetPid}`);
		}
		return app;
	}

	async resolveName(appName: string, backend: AppLookupBackend, refresh: boolean): Promise<RunningAppInfo> {
		const key = appLookupKey(appName);
		if (!refresh) {
			const cachedPid = this.appLookupByKey.get(key);
			const cached = cachedPid === undefined ? undefined : this.appByPid.get(cachedPid);
			if (cached !== undefined) {
				return cached;
			}
		}
		const directlyResolved = await this.resolveNameFast(appName, backend);
		if (directlyResolved !== undefined) {
			return directlyResolved;
		}
		const apps = await backend.listApps();
		this.rememberApps(apps);
		const app = resolveTargetAppByName(apps, appName);
		this.rememberLookup(key, app);
		return app;
	}

	private async resolveNameFast(appName: string, backend: AppLookupBackend): Promise<RunningAppInfo | undefined> {
		if (backend.resolveAppByName === undefined) {
			return undefined;
		}
		try {
			const app = await backend.resolveAppByName(appName);
			this.appByPid.set(app.pid, app);
			this.rememberLookup(appLookupKey(appName), app);
			return app;
		} catch {
			return undefined;
		}
	}

	private rememberApps(apps: readonly RunningAppInfo[]): void {
		for (const app of apps) {
			this.appByPid.set(app.pid, app);
		}
	}

	private rememberLookup(key: string, app: RunningAppInfo): void {
		this.appLookupByKey.set(key, app.pid);
		this.appLookupByKey.set(appLookupKey(app.name), app.pid);
		this.appLookupByKey.set(appLookupKey(app.bundleId), app.pid);
	}
}
