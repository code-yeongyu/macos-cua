import { type JsonValue, toJsonValue } from "./surface-vocabulary.js";

type ComputerUseErrorKind = "unsupported_action" | "invalid_arguments" | "execution_failed";

export class ComputerUseError extends Error {
	readonly kind: ComputerUseErrorKind;
	readonly action: string | undefined;
	readonly code: string;
	readonly recoveryHint: string | undefined;
	readonly details: JsonValue | undefined;

	constructor(
		kind: ComputerUseErrorKind,
		message: string,
		options?: {
			readonly action?: string;
			readonly cause?: unknown;
			readonly code?: string;
			readonly recoveryHint?: string;
			readonly details?: JsonValue;
		},
	) {
		super(message, options);
		this.name = kind === "unsupported_action" ? "UnsupportedAnthropicAction" : "ComputerUseError";
		this.kind = kind;
		this.action = options?.action;
		this.code = options?.code ?? codeForKind(kind);
		this.recoveryHint = options?.recoveryHint ?? recoveryHintForKind(kind);
		this.details = options?.details;
	}
}

export function toComputerUseExecutionError(error: unknown): ComputerUseError {
	if (error instanceof ComputerUseError) {
		return error;
	}
	if (isSurfaceErrorLike(error)) {
		return computerUseErrorFromSurface(error);
	}
	return new ComputerUseError("execution_failed", errorMessage(error), { cause: error });
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function codeForKind(kind: ComputerUseErrorKind): string {
	switch (kind) {
		case "unsupported_action":
			return "UNSUPPORTED_ACTION";
		case "invalid_arguments":
			return "INVALID_ARGUMENTS";
		case "execution_failed":
			return "ACTION_FAILED";
	}
}

function recoveryHintForKind(kind: ComputerUseErrorKind): string {
	switch (kind) {
		case "unsupported_action":
			return "Use a supported Computer Use action for this target.";
		case "invalid_arguments":
			return "Fix the tool arguments and retry the action.";
		case "execution_failed":
			return "Refresh app state and retry the action.";
	}
}

function isSurfaceErrorLike(error: unknown): error is {
	readonly message: string;
	readonly code: string;
	readonly recoveryHint?: string;
	readonly details?: unknown;
} {
	return (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof error.message === "string" &&
		"code" in error &&
		typeof error.code === "string"
	);
}

function computerUseErrorFromSurface(error: {
	readonly message: string;
	readonly code: string;
	readonly recoveryHint?: string;
	readonly details?: unknown;
}): ComputerUseError {
	const details = toJsonValue(error.details);
	return new ComputerUseError("execution_failed", error.message, {
		code: error.code,
		cause: error,
		...(error.recoveryHint !== undefined ? { recoveryHint: error.recoveryHint } : {}),
		...(details !== undefined ? { details } : {}),
	});
}
