import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const vitestPath = "./node_modules/vitest/vitest.mjs";
const testPath = "packages/core/test-isolate/sandbox.real.test.ts";

if (!existsSync(resolve(repoRoot, vitestPath))) {
	process.stderr.write(`Vitest runner not found at ${resolve(repoRoot, vitestPath)}\n`);
	process.exit(1);
}

const configDir = mkdtempSync(resolve(tmpdir(), "macos-cua-isolate-"));
const configPath = resolve(configDir, "vitest.config.mjs");
writeFileSync(
	configPath,
	`export default { test: { globals: true, environment: "node", include: ["${testPath}"], exclude: ["**/node_modules/**", "**/dist/**"] } };\n`,
);

const result = spawnSync(
	process.execPath,
	["--no-node-snapshot", vitestPath, "run", testPath, "--config", configPath],
	{
		cwd: repoRoot,
		stdio: "inherit",
		env: process.env,
	},
);
rmSync(configDir, { recursive: true, force: true });

if (result.error !== undefined) {
	process.stderr.write(`${result.error.message}\n`);
	process.exit(1);
}

process.exit(result.status ?? 1);
