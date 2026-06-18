import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDebugLog } from "../log/debug-log.js";
import type { Rect } from "../types/index.js";
import { execFileStdout, execFileStdoutBuffer } from "./exec-util.js";
import { parseImageDimensions, parsePngDimensions } from "./image-format.js";
import { captureDisplayRectPng, captureMainDisplayPng } from "./macos-ffi/screenshot.js";

const execFileAsync = promisify(execFile);

const FINDER_DESKTOP_BOUNDS_TIMEOUT_MILLISECONDS = 2_000;
const SYSTEM_PROFILER_TIMEOUT_MILLISECONDS = 10_000;
const SCREENSHOT_TIMEOUT_MILLISECONDS = 10_000;
const SCREENSHOT_MAX_BUFFER_BYTES = 100 * 1024 * 1024;
const debugCapture = createDebugLog("capture");

export async function getMacOSLogicalScreenSize(): Promise<{ width: number; height: number }> {
	const finderSize = await getFinderDesktopBounds().catch(() => undefined);
	if (finderSize !== undefined) {
		return finderSize;
	}

	const result = await execFileAsync("system_profiler", ["SPDisplaysDataType"], {
		encoding: "utf8",
		timeout: SYSTEM_PROFILER_TIMEOUT_MILLISECONDS,
	});
	const stdout = execFileStdout(result);
	const systemProfilerSize = parseSystemProfilerLogicalScreenSize(stdout);
	if (systemProfilerSize === undefined) {
		throw new Error("Failed to parse logical screen size from system_profiler output");
	}
	return systemProfilerSize;
}

export async function captureMacOSScreenshot(
	targetSize: {
		readonly width: number;
		readonly height: number;
	},
	windowId?: number,
	format: "png" | "jpeg" = "png",
	quality = 72,
	region?: Rect,
): Promise<Buffer> {
	if (!Number.isSafeInteger(targetSize.width) || !Number.isSafeInteger(targetSize.height)) {
		throw new Error("requested screenshot dimensions must be integers");
	}
	if (targetSize.width <= 0 || targetSize.height <= 0) {
		throw new Error("requested screenshot dimensions must be positive");
	}
	if (windowId !== undefined && (!Number.isSafeInteger(windowId) || windowId <= 0)) {
		throw new Error("windowId must be a positive integer");
	}

	if (region !== undefined) {
		const captured = captureDisplayRectPng(region, Math.max(targetSize.width, targetSize.height));
		const dimensions = parsePngDimensions(captured.data);
		debugCapture("region_screenshot", {
			requestedX: region.x,
			requestedY: region.y,
			requestedWidth: region.width,
			requestedHeight: region.height,
			outputWidth: dimensions.width,
			outputHeight: dimensions.height,
		});
		return captured.data;
	}

	if (windowId === undefined) {
		const captured = captureMainDisplayPng(targetSize.width, targetSize.height);
		parsePngDimensions(captured.data);
		return captured.data;
	}

	return captureWindowScreenshotViaCli(targetSize, windowId, format, quality);
}

export function targetSizeFromRegion(region: Rect): { width: number; height: number } {
	if (
		!Number.isFinite(region.x) ||
		!Number.isFinite(region.y) ||
		!Number.isFinite(region.width) ||
		!Number.isFinite(region.height)
	) {
		throw new Error("screenshot region requires finite coordinates and dimensions");
	}
	if (region.width <= 0 || region.height <= 0) {
		throw new Error(`screenshot region requires positive dimensions, got ${region.width}x${region.height}`);
	}
	return {
		width: Math.max(1, Math.ceil(region.width)),
		height: Math.max(1, Math.ceil(region.height)),
	};
}

async function captureWindowScreenshotViaCli(
	targetSize: { readonly width: number; readonly height: number },
	windowId: number,
	format: "png" | "jpeg",
	quality: number,
): Promise<Buffer> {
	const captureCommand = `screencapture -x -o -l ${windowId} -t png "$tmp"`;
	const resizeCommand =
		format === "jpeg"
			? 'sips -s format jpeg -s formatOptions "$4" -z "$2" "$1" "$tmp" --out "$out" >/dev/null'
			: 'sips -z "$2" "$1" "$tmp" --out "$out" >/dev/null';
	const script = [
		"set -eu",
		'tmp=$(mktemp "${TMPDIR:-/tmp}/macos-cua-shot.XXXXXX")',
		'out=""',
		'cleanup() { rm -f "$tmp"; if [ -n "$out" ]; then rm -f "$out"; fi; }',
		"trap cleanup EXIT",
		captureCommand,
		'out=$(mktemp "${TMPDIR:-/tmp}/macos-cua-shot-resized.XXXXXX")',
		resizeCommand,
		'cat "$out"',
	].join("\n");
	const result = await execFileAsync(
		"sh",
		[
			"-c",
			script,
			"macos-cua-screenshot",
			String(targetSize.width),
			String(targetSize.height),
			format,
			String(Math.max(1, Math.min(100, Math.round(quality)))),
		],
		{
			encoding: "buffer",
			maxBuffer: SCREENSHOT_MAX_BUFFER_BYTES,
			timeout: SCREENSHOT_TIMEOUT_MILLISECONDS,
		},
	);
	const data = execFileStdoutBuffer(result);
	parseImageDimensions(data);
	return data;
}

