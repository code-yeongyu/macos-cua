import { describe, expect, it, vi } from "vitest";
import type { AppState } from "../accessibility/types.js";
import type { AppStateOptions, ComputerCapabilities } from "../types/index.js";
import { clickElementByIndex, executePointerClick, getAppStateForApp } from "./actions.js";
import { createCaptureFrame } from "./capture-frame.js";
import type { ComputerInterface } from "./interface.js";

const CAPABILITIES: ComputerCapabilities = {
	supportsScreenshot: true,
	supportsInput: true,
	supportsAccessibility: true,
	supportsClipboard: true,
};

function createAppState(): AppState {
	return {
		app: "Finder",
		bundleId: "com.apple.finder",
		pid: 1234,
		frontmost: true,
		axAvailable: true,
		elements: [
			{
				id: 5,
				role: "AXButton",
				label: "Open",
				value: null,
				frame: { x: 10, y: 20, width: 100, height: 64 },
				actions: ["AXPress"],
				children: [],
			},
		],
		captureFrame: createCaptureFrame({
			captureId: "capture-1",
			capturedAt: "2026-06-18T00:00:00.000Z",
			displayEpoch: "display-1",
			target: { pid: 1234, bundleId: "com.apple.finder", appName: "Finder" },
			windowBounds: { x: 0, y: 0, width: 200, height: 160 },
			screenshot: { width: 200, height: 160 },
			model: { width: 200, height: 160 },
			display: {
				logical: { x: 0, y: 0, width: 200, height: 160 },
				native: { width: 200, height: 160 },
				scaleFactor: 1,
			},
		}),
		screenshotBase64: "",
		screenshotWidth: 200,
		screenshotHeight: 160,
		screenshotMimeType: "image/png",
		display: { width: 200, height: 160, scaleFactor: 1 },
	};
}

function createComputer(): ComputerInterface {
	return {
		capabilities: CAPABILITIES,
		screenshot: vi.fn<ComputerInterface["screenshot"]>(),
		setTarget: vi.fn<ComputerInterface["setTarget"]>(),
		move: vi.fn<ComputerInterface["move"]>(),
		click: vi.fn<ComputerInterface["click"]>().mockResolvedValue(undefined),
		rightClick: vi.fn<ComputerInterface["rightClick"]>().mockResolvedValue(undefined),
		middleClick: vi.fn<ComputerInterface["middleClick"]>().mockResolvedValue(undefined),
		doubleClick: vi.fn<ComputerInterface["doubleClick"]>().mockResolvedValue(undefined),
		type: vi.fn<ComputerInterface["type"]>(),
		key: vi.fn<ComputerInterface["key"]>(),
		scroll: vi.fn<ComputerInterface["scroll"]>(),
		drag: vi.fn<ComputerInterface["drag"]>(),
		getCursorPosition: vi.fn<ComputerInterface["getCursorPosition"]>(),
		getScreenSize: vi.fn<ComputerInterface["getScreenSize"]>(),
		getAppState: vi.fn<ComputerInterface["getAppState"]>().mockResolvedValue(createAppState()),
		getScreenshotViewport: vi.fn<ComputerInterface["getScreenshotViewport"]>(),
		listApps: vi.fn<ComputerInterface["listApps"]>(),
		setValue: vi.fn<ComputerInterface["setValue"]>(),
		selectText: vi.fn<ComputerInterface["selectText"]>(),
		performAction: vi.fn<ComputerInterface["performAction"]>().mockResolvedValue(undefined),
		pressAtPosition: vi.fn<ComputerInterface["pressAtPosition"]>().mockResolvedValue(true),
		typeIntoFocused: vi.fn<ComputerInterface["typeIntoFocused"]>(),
		close: vi.fn<ComputerInterface["close"]>(),
	};
}

type FastAppStateComputer = ComputerInterface & {
	readonly getAppStateForApp: (app: string, options?: AppStateOptions) => Promise<AppState>;
};

function createFastComputer(): FastAppStateComputer {
	return {
		...createComputer(),
		getAppStateForApp: vi.fn<FastAppStateComputer["getAppStateForApp"]>().mockResolvedValue(createAppState()),
	};
}

