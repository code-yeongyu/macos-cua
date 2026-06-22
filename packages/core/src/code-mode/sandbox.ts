import type { ComputerInterface } from "../computer/interface.js";
import { CodeModeError } from "./errors.js";
import { installSandboxGlobals, loadIsolatedVm, wrapCode } from "./sandbox-bootstrap.js";
import { withTimeout } from "./sandbox-errors.js";
import { SandboxRpcHost } from "./sandbox-rpc.js";
import type { IsolateLike, IsolatedVmModule, SandboxOptions, SandboxRunResult } from "./sandbox-types.js";
import type { ScreenshotStore } from "./screenshot-store.js";
import { transpileModelCode } from "./transpile.js";

const DEFAULT_MEMORY_MB = 128;
const DEFAULT_TIMEOUT_MS = 120_000;

export class CodeModeSandbox {
	private running = false;

	constructor(
		private readonly computer: ComputerInterface,
		private readonly store: ScreenshotStore,
		private readonly opts: SandboxOptions = {},
	) {}

	async run(tsCode: string): Promise<SandboxRunResult> {
		if (this.running) {
			throw new CodeModeError("COMPUTER_BUSY", "Code mode sandbox is already running");
		}
		this.running = true;
		try {
			const transpiled = await transpileModelCode(tsCode);
			if ("compileError" in transpiled) {
				throw new CodeModeError("COMPILE_ERROR", transpiled.compileError);
			}
			const ivm = await loadIsolatedVm();
			const isolate = new ivm.Isolate({ memoryLimit: this.opts.memoryMb ?? DEFAULT_MEMORY_MB });
			const disposer = new IsolateDisposer(isolate);
			const logs: string[] = [];
			const surfaced: string[] = [];
			const actions: string[] = [];
			try {
				const execution = this.execute(ivm, isolate, transpiled.js, logs, surfaced, actions);
				const result = await withTimeout(execution, this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, () =>
					disposer.dispose(),
				);
				return { logs, result, surfaced, actions };
			} finally {
				disposer.dispose();
			}
		} finally {
			this.running = false;
		}
	}

	private async execute(
		ivm: IsolatedVmModule,
		isolate: IsolateLike,
		jsCode: string,
		logs: string[],
		surfaced: string[],
		actions: string[],
	): Promise<unknown> {
		const rpcHost = new SandboxRpcHost(this.computer, this.store, actions);
		const context = await installSandboxGlobals(ivm, isolate, rpcHost.handler(), logs, surfaced);
		const script = await isolate.compileScript(wrapCode(jsCode), { filename: "code-mode-run.js" });
		return await script.run(context, {
			timeout: this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			promise: true,
			copy: true,
			release: true,
		});
	}
}

class IsolateDisposer {
	private disposed = false;

	constructor(private readonly isolate: IsolateLike) {}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.isolate.dispose();
	}
}
