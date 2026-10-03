import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";

import { colorAdjustmentDefinition, colorEffects } from "./color";

const defaultEffects = [blurEffectDefinition, colorAdjustmentDefinition, ...colorEffects];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
