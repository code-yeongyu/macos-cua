import type { DisplayInfo } from "../accessibility/types.js";
import type { Size } from "../types/index.js";
import type { MacOSAppStateTargetWindow } from "./macos-desktop-session-types.js";

export function macOSDesktopSessionSignature(
	pid: number,
	window: MacOSAppStateTargetWindow,
	display: DisplayInfo,
): string {
	const windowId = window.id === undefined ? "region" : String(window.id);
	const bounds = window.bounds;
	return `${pid}:${windowId}:${bounds.x},${bounds.y},${bounds.width},${bounds.height}:${macOSDisplayEpoch(display)}`;
}

export function macOSDisplayEpoch(display: DisplayInfo): string {
	return `${display.width}x${display.height}@${display.scaleFactor}`;
}

export function macOSNativeDisplaySize(display: DisplayInfo): Size {
	return {
		height: Math.round(display.height * display.scaleFactor),
		width: Math.round(display.width * display.scaleFactor),
	};
}
