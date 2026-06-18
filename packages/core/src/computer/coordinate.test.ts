import { describe, expect, it } from "vitest";

import type { AppInfo, AppState } from "../accessibility/types.js";
import type {
	AppStateOptions,
	DragOptions,
	KeyOptions,
	Point,
	ScreenshotOptions,
	ScrollOptions,
	SelectTextOptions,
} from "../types/index.js";
import { createCaptureFrame } from "./capture-frame.js";
import { resolveScreenPoint } from "./coordinate.js";
import { ComputerUseError } from "./errors.js";
import type { ComputerInterface, ScreenshotResult } from "./interface.js";
import type { ScreenshotViewport } from "./viewport.js";

class CoordinateComputer implements ComputerInterface {
	readonly capabilities = {
		supportsAccessibility: true,
		supportsClipboard: true,
		supportsInput: true,
		supportsScreenshot: true,
	};

	constructor(private readonly viewport: ScreenshotViewport | undefined) {}

	async getScreenshotViewport(_targetPid: number): Promise<ScreenshotViewport | undefined> {
		return this.viewport;
	}

	async screenshot(_options?: ScreenshotOptions): Promise<ScreenshotResult> {
		return { data: Buffer.from("screen"), mimeType: "image/png", width: 10, height: 10 };
	}
	setTarget(_pid?: number): void {}
	async move(_position: Point): Promise<void> {}
	async click(_position: Point): Promise<void> {}
	async rightClick(_position: Point): Promise<void> {}
	async middleClick(_position: Point): Promise<void> {}
	async doubleClick(_position: Point): Promise<void> {}
	async type(_text: string): Promise<void> {}
	async key(_key: string, _options?: KeyOptions): Promise<void> {}
	async scroll(_options: ScrollOptions): Promise<void> {}
	async drag(_options: DragOptions): Promise<void> {}
	async getCursorPosition(): Promise<Point> {
		return { x: 0, y: 0 };
	}
	async getScreenSize(): Promise<{ width: number; height: number }> {
		return { width: 1728, height: 1117 };
	}
	async getAppState(_targetPid?: number, _options?: AppStateOptions): Promise<AppState> {
		throw new Error("Not implemented");
	}
	async listApps(): Promise<AppInfo[]> {
		return [];
	}
	async setValue(_targetPid: number, _elementIndex: number, _value: string): Promise<void> {}
	async selectText(_targetPid: number, _elementIndex: number, _options: SelectTextOptions): Promise<void> {}
	async performAction(_targetPid: number, _elementIndex: number, _action: string): Promise<void> {}
	async pressAtPosition(_targetPid: number, _position: Point): Promise<boolean> {
		return false;
	}
	async typeIntoFocused(_targetPid: number, _text: string): Promise<boolean> {
		return false;
	}
	async close(): Promise<void> {}
}

const CAPTURE_FRAME = createCaptureFrame({
	captureId: "capture-1",
	capturedAt: "2026-06-18T00:00:00.000Z",
	displayEpoch: "display-1",
	target: { pid: 321, bundleId: "com.apple.finder", appName: "Finder" },
	windowBounds: { x: 300, y: 150, width: 1000, height: 800 },
	screenshot: { width: 1000, height: 800 },
	model: { width: 500, height: 400 },
	display: {
		logical: { x: 0, y: 0, width: 1728, height: 1117 },
		native: { width: 3456, height: 2234 },
		scaleFactor: 2,
	},
});

describe("#given a capture frame #when resolving a model coordinate #then it maps through the fresh frame", () => {
	it("#given a fresh capture marker #when point is resolved #then it returns the screen point", async () => {
		const computer = new CoordinateComputer(CAPTURE_FRAME);

		const point = await resolveScreenPoint(computer, 321, {
			x: 250,
			y: 200,
			captureId: "capture-1",
			displayEpoch: "display-1",
		});

		expect(point).toEqual({ x: 800, y: 550 });
	});
});

describe("#given no capture frame #when resolving a model coordinate #then it rejects instead of passing through", () => {
	it("#given the target has no viewport #when point is resolved #then missing target window is reported", async () => {
		const computer = new CoordinateComputer(undefined);

		await expect(resolveScreenPoint(computer, 321, { x: 10, y: 20 })).rejects.toThrowError(
			expect.objectContaining({
				name: "ComputerUseError",
				code: "MISSING_TARGET_WINDOW",
				recoveryHint: expect.stringContaining("target window"),
			}),
		);
	});
});

describe("#given a stale capture marker #when resolving a model coordinate #then it rejects stale state", () => {
	it("#given the display epoch changed #when point is resolved #then stale capture is reported", async () => {
		const computer = new CoordinateComputer(CAPTURE_FRAME);

		await expect(
			resolveScreenPoint(computer, 321, { x: 250, y: 200, captureId: "capture-1", displayEpoch: "display-2" }),
		).rejects.toThrowError(
			expect.objectContaining({
				name: "ComputerUseError",
				code: "STALE_CAPTURE",
				recoveryHint: expect.stringContaining("refresh the capture"),
			}),
		);
	});
});

describe("#given a stale screenshot handle #when read by code-mode storage #then it remains distinct from stale capture", () => {
	it("#given a coordinate rejection #when checking its error class #then it is a ComputerUseError", async () => {
		const computer = new CoordinateComputer(CAPTURE_FRAME);

		await expect(
			resolveScreenPoint(computer, 321, { x: 250, y: 200, captureId: "capture-2", displayEpoch: "display-1" }),
		).rejects.toBeInstanceOf(ComputerUseError);
	});
});
