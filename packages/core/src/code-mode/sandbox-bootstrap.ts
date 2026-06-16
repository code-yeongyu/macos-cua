import { CodeModeError } from "./errors.js";
import { formatLog, isRecord, readHandleId } from "./sandbox-errors.js";
import type { HostFunction, IsolatedVmModule } from "./sandbox-types.js";

export async function loadIsolatedVm(): Promise<IsolatedVmModule> {
	const loaded = await import("isolated-vm");
	if (!isIsolatedVmModule(loaded)) {
		throw new CodeModeError("CODE_MODE_UNAVAILABLE", "isolated-vm did not expose Isolate and Reference");
	}
	return loaded;
}

export async function installSandboxGlobals(
	ivm: IsolatedVmModule,
	isolate: { createContext(): Promise<{ readonly global: { set(name: string, value: unknown): Promise<void> } }> },
	rpcHandler: HostFunction,
	logs: string[],
	surfaced: string[],
): Promise<{ readonly global: { set(name: string, value: unknown): Promise<void> } }> {
	const context = await isolate.createContext();
	await context.global.set("__codeModeRpc", new ivm.Reference(rpcHandler));
	await context.global.set(
		"__codeModeConsole",
		new ivm.Reference((args: unknown) => logs.push(formatLog(Array.isArray(args) ? args : []))),
	);
	await context.global.set(
		"__codeModeSurface",
		new ivm.Reference((handle: unknown) => surfaced.push(readHandleId(handle))),
	);
	return context;
}

export function wrapCode(jsCode: string): string {
	return `
const __codeModeUnwrap = (envelope) => {
	if (envelope && typeof envelope.then === "function") {
		return envelope.then(__codeModeUnwrap);
	}
	if (envelope && envelope.ok === true) {
		return envelope.value;
	}
	const errorInfo = envelope && envelope.error ? envelope.error : { name: "Error", message: "Host RPC failed" };
	const error = new Error(String(errorInfo.message));
	error.name = String(errorInfo.name || "Error");
	if (errorInfo.code !== undefined) {
		error.code = String(errorInfo.code);
	}
	throw error;
};
const __codeModeInvoke = (method, args) => __codeModeUnwrap(globalThis.__codeModeRpc.applySyncPromise(
	undefined,
	[method, args],
	{ arguments: { copy: true }, result: { copy: true } },
));
globalThis.mac = new Proxy({}, {
	get(_target, property) {
		if (typeof property !== "string") {
			return undefined;
		}
		return (...args) => __codeModeInvoke(property, args);
	},
});
globalThis.console = {
	log: (...args) => globalThis.__codeModeConsole.applySyncPromise(
		undefined,
		[args],
		{ arguments: { copy: true }, result: { copy: true } },
	),
};
globalThis.surface = (handle) => globalThis.__codeModeSurface.applySyncPromise(
	undefined,
	[handle],
	{ arguments: { copy: true }, result: { copy: true } },
);
(async () => {
${jsCode}
})();
`;
}

function isIsolatedVmModule(value: unknown): value is IsolatedVmModule {
	return isRecord(value) && typeof value["Isolate"] === "function" && typeof value["Reference"] === "function";
}
