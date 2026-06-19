import type { ComputerUseActionGateOptions } from "../computer/action-gate.js";
import type { AppApprovalStore } from "../permission/app-approval.js";
import type { HostComputerOptions } from "./host.js";
import type { PointerOverlay } from "./macos-ffi/cursor-overlay.js";

export interface MacOSHostComputerOptions extends HostComputerOptions {
	defaultTargetPid?: number;
	overlay?: PointerOverlay;
	appApproval?: AppApprovalStore;
	urlBlocklist?: readonly string[];
	supervisor?: ComputerUseActionGateOptions["supervisor"];
	auditSink?: ComputerUseActionGateOptions["auditSink"];
	now?: ComputerUseActionGateOptions["now"];
	nextActionId?: ComputerUseActionGateOptions["nextActionId"];
}
