export type LogValue = string | number | boolean | null | readonly LogValue[] | { readonly [k: string]: LogValue };

const REDACT_STRING_LENGTH = 256;
const DEBUG_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

export function createDebugLog(scope: string): (event: string, fields: Readonly<Record<string, LogValue>>) => void {
	return (event, fields) => {
		if (!isDebugEnabled()) {
			return;
		}

		const payload: Record<string, LogValue> = {
			scope: redactLogValue(scope),
			event: redactLogValue(event),
		};

		for (const [key, value] of Object.entries(fields)) {
			payload[key] = redactLogValue(value);
		}

		process.stderr.write(`${JSON.stringify(payload)}\n`);
	};
}

function isDebugEnabled(): boolean {
	const value = process.env["MACOS_CUA_DEBUG"];
	return value !== undefined && DEBUG_ENV_VALUES.has(value.trim().toLowerCase());
}

function redactLogValue(value: LogValue): LogValue {
	if (typeof value === "string") {
		return value.length > REDACT_STRING_LENGTH ? `<redacted len=${value.length}>` : value;
	}

	if (Array.isArray(value)) {
		return value.map((item) => redactLogValue(item));
	}

	if (value !== null && typeof value === "object") {
		const redacted: Record<string, LogValue> = {};
		for (const [key, nestedValue] of Object.entries(value)) {
			redacted[key] = redactLogValue(nestedValue);
		}
		return redacted;
	}

	return value;
}
