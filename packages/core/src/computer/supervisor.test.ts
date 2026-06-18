import { describe, expect, it, vi } from "vitest";

import { createAuditEvent } from "./audit.js";
import {
	ComputerUseSupervisor,
	DEFAULT_HEARTBEAT_FRESHNESS_MS,
	DEFAULT_HEARTBEAT_INTERVAL_MS,
	createSoftwareKillSwitch,
} from "./supervisor.js";

describe("#given a live supervisor #when guarding a mutating action #then it allows the action and records audit context", () => {
	it("allows a ready fresh heartbeat and preserves the action audit fields", () => {
		// given
		const supervisor = new ComputerUseSupervisor({
			clock: () => 1_000,
			requiredListeners: ["software-kill-switch"],
		});
		supervisor.recordHeartbeat(1_000);
		createSoftwareKillSwitch(supervisor).markReady();

		// when
		supervisor.assertCanAct({ actionId: "act-1", action: "click" });
		const event = createAuditEvent({
			timestamp: "2026-06-18T00:00:00.000Z",
			actionId: "act-1",
			action: "click",
			target: { app: "Finder", pid: 4242 },
			status: "allowed",
			coordinateTarget: { x: 12, y: 34 },
			recoveryHint: "Continue.",
		});

		// then
		expect(event).toMatchObject({
			actionId: "act-1",
			action: "click",
			target: { app: "Finder", pid: 4242 },
			status: "allowed",
			coordinateTarget: { x: 12, y: 34 },
			recoveryHint: "Continue.",
		});
	});
});

describe("#given a stale heartbeat #when guarding a mutating action #then it rejects before the action runs", () => {
	it("throws a typed stale-heartbeat error and leaves the action untouched", () => {
		// given
		const action = vi.fn();
		const supervisor = new ComputerUseSupervisor({
			clock: () => 3_100,
			requiredListeners: ["software-kill-switch"],
		});
		supervisor.recordHeartbeat(1_000);
		createSoftwareKillSwitch(supervisor).markReady();

		// when / then
		expect(() => {
			supervisor.assertCanAct({ actionId: "act-2", action: "type" });
			action();
		}).toThrowError(
			expect.objectContaining({
				code: "SUPERVISOR_HEARTBEAT_STALE",
				recoveryHint: "Restart the supervisor heartbeat before sending input.",
			}),
		);
		expect(action).not.toHaveBeenCalled();
	});
});

describe("#given a suspended or killed supervisor #when guarding a mutating action #then it fails closed", () => {
	it("rejects while suspended", () => {
		// given
		const supervisor = new ComputerUseSupervisor({
			clock: () => 1_000,
			requiredListeners: ["software-kill-switch"],
		});
		supervisor.recordHeartbeat(1_000);
		createSoftwareKillSwitch(supervisor).markReady();
		supervisor.suspend("operator pause");

		// when / then
		expect(() => supervisor.assertCanAct({ actionId: "act-3", action: "scroll" })).toThrowError(
			expect.objectContaining({
				code: "SUPERVISOR_SUSPENDED",
				recoveryHint: "Resume the supervisor before sending input.",
			}),
		);
	});

	it("rejects after the software kill switch is triggered", () => {
		// given
		const supervisor = new ComputerUseSupervisor({
			clock: () => 1_000,
			requiredListeners: ["software-kill-switch"],
		});
		supervisor.recordHeartbeat(1_000);
		const killSwitch = createSoftwareKillSwitch(supervisor);
		killSwitch.markReady();

		// when
		killSwitch.kill("operator stop");

		// then
		expect(() => supervisor.assertCanAct({ actionId: "act-4", action: "click" })).toThrowError(
			expect.objectContaining({
				code: "SUPERVISOR_KILLED",
				recoveryHint: "Create a new supervisor session before sending input.",
			}),
		);
	});
});

describe("#given required listener readiness #when a listener is missing #then mutating actions fail closed", () => {
	it("rejects until the software kill switch listener is marked ready", () => {
		// given
		const supervisor = new ComputerUseSupervisor({
			clock: () => 1_000,
			requiredListeners: ["software-kill-switch"],
		});
		supervisor.recordHeartbeat(1_000);

		// when / then
		expect(() => supervisor.assertCanAct({ actionId: "act-5", action: "drag" })).toThrowError(
			expect.objectContaining({
				code: "SUPERVISOR_LISTENER_NOT_READY",
				recoveryHint: "Wait for required supervisor listeners before sending input.",
			}),
		);
	});
});

describe("#given the default heartbeat contract #when reading constants #then the defaults are fail-closed", () => {
	it("keeps heartbeat interval at or below 500ms and freshness at or below 2000ms", () => {
		expect(DEFAULT_HEARTBEAT_INTERVAL_MS).toBeLessThanOrEqual(500);
		expect(DEFAULT_HEARTBEAT_FRESHNESS_MS).toBeLessThanOrEqual(2_000);
		expect(DEFAULT_HEARTBEAT_INTERVAL_MS).toBe(500);
		expect(DEFAULT_HEARTBEAT_FRESHNESS_MS).toBe(2_000);
	});
});
