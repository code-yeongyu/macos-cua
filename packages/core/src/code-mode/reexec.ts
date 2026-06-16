import { spawnSync } from "node:child_process";

const NODE_SNAPSHOT_FLAG = "--no-node-snapshot";
const REEXEC_SENTINEL = "MACOS_CUA_NODE_SNAPSHOT_REEXEC";

export function isNodeSnapshotFlagPresent(): boolean {
	return process.execArgv.includes(NODE_SNAPSHOT_FLAG);
}

export function ensureNodeSnapshotFlag(): boolean {
	if (isNodeSnapshotFlagPresent()) {
		return true;
	}

	if (process.env[REEXEC_SENTINEL] !== undefined) {
		return false;
	}

	const entrypoint = process.argv[1];
	const childArgv =
		entrypoint === undefined ? [NODE_SNAPSHOT_FLAG] : [NODE_SNAPSHOT_FLAG, entrypoint, ...process.argv.slice(2)];
	const result = spawnSync(process.execPath, childArgv, {
		env: {
			...process.env,
			[REEXEC_SENTINEL]: "1",
		},
		stdio: "inherit",
	});
	process.exit(result.status ?? 0);
}
