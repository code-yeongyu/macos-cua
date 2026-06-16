import { supportsAnthropicNativeComputerUse } from "../anthropic-payload.js";

const MAX_MODEL_LONG_EDGE = 1280;
const ANTHROPIC_NATIVE_MAX_LONG_EDGE = 1024;

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
): { x: number; y: number } {
	return {
		x: Math.round(point.x * (display.logicalWidth / display.modelWidth)),
		y: Math.round(point.y * (display.logicalHeight / display.modelHeight)),
	};
}

function assertPositiveFiniteDimension(value: number, name: string): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${name} must be a positive finite number`);
	}
	return Math.round(value);
}
