export const COMPUTER_USE_ERROR_CODES = [
	"STALE_CAPTURE",
	"OUT_OF_BOUNDS_COORDINATE",
	"MISSING_TARGET_WINDOW",
	"UNAPPROVED_APP",
	"BLOCKED_URL",
	"SUPERVISOR_NOT_LIVE",
	"PERMISSION_DENIED",
	"UNSUPPORTED_ACTION",
] as const;

export type ComputerUseErrorCode = (typeof COMPUTER_USE_ERROR_CODES)[number];

export type ComputerUseErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

type ComputerUseErrorOptions = {
	readonly recoveryHint?: string;
	readonly details?: ComputerUseErrorDetails;
	readonly cause?: unknown;
};

const RECOVERY_HINTS: Record<ComputerUseErrorCode, string> = {
	STALE_CAPTURE: "Call get_app_state or capture a fresh screenshot before retrying within the latest frame.",
	OUT_OF_BOUNDS_COORDINATE: "Capture a fresh screenshot. Call get_app_state, then retry within the latest frame.",
	MISSING_TARGET_WINDOW: "Bring the target window onscreen, refresh app state, and retry.",
	UNAPPROVED_APP: "Approve the target app for Computer Use before retrying.",
	BLOCKED_URL: "Navigate to an allowed URL or ask the supervisor to approve this destination.",
	SUPERVISOR_NOT_LIVE: "Reconnect the supervisor session before issuing Computer Use actions.",
	PERMISSION_DENIED: "Grant the required macOS permission and retry after the permission state refreshes.",
	UNSUPPORTED_ACTION: "Use a supported Computer Use action for this target.",
};

export class ComputerUseError extends Error {
	override readonly name = "ComputerUseError";
	readonly code: ComputerUseErrorCode;
	readonly recoveryHint: string;
	readonly details: ComputerUseErrorDetails | undefined;

	constructor(code: ComputerUseErrorCode, message: string, options: ComputerUseErrorOptions = {}) {
		super(message, errorOptions(options.cause));
		this.code = code;
		this.recoveryHint = options.recoveryHint ?? RECOVERY_HINTS[code];
		this.details = options.details;
	}
}

function errorOptions(cause: unknown): ErrorOptions | undefined {
	return cause === undefined ? undefined : { cause };
}
