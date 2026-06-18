export const ACTION_COMPLETED_HINT = "Call get_app_state to fetch the updated UI state.";

export function formatActionComplete(input: { readonly recoveryHint?: string } = {}): string {
	return JSON.stringify({
		ok: true,
		code: "ACTION_COMPLETED",
		recoveryHint: input.recoveryHint ?? ACTION_COMPLETED_HINT,
		auditRef: null,
	});
}

export function formatToolError(error: unknown, fallbackCode = "ACTION_FAILED"): string {
	if (error instanceof Error) {
		return JSON.stringify({
			ok: false,
			code: codeFrom(error, fallbackCode),
			message: error.message,
			...recoveryHintFrom(error),
		});
	}
	return JSON.stringify({ ok: false, code: fallbackCode, message: String(error) });
}

function codeFrom(error: Error, fallbackCode: string): string {
	if (!isRecord(error)) {
		return fallbackCode;
	}
	const code = error["code"];
	return typeof code === "string" ? code : fallbackCode;
}

function recoveryHintFrom(error: Error): { readonly recoveryHint?: string } {
	if (!isRecord(error)) {
		return {};
	}
	const recoveryHint = error["recoveryHint"];
	return typeof recoveryHint === "string" ? { recoveryHint } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
