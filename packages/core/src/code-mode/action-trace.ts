import type { CodeModeAppTarget } from "./api-surface.js";
import type { ParsedHostCall } from "./sandbox-types.js";

export function formatActionTrace(call: ParsedHostCall): string {
	switch (call.method) {
		case "screenshot":
			return "mac.screenshot()";
		case "openApp":
			return `mac.openApp(${quote(call.appName)})`;
		case "getAppState":
			return call.app === undefined ? "mac.getAppState()" : `mac.getAppState(${formatAppTarget(call.app)})`;
		case "listApps":
			return "mac.listApps()";
		case "click":
			return `mac.click(${formatAppTarget(call.app)})`;
		case "doubleClick":
			return `mac.doubleClick(${formatAppTarget(call.app)})`;
		case "rightClick":
			return `mac.rightClick(${formatAppTarget(call.app)})`;
		case "move":
			return `mac.move(${formatAppTarget(call.app)})`;
		case "drag":
			return `mac.drag(${formatAppTarget(call.app)})`;
		case "scroll":
			return `mac.scroll(${formatAppTarget(call.app)})`;
		case "type":
			return `mac.type(${formatAppTarget(call.app)}, <text>)`;
		case "pressKeys":
			return `mac.pressKeys(${formatAppTarget(call.app)})`;
		case "setValue":
			return `mac.setValue(${formatAppTarget(call.app)}, #${call.elementIndex})`;
		case "selectText":
			return `mac.selectText(${formatAppTarget(call.app)}, #${call.elementIndex})`;
		case "performAction":
			return `mac.performAction(${formatAppTarget(call.app)}, ${quote(call.action)})`;
		case "getCursorPosition":
			return "mac.getCursorPosition()";
		default:
			return assertNever(call);
	}
}

function formatAppTarget(app: CodeModeAppTarget): string {
	return typeof app === "number" ? String(app) : quote(app);
}

function quote(value: string): string {
	return JSON.stringify(value);
}

function assertNever(value: never): never {
	throw new Error(`Unhandled code-mode action trace: ${JSON.stringify(value)}`);
}
