export const DEFAULT_HEARTBEAT_INTERVAL_MS = 500;
export const DEFAULT_HEARTBEAT_FRESHNESS_MS = 2000;
export const SOFTWARE_KILL_SWITCH_LISTENER_ID = "software-kill-switch";

export type SupervisorErrorCode =
	| "SUPERVISOR_HEARTBEAT_STALE"
	| "SUPERVISOR_SUSPENDED"
	| "SUPERVISOR_KILLED"
	| "SUPERVISOR_LISTENER_NOT_READY";

type SupervisorMode = "running" | "suspended" | "killed";

export interface SupervisorActionContext {
	readonly actionId: string;
	readonly action: string;
}

export interface SupervisorOptions {
	readonly clock?: () => number;
	readonly heartbeatFreshnessMs?: number;
	readonly requiredListeners?: readonly string[];
}

export interface SupervisorSnapshot {
	readonly mode: SupervisorMode;
	readonly lastHeartbeatAt: number | undefined;
	readonly heartbeatFreshnessMs: number;
	readonly requiredListeners: readonly string[];
	readonly readyListeners: readonly string[];
	readonly suspendedReason: string | undefined;
	readonly killedReason: string | undefined;
}

export interface SoftwareKillSwitch {
	readonly listenerId: typeof SOFTWARE_KILL_SWITCH_LISTENER_ID;
	markReady(): void;
	kill(reason?: string): void;
}

export class ComputerUseSupervisorError extends Error {
	readonly code: SupervisorErrorCode;
	readonly actionId: string;
	readonly action: string;
	readonly recoveryHint: string;

	constructor(details: SupervisorErrorDetails) {
		super(details.message);
		this.name = "ComputerUseSupervisorError";
		this.code = details.code;
		this.actionId = details.context.actionId;
		this.action = details.context.action;
		this.recoveryHint = details.recoveryHint;
	}
}

interface SupervisorErrorDetails {
	readonly code: SupervisorErrorCode;
	readonly message: string;
	readonly context: SupervisorActionContext;
	readonly recoveryHint: string;
}

export class ComputerUseSupervisor {
	private readonly clock: () => number;
	private readonly heartbeatFreshnessMs: number;
	private readonly requiredListeners: readonly string[];
	private readonly readyListeners = new Set<string>();
	private mode: SupervisorMode = "running";
	private lastHeartbeatAt: number | undefined;
	private suspendedReason: string | undefined;
	private killedReason: string | undefined;

	constructor(options: SupervisorOptions = {}) {
		this.clock = options.clock ?? Date.now;
		this.heartbeatFreshnessMs = options.heartbeatFreshnessMs ?? DEFAULT_HEARTBEAT_FRESHNESS_MS;
		this.requiredListeners = options.requiredListeners ?? [];
	}

	recordHeartbeat(timestampMs: number = this.clock()): void {
		if (this.mode === "killed") {
			return;
		}
		this.lastHeartbeatAt = timestampMs;
	}

	markListenerReady(listenerId: string): void {
		this.readyListeners.add(listenerId);
	}

	suspend(reason?: string): void {
		if (this.mode === "killed") {
			return;
		}
		this.mode = "suspended";
		this.suspendedReason = reason;
	}

	resume(): void {
		if (this.mode === "killed") {
			return;
		}
		this.mode = "running";
		this.suspendedReason = undefined;
	}

	kill(reason?: string): void {
		this.mode = "killed";
		this.killedReason = reason;
	}

	assertCanAct(context: SupervisorActionContext): void {
		switch (this.mode) {
			case "running":
				break;
			case "suspended":
				throw supervisorError({
					code: "SUPERVISOR_SUSPENDED",
					context,
					message: suspendedMessage(this.suspendedReason),
					recoveryHint: "Resume the supervisor before sending input.",
				});
			case "killed":
				throw supervisorError({
					code: "SUPERVISOR_KILLED",
					context,
					message: killedMessage(this.killedReason),
					recoveryHint: "Create a new supervisor session before sending input.",
				});
			default:
				assertNever(this.mode);
		}

		const missingListener = this.requiredListeners.find((listenerId) => !this.readyListeners.has(listenerId));
		if (missingListener !== undefined) {
			throw supervisorError({
				code: "SUPERVISOR_LISTENER_NOT_READY",
				context,
				message: `Computer Use supervisor listener '${missingListener}' is not ready.`,
				recoveryHint: "Wait for required supervisor listeners before sending input.",
			});
		}

		if (!this.hasFreshHeartbeat()) {
			throw supervisorError({
				code: "SUPERVISOR_HEARTBEAT_STALE",
				context,
				message: "Computer Use supervisor heartbeat is stale or missing.",
				recoveryHint: "Restart the supervisor heartbeat before sending input.",
			});
		}
	}

	snapshot(): SupervisorSnapshot {
		return {
			mode: this.mode,
			lastHeartbeatAt: this.lastHeartbeatAt,
			heartbeatFreshnessMs: this.heartbeatFreshnessMs,
			requiredListeners: [...this.requiredListeners],
			readyListeners: [...this.readyListeners],
			suspendedReason: this.suspendedReason,
			killedReason: this.killedReason,
		};
	}

	private hasFreshHeartbeat(): boolean {
		if (this.lastHeartbeatAt === undefined) {
			return false;
		}
		return this.clock() - this.lastHeartbeatAt <= this.heartbeatFreshnessMs;
	}
}

export function createSoftwareKillSwitch(supervisor: ComputerUseSupervisor): SoftwareKillSwitch {
	return {
		listenerId: SOFTWARE_KILL_SWITCH_LISTENER_ID,
		markReady: () => {
			supervisor.markListenerReady(SOFTWARE_KILL_SWITCH_LISTENER_ID);
		},
		kill: (reason?: string) => {
			supervisor.kill(reason);
		},
	};
}

function supervisorError(details: SupervisorErrorDetails): ComputerUseSupervisorError {
	return new ComputerUseSupervisorError(details);
}

function suspendedMessage(reason: string | undefined): string {
	return reason === undefined
		? "Computer Use supervisor is suspended."
		: `Computer Use supervisor is suspended: ${reason}`;
}

function killedMessage(reason: string | undefined): string {
	return reason === undefined
		? "Computer Use supervisor software kill switch is active."
		: `Computer Use supervisor software kill switch is active: ${reason}`;
}

function assertNever(value: never): never {
	throw new Error(`Unexpected supervisor mode: ${String(value)}`);
}
