import {
	type AuditErrorCode,
	type AuditEvent,
	type AuditEventInput,
	type CoordinateTarget,
	type ElementTarget,
	createAuditEvent,
} from "./audit.js";
import { type ComputerUseSupervisor, ComputerUseSupervisorError } from "./supervisor.js";

export interface ComputerUseAuditSink {
	append(event: AuditEvent): Promise<void>;
}

export interface ComputerUseActionGateOptions {
	readonly supervisor?: ComputerUseSupervisor;
	readonly auditSink?: ComputerUseAuditSink;
	readonly now?: () => Date;
	readonly nextActionId?: () => string;
}

export interface ComputerUseActionAuditDetails {
	readonly target?: AuditEventInput["target"];
	readonly coordinateTarget?: CoordinateTarget;
	readonly elementTarget?: ElementTarget;
	readonly typedText?: string;
	readonly axValue?: string;
}

export class ComputerUseActionGate {
	private readonly supervisor: ComputerUseSupervisor | undefined;
	private readonly auditSink: ComputerUseAuditSink | undefined;
	private readonly now: () => Date;
	private readonly providedNextActionId: (() => string) | undefined;
	private actionSequence = 0;

	constructor(options: ComputerUseActionGateOptions = {}) {
		this.supervisor = options.supervisor;
		this.auditSink = options.auditSink;
		this.now = options.now ?? (() => new Date());
		this.providedNextActionId = options.nextActionId;
	}

	async run<T>(action: string, details: ComputerUseActionAuditDetails, body: () => Promise<T>): Promise<T> {
		const actionId = this.nextActionId();
		try {
			this.supervisor?.assertCanAct({ actionId, action });
		} catch (error) {
			await this.auditFailure(actionId, action, details, error);
			throw error;
		}

		try {
			const result = await body();
			await this.audit(actionId, action, details, { status: "succeeded" });
			return result;
		} catch (error) {
			await this.auditFailure(actionId, action, details, error);
			throw error;
		}
	}

	private nextActionId(): string {
		if (this.providedNextActionId !== undefined) {
			return this.providedNextActionId();
		}
		this.actionSequence += 1;
		return `computer-use-action-${this.actionSequence}`;
	}

	private async auditFailure(
		actionId: string,
		action: string,
		details: ComputerUseActionAuditDetails,
		error: unknown,
	): Promise<void> {
		await this.audit(actionId, action, details, {
			status: "failed",
			...auditErrorFields(error),
		});
	}

	private async audit(
		actionId: string,
		action: string,
		details: ComputerUseActionAuditDetails,
		outcome: AuditOutcome,
	): Promise<void> {
		if (this.auditSink === undefined) {
			return;
		}
		await this.auditSink.append(
			createAuditEvent({
				timestamp: this.now().toISOString(),
				actionId,
				action,
				status: outcome.status,
				...(details.target !== undefined ? { target: details.target } : {}),
				...(details.coordinateTarget !== undefined ? { coordinateTarget: details.coordinateTarget } : {}),
				...(details.elementTarget !== undefined ? { elementTarget: details.elementTarget } : {}),
				...(details.typedText !== undefined ? { typedText: details.typedText } : {}),
				...(details.axValue !== undefined ? { axValue: details.axValue } : {}),
				...(outcome.errorCode !== undefined ? { errorCode: outcome.errorCode } : {}),
				...(outcome.recoveryHint !== undefined ? { recoveryHint: outcome.recoveryHint } : {}),
			}),
		);
	}
}

interface AuditOutcome {
	readonly status: "succeeded" | "failed";
	readonly errorCode?: AuditErrorCode;
	readonly recoveryHint?: string;
}

function auditErrorFields(error: unknown): Pick<AuditOutcome, "errorCode" | "recoveryHint"> {
	if (error instanceof ComputerUseSupervisorError) {
		return { errorCode: error.code, recoveryHint: error.recoveryHint };
	}
	if (error instanceof Error) {
		return { errorCode: "ACTION_FAILED" };
	}
	return { errorCode: "UNKNOWN_ERROR" };
}
