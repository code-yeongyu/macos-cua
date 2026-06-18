import { supportsAnthropicNativeComputerUse } from "../anthropic-payload.js";

const MAX_MODEL_LONG_EDGE = 1280;
const ANTHROPIC_NATIVE_MAX_LONG_EDGE = 1024;

type CoordinateErrorOptions = {
	readonly details?: CoordinateErrorDetails;
};
type CoordinateErrorCode = "STALE_CAPTURE" | "OUT_OF_BOUNDS_COORDINATE";
type CoordinateErrorDetails = Readonly<Record<string, string | number | boolean | null>>;
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
				? "Please refresh the capture and retry the action against the newest frame."
				: "Choose a point inside the capture frame before retrying.";
		this.details = options.details;
	}
}

export type DisplayProfile = {
	readonly maxLongEdge: number;
};

export interface DisplayConfig {
	/** Logical screen width in points (e.g. 2560 on a 16" MBP). */
	readonly logicalWidth: number;
	/** Logical screen height in points. */
	readonly logicalHeight: number;
	/** Resolution sent to the model (e.g. 1280). */
	readonly modelWidth: number;
	/** Resolution sent to the model (e.g. 720). */
	readonly modelHeight: number;
	readonly captureId?: string;
	readonly displayEpoch?: string;
}

export function displayProfileForModel(api: string | undefined, modelId: string | undefined): DisplayProfile {
	if (api === "anthropic-messages" && supportsAnthropicNativeComputerUse(modelId)) {
		return { maxLongEdge: ANTHROPIC_NATIVE_MAX_LONG_EDGE };
	}
	return { maxLongEdge: MAX_MODEL_LONG_EDGE };
}

export function resolveDisplayConfig(
	screenSize: { readonly width: number; readonly height: number },
	profile: DisplayProfile = { maxLongEdge: MAX_MODEL_LONG_EDGE },
): DisplayConfig {
	const logicalWidth = assertPositiveFiniteDimension(screenSize.width, "width");
	const logicalHeight = assertPositiveFiniteDimension(screenSize.height, "height");
	const maxLongEdge = assertPositiveFiniteDimension(profile.maxLongEdge, "maxLongEdge");
	const logicalLongEdge = Math.max(logicalWidth, logicalHeight);
	if (logicalLongEdge <= maxLongEdge) {
		return { logicalWidth, logicalHeight, modelWidth: logicalWidth, modelHeight: logicalHeight };
	}

	const scale = maxLongEdge / logicalLongEdge;
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
): { x: number; y: number } {
	assertFreshDisplay(display, freshness);
	assertPointInsideModel(point, display);
	return {
		x: Math.round(point.x * (display.logicalWidth / display.modelWidth)),
		y: Math.round(point.y * (display.logicalHeight / display.modelHeight)),
	};
}

function assertFreshDisplay(display: DisplayConfig, freshness: CaptureFreshnessMarker | undefined): void {
	if (freshness === undefined || display.captureId === undefined || display.displayEpoch === undefined) {
		return;
	}
	if (display.captureId !== freshness.captureId || display.displayEpoch !== freshness.displayEpoch) {
		throw new CoordinateValidationError(
			"STALE_CAPTURE",
			`Capture ${display.captureId} is stale for display epoch ${freshness.displayEpoch}`,
			{
				details: {
					captureId: display.captureId,
					expectedCaptureId: freshness.captureId,
					displayEpoch: display.displayEpoch,
					expectedDisplayEpoch: freshness.displayEpoch,
				},
			},
		);
	}
}

function assertPointInsideModel(point: { readonly x: number; readonly y: number }, display: DisplayConfig): void {
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
			`Point (${point.x}, ${point.y}) is outside capture frame ${display.modelWidth}x${display.modelHeight}`,
			{
				details: {
					x: Number.isFinite(point.x) ? point.x : String(point.x),
					y: Number.isFinite(point.y) ? point.y : String(point.y),
					width: display.modelWidth,
					height: display.modelHeight,
				},
			},
		);
	}
}

function assertPositiveFiniteDimension(value: number, name: string): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${name} must be a positive finite number`);
	}
	return Math.round(value);
}
