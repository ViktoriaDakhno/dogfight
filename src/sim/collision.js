import { torusDelta } from "./arena.js";

// Окрема система виявлення: бере світ, видає пари [a, b], що перетинаються.
// Нічого не знає про шкоду чи очки, тому наївний O(n²) можна замінити на spatial hash
// (Lab 7), не чіпаючи правил. Генератор — пари віддаються по одній, без проміжного масиву.
export function* circleCollisions(world) {
	const list = [];
	for (const e of world) if (e.collidable) list.push(e);

	for (let i = 0; i < list.length; i++) {
		for (let j = i + 1; j < list.length; j++) {
			const a = list[i];
			const b = list[j];
			const r = a.radius + b.radius;
			if (torusDelta(a.pos, b.pos).lengthSq() < r * r) yield [a, b];
		}
	}
}
