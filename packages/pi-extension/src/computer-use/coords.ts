import { supportsAnthropicNativeComputerUse } from "../anthropic-payload.js";

const DEFAULT_SCREENSHOT_BYTE_BUDGET = 5 * 1024 * 1024;
const DEFAULT_ESTIMATED_BYTES_PER_PIXEL = 2;
const ANTHROPIC_NATIVE_MAX_LONG_EDGE = 1024;

type CoordinateErrorOptions = {
	readonly details?: CoordinateErrorDetails;
};
type CoordinateErrorCode = "STALE_CAPTURE" | "OUT_OF_BOUNDS_COORDINATE";
type CoordinateErrorDetails = Readonly<Record<string, string | number | boolean | null>>;
type CoordinateContext = {
	readonly action?: string;
};
export type CaptureFreshnessMarker = {
	readonly captureId: string;
	readonly displayEpoch: string;
};

export class CoordinateValidationError extends Error {
	override readonly name = "ComputerUseError";
	readonly code: CoordinateErrorCode;
	readonly recoveryHint: string;
	readonly details: CoordinateErrorDetails | undefined;

	constructor(code: CoordinateErrorCode, message: string, options: CoordinateErrorOptions = {}) {
		super(message);
		this.code = code;
		this.recoveryHint =
			code === "STALE_CAPTURE"
				? "Call get_app_state or capture a fresh screenshot before retrying within the latest frame."
				: "Capture a fresh screenshot. Call get_app_state, then retry within the latest frame.";
		this.details = options.details;
	}
}

export type DisplayProfile = {
	readonly maxLongEdge?: number;
	readonly byteBudget?: number;
	readonly estimatedBytesPerPixel?: number;
};

export interface DisplayConfig {
	/** Logical screen width in points (e.g. 2560 on a 16" MBP). */
	readonly logicalWidth: number;
	/** Logical screen height in points. */
	readonly logicalHeight: number;
	/** Width sent to the model after provider caps and byte-budget policy. */
	readonly modelWidth: number;
	/** Height sent to the model after provider caps and byte-budget policy. */
	readonly modelHeight: number;
	readonly captureId?: string;
	readonly displayEpoch?: string;
}

export function displayProfileForModel(api: string | undefined, modelId: string | undefined): DisplayProfile {
	if (api === "anthropic-messages" && supportsAnthropicNativeComputerUse(modelId)) {
		return { maxLongEdge: ANTHROPIC_NATIVE_MAX_LONG_EDGE, byteBudget: DEFAULT_SCREENSHOT_BYTE_BUDGET };
	}
	return { byteBudget: DEFAULT_SCREENSHOT_BYTE_BUDGET };
}

export function resolveDisplayConfig(
	screenSize: { readonly width: number; readonly height: number },
	profile: DisplayProfile = { byteBudget: DEFAULT_SCREENSHOT_BYTE_BUDGET },
): DisplayConfig {
	const logicalWidth = assertPositiveFiniteDimension(screenSize.width, "width");
	const logicalHeight = assertPositiveFiniteDimension(screenSize.height, "height");
	const maxLongEdge =
		profile.maxLongEdge === undefined ? undefined : assertPositiveFiniteDimension(profile.maxLongEdge, "maxLongEdge");
	const byteBudget = assertPositiveFiniteDimension(profile.byteBudget ?? DEFAULT_SCREENSHOT_BYTE_BUDGET, "byteBudget");
	const estimatedBytesPerPixel = assertPositiveFiniteNumber(
		profile.estimatedBytesPerPixel ?? DEFAULT_ESTIMATED_BYTES_PER_PIXEL,
		"estimatedBytesPerPixel",
	);
	const logicalLongEdge = Math.max(logicalWidth, logicalHeight);
	const logicalPixels = logicalWidth * logicalHeight;
	const budgetScale = Math.min(1, Math.sqrt(byteBudget / estimatedBytesPerPixel / logicalPixels));
	const hardCapScale = maxLongEdge === undefined ? 1 : Math.min(1, maxLongEdge / logicalLongEdge);
	const scale = Math.min(budgetScale, hardCapScale);
	if (scale >= 1) {
		return { logicalWidth, logicalHeight, modelWidth: logicalWidth, modelHeight: logicalHeight };
	}

	return {
		logicalWidth,
		logicalHeight,
		modelWidth: Math.max(1, Math.floor(logicalWidth * scale)),
		modelHeight: Math.max(1, Math.floor(logicalHeight * scale)),
	};
}

export function unscaleCoord(
	point: { readonly x: number; readonly y: number },
	display: DisplayConfig,
	freshness?: CaptureFreshnessMarker,
	context: CoordinateContext = {},
): { x: number; y: number } {
	assertFreshDisplay(display, freshness, context);
	assertPointInsideModel(point, display, context);
	return {
		x: Math.round(point.x * (display.logicalWidth / display.modelWidth)),
		y: Math.round(point.y * (display.logicalHeight / display.modelHeight)),
	};
}

function assertFreshDisplay(
	display: DisplayConfig,
	freshness: CaptureFreshnessMarker | undefined,
	context: CoordinateContext,
): void {
	if (freshness === undefined || display.captureId === undefined || display.displayEpoch === undefined) {
		return;
	}
	if (display.captureId !== freshness.captureId || display.displayEpoch !== freshness.displayEpoch) {
		throw new CoordinateValidationError(
			"STALE_CAPTURE",
			`${actionPrefix(context)}uses stale capture metadata: latest captureId ${display.captureId}, displayEpoch ${display.displayEpoch}; received captureId ${freshness.captureId}, displayEpoch ${freshness.displayEpoch}. Capture a fresh screenshot before retrying within the latest frame.`,
			{
				details: {
					...(context.action === undefined ? {} : { action: context.action }),
					captureId: display.captureId,
					expectedCaptureId: freshness.captureId,
					displayEpoch: display.displayEpoch,
					expectedDisplayEpoch: freshness.displayEpoch,
				},
			},
		);
	}
}

function assertPointInsideModel(
	point: { readonly x: number; readonly y: number },
	display: DisplayConfig,
	context: CoordinateContext,
): void {
	if (
		!Number.isFinite(point.x) ||
		!Number.isFinite(point.y) ||
		point.x < 0 ||
		point.y < 0 ||
		point.x > display.modelWidth ||
		point.y > display.modelHeight
	) {
		throw new CoordinateValidationError(
			"OUT_OF_BOUNDS_COORDINATE",
			`${actionPrefix(context)}coordinate received (${point.x}, ${point.y}) is outside the latest screenshot frame; valid x range [0, ${display.modelWidth}] and y range [0, ${display.modelHeight}]. Capture a fresh screenshot before retrying within the latest frame.`,
			{
				details: {
					...(context.action === undefined ? {} : { action: context.action }),
					x: Number.isFinite(point.x) ? point.x : String(point.x),
					y: Number.isFinite(point.y) ? point.y : String(point.y),
					width: display.modelWidth,
					height: display.modelHeight,
				},
			},
		);
	}
}

function actionPrefix(context: CoordinateContext): string {
	return context.action === undefined ? "" : `${context.action} `;
}

function assertPositiveFiniteDimension(value: number, name: string): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${name} must be a positive finite number`);
	}
	return Math.round(value);
}

function assertPositiveFiniteNumber(value: number, name: string): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${name} must be a positive finite number`);
	}
	return value;
}
