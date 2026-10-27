import { Vector2 } from "./vector.js";

// Один спільний об'єкт: модулі імпортують посилання, тому зміна через
// configureArena одразу видна всім (і wrap, і рендеру).
export const ARENA = {
	width: 1600,
	height: 900,
	background: "#101626",
	grid: "#1e2a45",
	border: "#4a6fa5",
	gridStep: 100,
};

const DEFAULTS = { ...ARENA };

// Бере з конфігу лише відомі поля потрібного типу: arena.json і кімната
// з /api/rooms приходять з мережі, тож сміття в них не повинно зламати гру.
export function configureArena(...configs) {
	Object.assign(ARENA, DEFAULTS);
	for (const config of configs) {
		for (const [key, value] of Object.entries(config ?? {})) {
			if (key in DEFAULTS && typeof value === typeof DEFAULTS[key])
				ARENA[key] = value;
		}
	}
	return ARENA;
}

// «загортання» країв: вийшов праворуч, з'явився ліворуч
export function wrap(value, size) {
	return ((value % size) + size) % size;
}

export function wrapPos(v) {
	return new Vector2(wrap(v.x, ARENA.width), wrap(v.y, ARENA.height));
}

// найкоротша різниця по одній осі з урахуванням загортання
function shortest(d, size) {
	if (d > size / 2) return d - size;
	if (d < -size / 2) return d + size;
	return d;
}

// найкоротший вектор from → to на «торі»: два кораблі біля протилежних країв
// насправді поруч, і колізії та homing мають це враховувати
export function torusDelta(from, to) {
	return new Vector2(
		shortest(to.x - from.x, ARENA.width),
		shortest(to.y - from.y, ARENA.height),
	);
}