describe("#given a computer with a native app-name state path #when get_app_state resolves an app #then it skips pid lookup", () => {
	it("delegates the app name directly without listing apps first", async () => {
		// given
		const computer = createFastComputer();
		const options = { settleMs: 0 } satisfies AppStateOptions;

		// when
		const state = await getAppStateForApp(computer, "Finder", options);

		// then
		expect(state.app).toBe("Finder");
		expect(computer.getAppStateForApp).toHaveBeenCalledWith("Finder", options);
		expect(computer.listApps).not.toHaveBeenCalled();
		expect(computer.getAppState).not.toHaveBeenCalled();
	});
});

describe("#given a generic computer #when get_app_state resolves an app #then it falls back through pid lookup", () => {
	it("keeps the existing listApps and getAppState flow", async () => {
		// given
		const computer = createComputer();
		vi.mocked(computer.listApps).mockResolvedValue([
			{ name: "Finder", bundleId: "com.apple.finder", pid: 1234, isRunning: true },
		]);
		const options = { settleMs: 0 } satisfies AppStateOptions;

		// when
		await getAppStateForApp(computer, "Finder", options);

		// then
		expect(computer.listApps).toHaveBeenCalledOnce();
		expect(computer.getAppState).toHaveBeenCalledWith(1234, options);
	});
});

describe("#given an element-index click #when AXPress succeeds #then it presses without coordinate fallback", () => {
	it("presses the element the requested number of times", async () => {
		// given
		const computer = createComputer();

		// when
		await clickElementByIndex(computer, 1234, 5, 3);

		// then
		expect(computer.performAction).toHaveBeenCalledTimes(3);
		expect(computer.performAction).toHaveBeenNthCalledWith(1, 1234, 5, "AXPress");
		expect(computer.performAction).toHaveBeenNthCalledWith(2, 1234, 5, "AXPress");
		expect(computer.performAction).toHaveBeenNthCalledWith(3, 1234, 5, "AXPress");
		expect(computer.getAppState).not.toHaveBeenCalled();
		expect(computer.pressAtPosition).not.toHaveBeenCalled();
		expect(computer.click).not.toHaveBeenCalled();
	});
});

describe("#given an element-index click #when AXPress fails #then the element frame center is used", () => {
	it("presses the resolved center through the targeted AX hit-test path for left clicks", async () => {
		// given
		const computer = createComputer();
		vi.mocked(computer.performAction).mockRejectedValue(new Error("AXPress failed"));

		// when
		await clickElementByIndex(computer, 1234, 5, 2);

		// then
		expect(computer.getAppState).toHaveBeenCalledWith(1234);
		expect(computer.pressAtPosition).toHaveBeenCalledTimes(2);
		expect(computer.pressAtPosition).toHaveBeenNthCalledWith(1, 1234, { x: 60, y: 52 });
		expect(computer.pressAtPosition).toHaveBeenNthCalledWith(2, 1234, { x: 60, y: 52 });
		expect(computer.setTarget).not.toHaveBeenCalled();
		expect(computer.click).not.toHaveBeenCalled();
	});

	it("falls back to targeted synthetic clicking when targeted AX hit-test fails", async () => {
		// given
		const computer = createComputer();
		vi.mocked(computer.performAction).mockRejectedValue(new Error("AXPress failed"));
		vi.mocked(computer.pressAtPosition).mockResolvedValue(false);

		// when
		await clickElementByIndex(computer, 1234, 5, 2);

		// then
		expect(computer.pressAtPosition).toHaveBeenCalledWith(1234, { x: 60, y: 52 });
		expect(computer.setTarget).toHaveBeenNthCalledWith(1, 1234);
		expect(computer.doubleClick).toHaveBeenCalledWith({ x: 60, y: 52 });
		expect(computer.setTarget).toHaveBeenLastCalledWith(undefined);
	});

	it("uses the targeted synthetic path directly for non-left clicks", async () => {
		// given
		const computer = createComputer();
		vi.mocked(computer.performAction).mockRejectedValue(new Error("AXPress failed"));

		// when
		await clickElementByIndex(computer, 1234, 5, 1, "right");

		// then
		expect(computer.pressAtPosition).not.toHaveBeenCalled();
		expect(computer.setTarget).toHaveBeenNthCalledWith(1, 1234);
		expect(computer.rightClick).toHaveBeenCalledWith({ x: 60, y: 52 });
		expect(computer.setTarget).toHaveBeenLastCalledWith(undefined);
	});

	it("does not click an arbitrary coordinate when the element id is missing", async () => {
		// given
		const computer = createComputer();
		vi.mocked(computer.performAction).mockRejectedValue(new Error("AXPress failed"));
		vi.mocked(computer.getAppState).mockResolvedValue({ ...createAppState(), elements: [] });

		// when / then
		await expect(clickElementByIndex(computer, 1234, 5, 1)).rejects.toThrow("Element index 5 not found in AX tree");
		expect(computer.pressAtPosition).not.toHaveBeenCalled();
		expect(computer.click).not.toHaveBeenCalled();
		expect(computer.setTarget).not.toHaveBeenCalled();
	});
});

