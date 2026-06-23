export {
	executeNativeComputerAction,
	type ComputerActionDriver,
	type ComputerUseResult,
} from "./anthropic-computer-action.js";
export { ComputerUseError, toComputerUseExecutionError } from "./anthropic-computer-error.js";
export {
	ANTHROPIC_COMPUTER_USE_BETA,
	ANTHROPIC_NATIVE_COMPUTER_TOOL_NAME,
	ANTHROPIC_NATIVE_COMPUTER_TOOL_TYPE,
	addAnthropicComputerUseToPayload,
	anthropicComputerToolSchema,
	computerToolSchema,
	mergeBetaHeader,
	sanitizeTools,
	supportsAnthropicNativeComputerUse,
} from "./anthropic-payload.js";
export type { ComputerToolInput } from "./anthropic-payload.js";
import { COORDINATE_RECOVERY_CONTRACT, SEMANTIC_FIRST_CONTRACT } from "./coordinate-contract.js";

export function buildCodexComputerUseSection(): string {
	return `## Computer Use\nCall \`get_app_state\` each turn. Its screenshot numbered boxes are element_index labels; prefer \`click element_index=<number>\` when possible. Use \`zoom\` for small targets before clicking. ${SEMANTIC_FIRST_CONTRACT} ${COORDINATE_RECOVERY_CONTRACT} Use Codex tools (\`click\`, \`set_value\`, \`perform_secondary_action\`, \`scroll\`, \`zoom\`, \`type_text\`, \`press_keys\`) for macOS control. Actions return {ok:true}.\n`;
}

export function buildComputerUseSection(width: number, height: number): string {
	return `## Computer Use\nCall \`get_app_state\` each turn. Its screenshot numbered boxes are element_index labels; prefer \`click element_index=<number>\` when possible. Use \`zoom\` for small targets before clicking. ${SEMANTIC_FIRST_CONTRACT} ${COORDINATE_RECOVERY_CONTRACT} Use \`computer\` for mouse/keyboard (${width}x${height}); AX: \`set_value\`, \`perform_secondary_action\`. Actions return {ok:true}.\n`;
}
