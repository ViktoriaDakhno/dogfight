import { torusDelta, wrapPos } from "./arena.js";
import { BULLET } from "./bullet.js";
import { addEffect } from "./components.js";
import { TUNING } from "./ship.js";

// Що відбувається, коли дві сутності зіткнулись.
// Перевіряємо компоненти й «уміння» (pickup, effects, takeDamage), а не конкретні класи.
export function resolveCollision(world, a, b) {
	if (a.pickup && b.effects) return collectPickup(b, a);
	if (b.pickup && a.effects) return collectPickup(a, b);
	if (a.kind === "bullet") return bulletHit(world, a, b);
	if (b.kind === "bullet") return bulletHit(world, b, a);
	if (a.kind === "ship" && b.kind === "asteroid") return ram(world, a, b);
	if (b.kind === "ship" && a.kind === "asteroid") return ram(world, b, a);
	if (a.kind === b.kind && (a.kind === "asteroid" || a.kind === "ship"))
		return bounce(a, b);
}

function collectPickup(holder, item) {
	addEffect(holder.effects, item.pickup.type, item.pickup.duration);
	item.alive = false;
}

function bulletHit(world, bullet, target) {
	if (typeof target.takeDamage !== "function") return; // куля в кулю чи в pickup
	if (target.id === bullet.ownerId && bullet.age < BULLET.armTime) return;
	target.takeDamage(bullet.damage, world, bullet.ownerId);
	bullet.alive = false;
}

function ram(world, ship, asteroid) {
	bounce(ship, asteroid);
	if (ship.takeDamage(TUNING.ramDamage, world, asteroid.id))
		ship.invulnerable = 0.8; // щоб один дотик не знімав hp 60 разів за секунду
}

// пружне зіткнення двох кіл (маса ~ площа) + розштовхування, щоб не злипались
function bounce(a, b) {
	const delta = torusDelta(a.pos, b.pos);
	const dist = delta.length() || 0.0001;
	const n = delta.scale(1 / dist);
	const ma = a.radius * a.radius;
	const mb = b.radius * b.radius;

	const overlap = a.radius + b.radius - dist;
	a.pos = wrapPos(a.pos.sub(n.scale((overlap * mb) / (ma + mb))));
	b.pos = wrapPos(b.pos.add(n.scale((overlap * ma) / (ma + mb))));

	const approach = b.vel.sub(a.vel).dot(n);
	if (approach >= 0) return; // вже розлітаються
	const impulse = (2 * approach) / (ma + mb);
	a.vel = a.vel.add(n.scale(impulse * mb));
	b.vel = b.vel.sub(n.scale(impulse * ma));
}
