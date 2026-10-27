import { torusDelta } from "./arena.js";

// Homing-система. Їй байдуже, хто перед нею — куля чи астероїд:
// вона обробляє будь-яку сутність, у якої є компонент `homing`.
export function homingSystem(world, dt) {
	for (const seeker of world) {
		if (!seeker.homing || !seeker.alive) continue;
		const target = findTarget(world, seeker);
		if (!target) continue;

		const desired = torusDelta(seeker.pos, target.pos).angle();
		const diff = shortestAngle(desired - seeker.vel.angle());
		const maxTurn = seeker.homing.turnRate * dt;
		const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
		seeker.vel = seeker.vel.rotate(turn); // повертаємо напрям, швидкість та сама
	}
}

function findTarget(world, seeker) {
	const { targets, range, ignoreId } = seeker.homing;
	let best = null;
	let bestDistSq = range * range;
	for (const e of world) {
		if (e === seeker || e.id === ignoreId || !e.collidable) continue;
		if (!targets.includes(e.kind)) continue;
		const d = torusDelta(seeker.pos, e.pos).lengthSq();
		if (d < bestDistSq) {
			best = e;
			bestDistSq = d;
		}
	}
	return best;
}

export function shortestAngle(a) {
	const full = Math.PI * 2;
	return ((((a + Math.PI) % full) + full) % full) - Math.PI;
}
