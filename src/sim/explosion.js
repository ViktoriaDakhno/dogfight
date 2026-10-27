import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

// Вибух — сутність без колізій (radius 0) з купою короткоживучих частинок.
// Частинки — прості об'єкти {x, y, vx, vy}, які мутуються на місці: їх багато й живуть мить
// (саме такі об'єкти навантажують збирач сміття — повернемось до цього в Lab 7).
export class Explosion extends Entity {
	constructor({
		pos,
		rng,
		color = "#ffb347",
		count = 24,
		speed = 160,
		life = 0.8,
	}) {
		super({ kind: "explosion", pos });
		this.color = color;
		this.life = life;
		this.age = 0;
		this.particles = Array.from({ length: count }, () => {
			const v = Vector2.fromAngle(
				rng.range(0, Math.PI * 2),
				rng.range(speed * 0.3, speed),
			);
			return { x: pos.x, y: pos.y, vx: v.x, vy: v.y };
		});
	}

	update(dt) {
		this.age += dt;
		const damping = Math.exp(-2 * dt);
		for (const p of this.particles) {
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.vx *= damping;
			p.vy *= damping;
		}
		if (this.age >= this.life) this.alive = false;
	}
}
