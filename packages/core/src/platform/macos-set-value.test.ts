import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditEvent } from "../computer/audit.js";
import { ComputerUseSupervisor, createSoftwareKillSwitch } from "../computer/supervisor.js";

const accessibilityMock = vi.hoisted(() => ({
	extractAccessibilityTree: vi.fn(),
	performActionByIndex: vi.fn(),
	setValueByIndex: vi.fn(),
}));

const inputControllerMock = vi.hoisted(() => {
	class MockMacOSInputController {
		readonly setTarget = vi.fn();
		readonly click = vi.fn<(position: { x: number; y: number }) => Promise<void>>().mockResolvedValue(undefined);
		readonly pressKey = vi
			.fn<
				(key: string, options?: { modifiers?: Array<"command" | "option" | "control" | "shift"> }) => Promise<void>
			>()
			.mockResolvedValue(undefined);
		readonly typeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
		readonly close = vi.fn();
	}

	const instances: MockMacOSInputController[] = [];
	return {
		instances,
		MacOSInputController: class extends MockMacOSInputController {
			constructor() {
				super();
				instances.push(this);
			}
		},
	};
});

vi.mock("./macos-ffi/accessibility.js", () => accessibilityMock);
vi.mock("./macos-input.js", () => ({
	MacOSInputController: inputControllerMock.MacOSInputController,
}));

import { MacOSHostComputer } from "./macos.js";

beforeEach(() => {
	accessibilityMock.extractAccessibilityTree.mockReset();
	accessibilityMock.performActionByIndex.mockReset();
	accessibilityMock.setValueByIndex.mockReset();
	inputControllerMock.instances.length = 0;
});

function firstInputController(): (typeof inputControllerMock.instances)[number] {
	const controller = inputControllerMock.instances[0];
	if (controller === undefined) {
		throw new Error("expected MacOSInputController instance");
	}
	return controller;
}

interface RecordedAuditSink {
	readonly events: AuditEvent[];
	append(event: AuditEvent): Promise<void>;
}

function createRecordedAuditSink(): RecordedAuditSink {
	const events: AuditEvent[] = [];
	return {
		events,
		append: async (event) => {
			events.push(event);
		},
	};
}

function createSupervisor(clock: () => number): ComputerUseSupervisor {
	const supervisor = new ComputerUseSupervisor({
		clock,
		requiredListeners: ["software-kill-switch"],
	});
	supervisor.recordHeartbeat(1_000);
	createSoftwareKillSwitch(supervisor).markReady();
	return supervisor;
}

describe("#given MacOSHostComputer.setValue #when called #then it writes through accessibility only", () => {
	it("calls setValueByIndex with the requested value", async () => {
		// given
		const computer = new MacOSHostComputer();

		// when
		await computer.setValue(1234, 7, "updated");

		// then
		expect(accessibilityMock.setValueByIndex).toHaveBeenCalledWith(1234, 7, "updated");
	});

	it("never falls back to synthetic keyboard input that would hijack the user", async () => {
		// given
		const computer = new MacOSHostComputer();

		// when
		await computer.setValue(1234, 7, "updated");

		// then
		const input = firstInputController();
		expect(input.click).not.toHaveBeenCalled();
		expect(input.pressKey).not.toHaveBeenCalled();
		expect(input.typeText).not.toHaveBeenCalled();
		expect(input.setTarget).not.toHaveBeenCalled();
	});

	it("#given a stale supervisor #when setValue is called #then AX value side effects are blocked and audited", async () => {
		// given
		const auditSink = createRecordedAuditSink();
		const supervisor = createSupervisor(() => 3_100);
		const computer = new MacOSHostComputer({ supervisor, auditSink });

		// when/then
		await expect(computer.setValue(1234, 7, "updated")).rejects.toThrow("Computer Use supervisor heartbeat is stale");
		expect(accessibilityMock.setValueByIndex).not.toHaveBeenCalled();
		expect(auditSink.events).toEqual([
			expect.objectContaining({
				action: "setValue",
				status: "failed",
				errorCode: "SUPERVISOR_HEARTBEAT_STALE",
				elementTarget: { pid: 1234, elementIndex: 7 },
				axValue: "updated",
			}),
		]);
	});
});
