export const ACTION_COMPLETED_CODE = "ACTION_COMPLETED";
export const ACTION_COMPLETED_HINT = "Call get_app_state to fetch the updated UI state.";

export type SurfaceJsonPrimitive = string | number | boolean | null;
export type SurfaceJsonValue =
	| SurfaceJsonPrimitive
	| readonly SurfaceJsonValue[]
	| { readonly [key: string]: SurfaceJsonValue };

export type SurfaceCaptureMetadata = {
	readonly surfaced?: readonly string[];
	readonly imageCount?: number;
	readonly captureId?: string;
	readonly displayEpoch?: string;
};

export type SurfaceActionPayload = {
	readonly ok: true;
	readonly code: typeof ACTION_COMPLETED_CODE;
	readonly recoveryHint: string;
	readonly auditRef: string | null;
	readonly action?: string;
	readonly type?: string;
	readonly capture?: SurfaceCaptureMetadata;
	readonly postAction?: SurfaceJsonValue;
	readonly result?: SurfaceJsonValue;
};

export type SurfaceErrorPayload = {
	readonly ok: false;
	readonly code: string;
	readonly message: string;
	readonly recoveryHint?: string;
	readonly auditRef?: string | null;
	readonly details?: SurfaceJsonValue;
};

export type SurfaceActionInput = {
	readonly action?: string;
	readonly type?: string;
	readonly recoveryHint?: string;
	readonly auditRef?: string | null;
	readonly capture?: SurfaceCaptureMetadata;
	readonly postAction?: SurfaceJsonValue;
	readonly result?: SurfaceJsonValue;
};

export function surfaceActionPayload(input: SurfaceActionInput = {}): SurfaceActionPayload {
	return {
		ok: true,
		code: ACTION_COMPLETED_CODE,
		recoveryHint: input.recoveryHint ?? ACTION_COMPLETED_HINT,
		auditRef: input.auditRef ?? null,
		...(input.action !== undefined ? { action: input.action } : {}),
		...(input.type !== undefined ? { type: input.type } : {}),
		...(input.capture !== undefined ? { capture: input.capture } : {}),
		...(input.postAction !== undefined ? { postAction: input.postAction } : {}),
		...(input.result !== undefined ? { result: input.result } : {}),
	};
}

export function formatSurfaceAction(input: SurfaceActionInput = {}): string {
	return JSON.stringify(surfaceActionPayload(input));
}

export function surfaceErrorPayload(error: unknown, fallbackCode = "ACTION_FAILED"): SurfaceErrorPayload {
	if (isRecord(error)) {
		const message = typeof error["message"] === "string" ? error["message"] : "Action failed";
		const code = typeof error["code"] === "string" ? error["code"] : fallbackCode;
		const recoveryHint = typeof error["recoveryHint"] === "string" ? error["recoveryHint"] : undefined;
		const details = toSurfaceJsonValue(error["details"]);
		return {
			ok: false,
			code,
			message,
			...(recoveryHint !== undefined ? { recoveryHint } : {}),
			...(details !== undefined ? { details } : {}),
		};
	}
	return { ok: false, code: fallbackCode, message: String(error) };
}

export function formatSurfaceError(error: unknown, fallbackCode = "ACTION_FAILED"): string {
	return JSON.stringify(surfaceErrorPayload(error, fallbackCode));
}

export function toSurfaceJsonValue(value: unknown): SurfaceJsonValue | undefined {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => toSurfaceJsonValue(item) ?? null);
	}
	if (!isRecord(value)) {
		return undefined;
	}
	const result: Record<string, SurfaceJsonValue> = {};
	for (const [key, item] of Object.entries(value)) {
		const converted = toSurfaceJsonValue(item);
		if (converted !== undefined) {
			result[key] = converted;
		}
	}
	return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
