export type * from "./accessibility/types.js";
export { modelFacingAppState } from "./accessibility/model-facing-app-state.js";
export { splitAppState, type SplitAppStateResult } from "./code-mode/app-state-split.js";
export { CodeModeSandbox } from "./code-mode/sandbox.js";
export { ScreenshotStore, type ScreenshotHandle } from "./code-mode/screenshot-store.js";
export { assembleRunResult, type CodeModeRunResult } from "./code-mode/result.js";
export { CodeModeError, type CodeModeErrorCode } from "./code-mode/errors.js";
export { buildCodeModePrompt } from "./code-mode/transpile.js";
export { ensureNodeSnapshotFlag, isNodeSnapshotFlagPresent } from "./code-mode/reexec.js";
export {
	AX_PRESS_ACTION,
	axScrollActionFor,
	clickElementByIndex,
	clickPoint,
	executePointerClick,
	getAppStateForApp,
	parseElementIndex,
	parseKeyChord,
	pressElement,
	resolveAppPid,
	resolvePointForElement,
	scrollElement,
	withTargetedApp,
	type ComputerUseMouseButton,
	type ExecutePointerClickInput,
	type PointerActionPostObservation,
	type PointerActionResult,
	type PointerClickTarget,
} from "./computer/actions.js";
export {
	executeDiscreteBatch,
	type DiscreteBatchAction,
	type DiscreteBatchContent,
	type DiscreteBatchDetails,
	type DiscreteBatchExecutionResult,
	type DiscreteBatchExecutorOptions,
	type DiscreteBatchResult,
	type DiscreteBatchStepDetails,
	type DiscreteBatchTextContent,
} from "./computer/batch.js";
export {
	executeScrollAction,
	type ExecuteScrollInput,
	type ScrollDirection,
} from "./computer/scroll-action.js";
export { executeTypeTextAction, type ExecuteTypeTextInput } from "./computer/type-text-action.js";
export {
	createCaptureFrame,
	createCaptureFrameTransform,
	screenshotMetadataForCaptureFrame,
	type CaptureFrame,
	type CaptureFrameCursor,
	type CaptureFrameDisplay,
	type CaptureFrameInput,
	type CaptureFrameTarget,
	type CaptureFrameTransform,
	type CaptureFreshnessMarker,
	type ScreenshotCoordinateMetadata,
	type ScreenshotCoordinateMetadataInput,
	type ScreenshotDowngradeStatus,
	captureFrameToViewport,
} from "./computer/capture-frame.js";
export { resolveScreenPoint } from "./computer/coordinate.js";
export { ComputerUseError, type ComputerUseErrorCode, type ComputerUseErrorDetails } from "./computer/errors.js";
export { pressKeySequence, type KeySequenceEntry, type KeySequenceOptions } from "./computer/key-sequence.js";
export {
	type SelectionMode,
	type SelectionRange,
	type SelectionRangeInput,
	resolveSelectionRange,
} from "./computer/select-text.js";
export type { ComputerInterface, ScreenshotResult } from "./computer/interface.js";
export {
	DEFAULT_SCREENSHOT_BYTE_BUDGET,
	MAX_SCREENSHOT_LONG_EDGE,
	type ScreenshotFidelityPolicy,
	type ScreenshotViewport,
	resolveAdaptiveWindowScreenshotSize,
	resolveWindowScreenshotSize,
	screenRectToScreenshot,
	screenshotPointToScreen,
} from "./computer/viewport.js";
export { type AppApprovalDecision, AppApprovalStore } from "./permission/app-approval.js";
export { type LockScreenMonitorCallbacks, LockScreenMonitor } from "./platform/lock-screen-monitor.js";
export {
	type PassiveMemoryConfig,
	type PassiveMemoryContext,
	shouldRecord,
} from "./passive-memory/exclusion-policy.js";
export {
	type SegmentSink,
	PassiveMemorySegmentWriter,
	fileSegmentSink,
} from "./passive-memory/segment-writer.js";
export { createDebugLog, type LogValue } from "./log/debug-log.js";
export {
	ACTION_COMPLETED_CODE,
	ACTION_COMPLETED_HINT,
	formatSurfaceAction,
	formatSurfaceError,
	surfaceActionPayload,
	surfaceErrorPayload,
	toSurfaceJsonValue,
	type SurfaceActionInput,
	type SurfaceActionPayload,
	type SurfaceCaptureMetadata,
	type SurfaceErrorPayload,
	type SurfaceJsonPrimitive,
	type SurfaceJsonValue,
} from "./surface-vocabulary.js";
export type { PermissionInterface, PermissionKind, PermissionStatus } from "./permission/interface.js";
export { MacOSPermissions } from "./permission/macos.js";
export { CloudComputer, type CloudComputerOptions } from "./platform/cloud.js";
export { HostComputer, type HostComputerOptions } from "./platform/host.js";
export { MacOSHostComputer, type MacOSHostComputerOptions } from "./platform/macos.js";
export { VMComputer, type VMComputerOptions } from "./platform/vm.js";
export type {
	ComputerCapabilities,
	DragOptions,
	AppStateOptions,
	KeyOptions,
	Point,
	Rect,
	ScreenshotOptions,
	ScrollOptions,
	SelectTextOptions,
	Size,
} from "./types/index.js";
export type { WindowInfo, WindowInterface } from "./window/interface.js";
export { MacOSWindows } from "./window/macos.js";
