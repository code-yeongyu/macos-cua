import { describe, expect, it, vi } from "vitest";
import type { AppState } from "../accessibility/types.js";
import type { ComputerCapabilities } from "../types/index.js";
import { clickElementByIndex } from "./actions.js";
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
