import { describe, expect, it } from "vitest";

import {
	TARGET_PID,
	accessibilityMock,
	createRecordedAuditSink,
	createSupervisor,
} from "./macos-app-state.test-support.js";
import { MacOSHostComputer } from "./macos.js";

describe("#given MacOSHostComputer AX mutators #when the supervisor is stale #then side effects are blocked and audited", () => {
	it("prevents setValue before Accessibility mutation", async () => {
		const auditSink = createRecordedAuditSink();
		const supervisor = createSupervisor(() => 3_100);
		const computer = new MacOSHostComputer({ supervisor, auditSink });

		await expect(computer.setValue(TARGET_PID, 5, "private")).rejects.toThrow(
			"Computer Use supervisor heartbeat is stale",
		);
		expect(accessibilityMock.setValueByIndex).not.toHaveBeenCalled();
		expect(auditSink.events).toEqual([
			expect.objectContaining({
				action: "setValue",
				status: "failed",
				errorCode: "SUPERVISOR_HEARTBEAT_STALE",
				elementTarget: { pid: TARGET_PID, elementIndex: 5 },
				axValue: "private",
			}),
		]);
	});
});

describe("#given MacOSHostComputer AX mutators #when the supervisor is live #then side effects run and audit succeeds", () => {
	it("permits performAction after the gate", async () => {
		const auditSink = createRecordedAuditSink();
		const supervisor = createSupervisor(() => 1_000);
		const computer = new MacOSHostComputer({ supervisor, auditSink });

		await computer.performAction(TARGET_PID, 5, "AXPress");

		expect(accessibilityMock.performActionByIndex).toHaveBeenCalledWith(TARGET_PID, 5, "AXPress");
		expect(auditSink.events).toEqual([
			expect.objectContaining({
				action: "performAction",
				status: "succeeded",
				elementTarget: { pid: TARGET_PID, elementIndex: 5 },
			}),
		]);
	});
});
