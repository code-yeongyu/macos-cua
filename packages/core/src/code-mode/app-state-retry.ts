import type { AppState } from "../accessibility/types.js";
import type { ComputerInterface } from "../computer/interface.js";
import type { AppStateOptions } from "../types/index.js";

const WINDOW_RETRY_SETTLE_MS = 750;

export async function getAppStateWithWindowRetry(
	computer: ComputerInterface,
	targetPid: number | undefined,
	options: AppStateOptions | undefined,
): Promise<AppState> {
	try {
		return await computer.getAppState(targetPid, options);
	} catch (error) {
		if (targetPid === undefined || !isMissingTargetWindow(error) || options?.refresh === true) {
			throw error;
		}
		return await computer.getAppState(targetPid, retryAppStateOptions(options));
	}
}

function isMissingTargetWindow(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "MISSING_TARGET_WINDOW";
}

function retryAppStateOptions(options: AppStateOptions | undefined): AppStateOptions {
	return {
		...options,
		refresh: true,
		settleMs: Math.max(options?.settleMs ?? 0, WINDOW_RETRY_SETTLE_MS),
	};
}
