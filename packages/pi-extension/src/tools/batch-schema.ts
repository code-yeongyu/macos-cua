import { type Static, Type } from "typebox";

const AppParam = Type.String({ description: "App name or bundle identifier." });
const MouseButtonParam = Type.Union([Type.Literal("left"), Type.Literal("right"), Type.Literal("middle")]);
const DirectionParam = Type.Union([
	Type.Literal("up"),
	Type.Literal("down"),
	Type.Literal("left"),
	Type.Literal("right"),
]);
const SelectionParam = Type.Union([Type.Literal("text"), Type.Literal("before"), Type.Literal("after")]);
const KeyEntryParam = Type.Union([
	Type.String(),
	Type.Object(
		{ key: Type.String(), hold_seconds: Type.Optional(Type.Number({ minimum: 0 })) },
		{ additionalProperties: false },
	),
]);
const RegionParam = Type.Object(
	{ x: Type.Number(), y: Type.Number(), width: Type.Number(), height: Type.Number() },
	{ additionalProperties: false },
);

const BatchActionParams = Type.Union([
	Type.Object({ action: Type.Literal("get_app_state"), app: AppParam }, { additionalProperties: false }),
	Type.Object(
		{
			action: Type.Literal("click"),
			app: AppParam,
			element_index: Type.Optional(Type.String()),
			x: Type.Optional(Type.Number()),
			y: Type.Optional(Type.Number()),
			capture_id: Type.Optional(Type.String({ description: "Capture id from the latest get_app_state metadata." })),
			display_epoch: Type.Optional(
				Type.String({ description: "Display epoch from the latest get_app_state metadata." }),
			),
			click_count: Type.Optional(Type.Integer({ minimum: 1 })),
			mouse_button: Type.Optional(MouseButtonParam),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("perform_secondary_action"),
			app: AppParam,
			element_index: Type.String(),
			action_name: Type.String(),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{ action: Type.Literal("set_value"), app: AppParam, element_index: Type.String(), value: Type.String() },
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("select_text"),
			app: AppParam,
			element_index: Type.String(),
			text: Type.Optional(Type.String()),
			prefix: Type.Optional(Type.String()),
			suffix: Type.Optional(Type.String()),
			selection: Type.Optional(SelectionParam),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("drag"),
			app: AppParam,
			from_x: Type.Number(),
			from_y: Type.Number(),
			to_x: Type.Number(),
			to_y: Type.Number(),
			capture_id: Type.Optional(Type.String({ description: "Capture id from the latest get_app_state metadata." })),
			display_epoch: Type.Optional(
				Type.String({ description: "Display epoch from the latest get_app_state metadata." }),
			),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("scroll"),
			app: AppParam,
			direction: DirectionParam,
			element_index: Type.Optional(Type.String()),
			pages: Type.Optional(Type.Number()),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("zoom"),
			app: AppParam,
			element_index: Type.Optional(Type.String()),
			region: Type.Optional(RegionParam),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{ action: Type.Literal("type_text"), app: AppParam, text: Type.String() },
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("press_keys"),
			app: AppParam,
			keys: Type.Array(KeyEntryParam, { minItems: 1 }),
			hold_seconds: Type.Optional(Type.Number({ minimum: 0 })),
			interval_seconds: Type.Optional(Type.Number({ minimum: 0 })),
		},
		{ additionalProperties: false },
	),
]);

export const BatchParams = Type.Object(
	{
		actions: Type.Array(BatchActionParams, {
			minItems: 1,
			maxItems: 20,
			description:
				"Discrete computer-use actions to run in order. Nested batch and code execution are not supported.",
		}),
	},
	{ additionalProperties: false },
);

export type BatchAction = Static<typeof BatchActionParams>;
export type BatchInput = Static<typeof BatchParams>;
