export const COORDINATE_RECOVERY_CONTRACT =
	"Coordinates are screenshot pixels in the latest screenshot frame, not CSS pixels or normalized fractions. Use capture metadata when present. After any coordinate error, get a fresh screenshot with get_app_state before retrying. Do not guess coordinates outside the visible frame.";

export const SEMANTIC_FIRST_CONTRACT =
	"Start with get_app_state, prefer click element_index=<number> when possible, and use zoom for small targets before coordinate clicks.";

export const CLICK_TOOL_DESCRIPTION = `Click an element by index or screenshot pixels from the latest get_app_state screenshot. ${SEMANTIC_FIRST_CONTRACT} ${COORDINATE_RECOVERY_CONTRACT} Do not use shell, AppleScript, JXA, or Swift workarounds for this click tool.`;

export const DRAG_TOOL_DESCRIPTION = `Drag between screenshot pixels from the latest get_app_state screenshot. ${COORDINATE_RECOVERY_CONTRACT}`;

export const GET_APP_STATE_TOOL_DESCRIPTION = `Use first when controlling an app with click, type_text, press_keys, scroll, drag, set_value, select_text, or perform_secondary_action. Starts an app session if needed and returns the key-window screenshot plus accessibility tree; numbered boxes are element_index values from the JSON tree. ${SEMANTIC_FIRST_CONTRACT} ${COORDINATE_RECOVERY_CONTRACT}`;

export const ZOOM_TOOL_DESCRIPTION = `Capture a high-resolution crop of a get_app_state element_index or screenshot-pixel region, with numbered element_index labels inside the crop. ${SEMANTIC_FIRST_CONTRACT} ${COORDINATE_RECOVERY_CONTRACT}`;
