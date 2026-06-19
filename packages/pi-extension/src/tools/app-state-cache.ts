import type { AppState } from "@macos-cua/core";

export interface AppStateCache {
	store(state: AppState): void;
	get(targetPid: number): AppState | undefined;
}

export function createAppStateCache(): AppStateCache {
	const states = new Map<number, AppState>();
	return {
		store(state) {
			states.set(state.pid, state);
		},
		get(targetPid) {
			return states.get(targetPid);
		},
	};
}