async function getFinderDesktopBounds(): Promise<{ width: number; height: number }> {
	const result = await execFileAsync(
		"osascript",
		["-e", 'tell application "Finder" to get bounds of window of desktop'],
		{
			encoding: "utf8",
			timeout: FINDER_DESKTOP_BOUNDS_TIMEOUT_MILLISECONDS,
		},
	);
	const bounds = parseFinderDesktopBounds(execFileStdout(result));
	if (bounds === undefined) {
		throw new Error("Failed to parse Finder desktop bounds");
	}
	return bounds;
}

export function parseFinderDesktopBounds(output: string): { width: number; height: number } | undefined {
	const match = output.match(
		/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/,
	);
	if (match === null) {
		return undefined;
	}
	const left = finiteNumber(match[1]);
	const top = finiteNumber(match[2]);
	const right = finiteNumber(match[3]);
	const bottom = finiteNumber(match[4]);
	if (left === undefined || top === undefined || right === undefined || bottom === undefined) {
		return undefined;
	}
	return positiveSize(right - left, bottom - top);
}

export function parseSystemProfilerLogicalScreenSize(output: string): { width: number; height: number } | undefined {
	const uiLooksLike = parseFirstSize(output, /UI Looks like:\s*(\d+)\s*[x×]\s*(\d+)/i);
	if (uiLooksLike !== undefined) {
		return uiLooksLike;
	}

	const resolutionLines = output
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => /^Resolution:/i.test(line));
	for (const line of resolutionLines) {
		if (/Retina/i.test(line)) {
			continue;
		}
		const size = parseFirstSize(line, /(\d+)\s*[x×]\s*(\d+)/);
		if (size !== undefined) {
			return size;
		}
	}

	for (const line of resolutionLines) {
		const sizes = Array.from(line.matchAll(/(\d+)\s*[x×]\s*(\d+)/g), sizeFromMatch).filter(
			(size) => size !== undefined,
		);
		const smallestSize = smallestScreenSize(sizes);
		if (smallestSize === undefined) {
			continue;
		}
		return sizes.length > 1 ? smallestSize : retinaLogicalFallback(smallestSize);
	}

	return undefined;
}

function parseFirstSize(output: string, expression: RegExp): { width: number; height: number } | undefined {
	const match = output.match(expression);
	if (match === null) {
		return undefined;
	}
	return sizeFromMatch(match);
}

function sizeFromMatch(match: RegExpMatchArray): { width: number; height: number } | undefined {
	const width = positiveNumber(match[1]);
	const height = positiveNumber(match[2]);
	if (width === undefined || height === undefined) {
		return undefined;
	}
	return { width: Math.round(width), height: Math.round(height) };
}

function positiveNumber(value: string | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	const numberValue = Number(value);
	return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function finiteNumber(value: string | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : undefined;
}

function positiveSize(width: number, height: number): { width: number; height: number } | undefined {
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return undefined;
	}
	return { width: Math.round(width), height: Math.round(height) };
}

function smallestScreenSize(
	sizes: ReadonlyArray<{ readonly width: number; readonly height: number }>,
): { width: number; height: number } | undefined {
	let smallest: { width: number; height: number } | undefined;
	for (const size of sizes) {
		if (smallest === undefined || size.width * size.height < smallest.width * smallest.height) {
			smallest = { width: size.width, height: size.height };
		}
	}
	return smallest;
}

function retinaLogicalFallback(size: { readonly width: number; readonly height: number }): {
	width: number;
	height: number;
} {
	if (size.width % 2 === 0 && size.height % 2 === 0) {
		return { width: size.width / 2, height: size.height / 2 };
	}
	return { width: size.width, height: size.height };
}
