import { Vector2 } from "./vector.js";

export const ARENA = { width: 1600, height: 900 };

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
