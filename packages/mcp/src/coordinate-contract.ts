export const MCP_COORDINATE_CONTRACT =
	"Coordinates are screenshot pixels in the latest get_app_state screenshot frame, not CSS pixels or normalized fractions. Use capture metadata when present. After any coordinate error, call get_app_state for a fresh screenshot before retrying. Do not guess coordinates outside the visible frame.";

export const MCP_GET_APP_STATE_DESCRIPTION =
	"Start an app use session if needed, then get the state of the app's key window and return a screenshot and accessibility tree. Prefer element_index actions from the JSON tree, use zoom for small targets, and treat returned coordinates as screenshot pixels.";

export const MCP_CLICK_DESCRIPTION = `Click an element by element_index or screenshot pixels from the latest get_app_state result. Prefer element_index when possible; use zoom for small targets. ${MCP_COORDINATE_CONTRACT}`;

export const MCP_DRAG_DESCRIPTION = `Drag between screenshot pixels from the latest get_app_state result. ${MCP_COORDINATE_CONTRACT}`;
