import { describe, expect, it } from "vitest";

const describeIsolateDeps = process.env.SKIP_ISOLATE_TESTS ? describe.skip : describe;

describeIsolateDeps("code-mode dependency loading", () => {
	it("#given code-mode deps #when importing isolated-vm dynamically #then Isolate is constructable", async () => {
		const isolatedVm = await import("isolated-vm");

		expect(typeof isolatedVm.Isolate).toBe("function");
	});
});
