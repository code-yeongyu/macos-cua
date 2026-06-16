import { CodeModeError } from "./errors.js";
import { formatLog, isRecord, readHandleId } from "./sandbox-errors.js";
import type { HostFunction, IsolatedVmModule } from "./sandbox-types.js";

type ExternalCopyConstructor = new (
	value: unknown,
) => {
	copyInto(options: { readonly release: true }): unknown;
};

export async function loadIsolatedVm(): Promise<IsolatedVmModule> {
	const loaded = await import("isolated-vm");
	const module = unwrapIsolatedVmModule(loaded);
	if (module === undefined) {
		throw new CodeModeError("CODE_MODE_UNAVAILABLE", "isolated-vm did not expose Isolate and Reference");
	}
	return module;
}

export async function installSandboxGlobals(
	ivm: IsolatedVmModule,
	isolate: { createContext(): Promise<{ readonly global: { set(name: string, value: unknown): Promise<void> } }> },
	rpcHandler: HostFunction,
	logs: string[],
	surfaced: string[],
): Promise<{ readonly global: { set(name: string, value: unknown): Promise<void> } }> {
	const context = await isolate.createContext();
	const rpcBridge: HostFunction = async (...args) => copyIntoSandbox(ivm, await rpcHandler(...args));
	await context.global.set("__codeModeRpc", new ivm.Reference(rpcBridge));
	await context.global.set(
		"__codeModeConsole",
		new ivm.Reference((args: unknown) => {
			logs.push(formatLog(Array.isArray(args) ? args : []));
		}),
	);
	await context.global.set(
		"__codeModeSurface",
		new ivm.Reference((handle: unknown) => {
			surfaced.push(readHandleId(handle));
		}),
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
	{ arguments: { copy: true } },
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
		{ arguments: { copy: true } },
	),
};
globalThis.surface = (handle) => globalThis.__codeModeSurface.applySyncPromise(
	undefined,
	[handle],
	{ arguments: { copy: true } },
);
(async () => {
${jsCode}
})();
`;
}

function isIsolatedVmModule(value: unknown): value is IsolatedVmModule {
	return isRecord(value) && typeof value["Isolate"] === "function" && typeof value["Reference"] === "function";
}

function unwrapIsolatedVmModule(value: unknown): IsolatedVmModule | undefined {
	if (isIsolatedVmModule(value)) {
		return value;
	}
	if (!isRecord(value)) {
		return undefined;
	}
	const defaultExport = value["default"];
	return isIsolatedVmModule(defaultExport) ? defaultExport : undefined;
}

function copyIntoSandbox(ivm: IsolatedVmModule, value: unknown): unknown {
	const copyable = toSandboxCopyValue(value);
	const ivmValue: unknown = ivm;
	if (!isRecord(ivmValue) || !("ExternalCopy" in ivmValue)) {
		return copyable;
	}
	const externalCopy = ivmValue["ExternalCopy"];
	if (!isExternalCopyConstructor(externalCopy)) {
		return copyable;
	}
	return new externalCopy(copyable).copyInto({ release: true });
}

function isExternalCopyConstructor(value: unknown): value is ExternalCopyConstructor {
	return typeof value === "function";
}

function toSandboxCopyValue(value: unknown): unknown {
	if (typeof value === "function") {
		return undefined;
	}
	if (Array.isArray(value)) {
		return value.map(toSandboxCopyValue);
	}
	if (!isRecord(value)) {
		return value;
	}
	const copy: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item !== "function") {
			copy[key] = toSandboxCopyValue(item);
		}
	}
	return copy;
}
