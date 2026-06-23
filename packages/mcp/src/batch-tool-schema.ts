import { z } from "zod/v4";

const appSchema = z.string().min(1);
const elementIndexSchema = z.string();
const regionSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const keySequenceEntrySchema = z.union([
	z.string().min(1),
	z.object({
		key: z.string().min(1),
		hold_seconds: z.number().nonnegative().optional(),
	}),
]);

export const mcpBatchActionSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("list_apps") }),
	z.object({ action: z.literal("get_app_state"), app: appSchema }),
	z.object({
		action: z.literal("click"),
		app: appSchema,
		element_index: elementIndexSchema.optional(),
		x: z.number().optional(),
		y: z.number().optional(),
		capture_id: z.string().optional(),
		display_epoch: z.string().optional(),
		click_count: z.number().int().positive().optional(),
		mouse_button: z.enum(["left", "right", "middle"]).optional(),
	}),
	z.object({
		action: z.literal("perform_secondary_action"),
		app: appSchema,
		element_index: elementIndexSchema,
		action_name: z.string().min(1),
	}),
	z.object({
		action: z.literal("set_value"),
		app: appSchema,
		element_index: elementIndexSchema,
		value: z.string(),
	}),
	z.object({
		action: z.literal("select_text"),
		app: appSchema,
		element_index: elementIndexSchema,
		text: z.string().optional(),
		prefix: z.string().optional(),
		suffix: z.string().optional(),
		selection: z.enum(["text", "before", "after"]).optional(),
	}),
	z.object({
		action: z.literal("drag"),
		app: appSchema,
		from_x: z.number(),
		from_y: z.number(),
		to_x: z.number(),
		to_y: z.number(),
		capture_id: z.string().optional(),
		display_epoch: z.string().optional(),
	}),
	z.object({
		action: z.literal("scroll"),
		app: appSchema,
		direction: z.enum(["up", "down", "left", "right"]),
		element_index: elementIndexSchema.optional(),
		pages: z.number().positive().optional(),
	}),
	z.object({
		action: z.literal("zoom"),
		app: appSchema,
		element_index: elementIndexSchema.optional(),
		region: regionSchema.optional(),
	}),
	z.object({ action: z.literal("type_text"), app: appSchema, text: z.string() }),
	z.object({
		action: z.literal("press_keys"),
		app: appSchema,
		keys: z.array(keySequenceEntrySchema).min(1),
		hold_seconds: z.number().nonnegative().optional(),
		interval_seconds: z.number().nonnegative().optional(),
	}),
]);

export const MCP_BATCH_ACTION_LIMIT = 20;

export const mcpBatchSchema = z.object({ actions: z.array(mcpBatchActionSchema).min(1).max(MCP_BATCH_ACTION_LIMIT) });

export type McpBatchAction = z.infer<typeof mcpBatchActionSchema>;