describe("#given an element-index click fallback #when capture metadata is fresh #then coordinates are capture-aware", () => {
	it("#given AXPress fails #when falling back to a center coordinate #then the screen point is resolved from the capture frame", async () => {
		// given
		const computer = createComputer();
		const captureFrame = createCaptureFrame({
			captureId: "capture-1",
			capturedAt: "2026-06-18T00:00:00.000Z",
			displayEpoch: "display-1",
			target: { pid: 1234, bundleId: "com.apple.finder", appName: "Finder" },
			windowBounds: { x: 300, y: 100, width: 1000, height: 800 },
			screenshot: { width: 500, height: 400 },
			model: { width: 500, height: 400 },
			display: {
				logical: { x: 0, y: 0, width: 1728, height: 1117 },
				native: { width: 3456, height: 2234 },
				scaleFactor: 2,
			},
		});
		vi.mocked(computer.performAction).mockRejectedValue(new Error("AXPress failed"));
		vi.mocked(computer.getAppState).mockResolvedValue({ ...createAppState(), captureFrame });

		// when
		await clickElementByIndex(computer, 1234, 5, 1);

		// then
		expect(computer.pressAtPosition).toHaveBeenCalledWith(1234, { x: 420, y: 204 });
		expect(computer.click).not.toHaveBeenCalled();
	});
});

describe("#given a shared pointer click executor #when the action mutates UI #then result metadata is self-verifying", () => {
	it("#given post-action observation metadata #when click succeeds #then action id and post-action diff summary are returned", async () => {
		// given
		const computer = createComputer();
		vi.mocked(computer.getAppState).mockResolvedValue({
			...createAppState(),
			axChangeSummary: { added: 1, removed: 0, changed: 2 },
			observation: {
				app: { name: "Finder", bundleId: "com.apple.finder", pid: 1234, frontmost: true },
				ax: { available: true, elementCount: 3, changeSummary: { added: 1, removed: 0, changed: 2 } },
				capture: {
					captureId: "capture-2",
					capturedAt: "2026-06-18T00:00:01.000Z",
					displayEpoch: "display-1",
					model: { width: 200, height: 160 },
					screenshot: { width: 200, height: 160, mimeType: "image/png" },
					target: { name: "Finder", bundleId: "com.apple.finder", pid: 1234 },
				},
				display: {
					epoch: "display-1",
					logical: { x: 0, y: 0, width: 200, height: 160 },
					native: { width: 200, height: 160 },
					scaleFactor: 1,
				},
				freshness: { captureId: "capture-2", displayEpoch: "display-1", stale: false },
			},
		});

		// when
		const result = await executePointerClick(computer, {
			actionId: "todo-8-action",
			targetPid: 1234,
			target: { elementIndex: 5 },
		});

		// then
		expect(result).toEqual({
			actionId: "todo-8-action",
			method: "axPress",
			postAction: {
				captureId: "capture-2",
				displayEpoch: "display-1",
				axChangeSummary: { added: 1, removed: 0, changed: 2 },
				elementCount: 3,
			},
		});
	});
});
