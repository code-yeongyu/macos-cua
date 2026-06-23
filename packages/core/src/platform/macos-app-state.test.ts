import { describe, expect, it } from "vitest";
import { AppApprovalStore } from "../permission/app-approval.js";
import { TARGET_PID, accessibilityMock, childProcessMock, fakePng } from "./macos-app-state.test-support.js";
import { MacOSHostComputer } from "./macos.js";

describe("#given two get_app_state calls #when the second runs #then it reports an AX change summary", () => {
	it("omits the summary on the first call and includes it on the second", async () => {
		childProcessMock.execFile.mockReset();
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
			callback(
				null,
				JSON.stringify([{ name: "Finder", bundleId: "com.apple.finder", pid: TARGET_PID, isActive: true }]),
				"",
			);
		});
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
			callback(null, fakePng(1280, 800), "");
		});
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
			callback(null, fakePng(1280, 800), "");
		});
		const computer = new MacOSHostComputer();

		const first = await computer.getAppState(TARGET_PID, { settleMs: 0 });
		const second = await computer.getAppState(TARGET_PID, { settleMs: 0 });

		expect(first.axChangeSummary).toBeUndefined();
		expect(second.axChangeSummary).toEqual({ added: 0, removed: 0, changed: 0 });
	});
});

describe("#given an app-approval store #when an app is not approved #then get_app_state is refused until approved", () => {
	it("refuses an unapproved app and proceeds once approved for the session", async () => {
		const appsJson = JSON.stringify([
			{ name: "Finder", bundleId: "com.apple.finder", pid: TARGET_PID, isActive: true },
		]);
		childProcessMock.execFile.mockReset();
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) =>
			callback(null, appsJson, ""),
		);
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) =>
			callback(null, fakePng(1280, 800), ""),
		);
		const approval = new AppApprovalStore();
		const computer = new MacOSHostComputer({ appApproval: approval });

		await expect(computer.getAppState(TARGET_PID, { settleMs: 0 })).rejects.toThrow(/needs your approval/);

		approval.approveForSession("com.apple.finder");
		const state = await computer.getAppState(TARGET_PID, { settleMs: 0 });
		expect(state.app).toBe("Finder");
	});
});

describe("#given a URL blocklist #when a browser is on a blocked URL #then get_app_state is refused", () => {
	it("refuses Safari on a blocklisted URL", async () => {
		childProcessMock.execFile.mockReset();
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) =>
			callback(
				null,
				JSON.stringify([{ name: "Safari", bundleId: "com.apple.Safari", pid: TARGET_PID, isActive: true }]),
				"",
			),
		);
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) =>
			callback(null, "https://banking.example.com/login\n", ""),
		);
		const computer = new MacOSHostComputer({ urlBlocklist: ["*banking*"] });

		await expect(computer.getAppState(TARGET_PID, { settleMs: 0 })).rejects.toThrow(
			/not allowed on the current browser URL/,
		);
	});
});

describe("#given a noisy accessibility tree #when get_app_state runs #then non-descriptive nodes are pruned", () => {
	it("drops AXUnknown noise while keeping descriptive elements", async () => {
		accessibilityMock.extractAccessibilityTree.mockReturnValue({
			axAvailable: true,
			elements: [
				{
					id: 5,
					role: "AXButton",
					label: "Open",
					value: null,
					frame: { x: 800, y: 550, width: 200, height: 160 },
					actions: ["AXPress"],
					children: [],
				},
				{
					id: 6,
					role: "AXUnknown",
					label: null,
					value: null,
					frame: { x: 0, y: 0, width: 0, height: 0 },
					actions: [],
					children: [],
				},
			],
		});
		const computer = new MacOSHostComputer();

		const state = await computer.getAppState(TARGET_PID, { settleMs: 0 });

		expect(state.elements.map((element) => element.id)).toEqual([5]);
	});
});

describe("#given a known app #when get_app_state runs #then it includes the app-specific instruction playbook", () => {
	it("attaches Clock instructions for com.apple.clock", async () => {
		childProcessMock.execFile.mockReset();
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
			callback(
				null,
				JSON.stringify([{ name: "Clock", bundleId: "com.apple.clock", pid: TARGET_PID, isActive: true }]),
				"",
			);
		});
		childProcessMock.execFile.mockImplementationOnce((_file, _args, _options, callback) => {
			callback(null, fakePng(1280, 800), "");
		});
		const computer = new MacOSHostComputer();

		const state = await computer.getAppState(TARGET_PID, { settleMs: 0 });

		expect(state.appInstructions).toContain("World Clock");
	});
});

describe("#given a Retina display #when get_app_state runs #then it reports display geometry and backing scale", () => {
	it("includes the logical display size and scale factor", async () => {
		const computer = new MacOSHostComputer();

		const state = await computer.getAppState(TARGET_PID, { settleMs: 0 });

		expect(state.display).toEqual({ width: 1920, height: 1080, scaleFactor: 2 });
	});
});
