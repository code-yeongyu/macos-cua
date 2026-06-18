export const CODE_MODE_ERROR_CODES = [
	"HANDLE_STALE",
	"SCREENSHOT_HANDLE_STALE",
	"COMPUTER_BUSY",
	"CODE_MODE_UNAVAILABLE",
	"COMPILE_ERROR",
	"RUN_TIMEOUT",
] as const;

export type CodeModeErrorCode = (typeof CODE_MODE_ERROR_CODES)[number];

export class CodeModeError extends Error {
	readonly code: CodeModeErrorCode;

	constructor(code: CodeModeErrorCode, message: string) {
		super(message);
		this.name = "CodeModeError";
		this.code = code;
	}
}
