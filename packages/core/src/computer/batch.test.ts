import { describe, expect, it, vi } from "vitest";

import { executeDiscreteBatch } from "./batch.js";
import { ComputerUseError } from "./errors.js";

describe("#given shared discrete batch executor #when actions run #then surfaces share one generic loop", () => {
	it("#given registered action adapter #when executing a batch #then it runs actions in order", async () => {
		const order: string[] = [];

		const result = await executeDiscreteBatch({
			actions: [{ action: "get_app_state" }, { action: "click" }],
			executeAction: async (action) => {
				order.push(action.action);
				return { content: [{ type: "text", text: "ok" }] };
			},
		});

		expect(order).toEqual(["get_app_state", "click"]);
		expect(result.details).toMatchObject({
			ok: true,
			type: "batch",
			actionCount: 2,
			steps: [
				{ index: 0, action: "get_app_state", status: "success", contentCount: 1, hasImage: false },
				{ index: 1, action: "click", status: "success", contentCount: 1, hasImage: false },
			],
			finalActionType: "click",
		});
	});

	it("#given a typed computer-use failure #when executing a batch #then it stops with recovery details", async () => {
		const executeAction = vi.fn(async (action: { readonly action: string }) => {
			if (action.action === "click") {
				throw new ComputerUseError(
					"OUT_OF_BOUNDS_COORDINATE",
					"Point (501, 200) is outside capture frame [0,0)..[500,400)",
					{ recoveryHint: "Call get_app_state, then retry within the latest frame." },
				);
			}
			return { content: [{ type: "image", data: "base64", mimeType: "image/png" }] };
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
				{ index: 0, action: "get_app_state", status: "success", contentCount: 1, hasImage: true },
				{
					index: 1,
					action: "click",
					status: "error",
					code: "OUT_OF_BOUNDS_COORDINATE",
					recoveryHint: "Call get_app_state, then retry within the latest frame.",
				},
			],
		});
	});
});
