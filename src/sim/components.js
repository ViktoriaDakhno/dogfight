// Компоненти — звичайні об'єкти-дані, які «чіпляються» до будь-якої сутності полем.
// Системи шукають не клас, а наявність поля: `if (e.homing)`, `if (e.pickup)`, `if (e.effects)`.
// Так homing однаково працює на кулі й на астероїді, без нових гілок extends.

// homing: повертає швидкість до найближчої цілі зі списку `targets`
export function makeHoming({ targets, turnRate, range, ignoreId = null }) {
	return { targets, turnRate, range, ignoreId };
}

// pickup: поведінка як дані — тип, тривалість, вигляд
export const PICKUP_TYPES = {
	shield: { label: "S", duration: 6, color: "#5ec8ff" },
	rapid: { label: "R", duration: 8, color: "#ffd166" },
	homing: { label: "H", duration: 8, color: "#c792ea" },
};

export function makePickup(type) {
	return { type, ...PICKUP_TYPES[type] };
}

// effects: Map<тип, секунд лишилось> — усе, що дав pickup
export function makeEffects() {
	return new Map();
}

export function addEffect(effects, type, duration) {
	effects.set(type, Math.max(effects.get(type) ?? 0, duration));
}

export function tickEffects(effects, dt) {
	for (const [type, left] of effects) {
		if (left - dt <= 0) effects.delete(type);
		else effects.set(type, left - dt);
	}
}
