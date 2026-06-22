import { withTargetedApp } from "./actions.js";
import type { ComputerInterface } from "./interface.js";

export interface ExecuteTypeTextInput {
	readonly targetPid: number;
	readonly text: string;
}

export async function executeTypeTextAction(computer: ComputerInterface, input: ExecuteTypeTextInput): Promise<void> {
	if (await computer.typeIntoFocused(input.targetPid, input.text)) {
		return;
	}
	await withTargetedApp(computer, input.targetPid, async () => {
		await computer.type(input.text);
	});
}
