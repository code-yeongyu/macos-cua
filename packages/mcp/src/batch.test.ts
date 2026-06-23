import { describe, expect, it, vi } from "vitest";

import { executeDiscreteBatch } from "./batch.js";
import { actionComplete } from "./tool-result.js";

describe("#given MCP batch executor contract #when actions run #then generic semantics are shared", () => {
	it("#given registered handlers #when executing a batch #then it runs actions in order", async () => {
		const order: string[] = [];

		const result = await executeDiscreteBatch({
			actions: [{ action: "get_app_state" }, { action: "click" }],
			executeAction: async (action) => {
				order.push(action.action);
				return actionComplete();
			},
		});

		expect(order).toEqual(["get_app_state", "click"]);
		expect(result.details).toMatchObject({
			ok: true,
			type: "batch",
			actionCount: 2,
			steps: [
				{ index: 0, action: "get_app_state", status: "success" },
				{ index: 1, action: "click", status: "success" },
			],
		});
	});

	it("#given a failing step #when executing a batch #then it stops on first failure", async () => {
		const executeAction = vi.fn(async (action: { readonly action: string }) => {
			if (action.action === "click") {
				throw new Error("outside latest screenshot bounds");
			}
			return actionComplete();
		});

		const result = await executeDiscreteBatch({
			actions: [{ action: "get_app_state" }, { action: "click" }, { action: "type_text" }],
			executeAction,
		});

		expect(executeAction).toHaveBeenCalledTimes(2);
		expect(result.details).toMatchObject({
			ok: false,
			type: "batch",
			actionCount: 3,
			failedStep: 1,
			steps: [
				{ index: 0, action: "get_app_state", status: "success" },
				{ index: 1, action: "click", status: "error", message: "outside latest screenshot bounds" },
			],
		});
	});
});
