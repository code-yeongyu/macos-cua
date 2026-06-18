export const ACTION_COMPLETED_HINT = "Call get_app_state to fetch the updated UI state.";

export function formatActionComplete(input: {
	readonly action?: string;
	readonly type?: string;
	readonly recoveryHint?: string;
}): string {
	return JSON.stringify({
		ok: true,
		code: "ACTION_COMPLETED",
		recoveryHint: input.recoveryHint ?? ACTION_COMPLETED_HINT,
		auditRef: null,
		...(input.action !== undefined ? { action: input.action } : {}),
		...(input.type !== undefined ? { type: input.type } : {}),
	});
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export function toJsonValue(value: unknown): JsonValue | undefined {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => toJsonValue(item) ?? null);
	}
	if (!isRecord(value)) {
		return undefined;
	}
	const result: Record<string, JsonValue> = {};
	for (const [key, item] of Object.entries(value)) {
		const converted = toJsonValue(item);
		if (converted !== undefined) {
			result[key] = converted;
		}
	}
	return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
