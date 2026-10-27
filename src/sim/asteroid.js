import { Entity } from "./entity.js";
import { Explosion } from "./explosion.js";

// розміри як дані: radius, hp і очки за знищення
export const ASTEROID_SIZES = {
	3: { radius: 40, hp: 75, points: 20 },
	2: { radius: 24, hp: 40, points: 50 },
	1: { radius: 14, hp: 25, points: 100 },
};

export class Asteroid extends Entity {
	constructor({ pos, vel, size = 3, rng, homing = null }) {
		const spec = ASTEROID_SIZES[size];
		super({
			kind: "asteroid",
			pos,
			vel,
			radius: spec.radius,
			angle: rng.range(0, Math.PI * 2),
		});
		this.size = size;
		this.hp = spec.hp;
		this.points = spec.points;
		this.spin = rng.range(-1, 1); // рад/с, лише для краси
		this.shape = Array.from({ length: 10 }, () => rng.range(0.75, 1.15));
		this.homing = homing; // той самий компонент, що й у кулі
	}

	update(dt) {
		this.angle += this.spin * dt;
		super.update(dt);
	}

	takeDamage(amount, world, sourceId) {
		if (!this.alive) return false;
		this.hp -= amount;
		if (this.hp > 0) return true;

		this.alive = false;
		world.spawn(
			new Explosion({
				pos: this.pos,
				rng: world.rng,
				color: "#9aa7bd",
				count: 8 + this.size * 6,
			}),
		);
		world.addScore(sourceId, this.points);

		// великий астероїд розколюється на два менші
		if (this.size > 1) {
			for (const side of [-1, 1]) {
				const vel = this.vel
					.rotate(side * world.rng.range(0.4, 0.9))
					.scale(world.rng.range(1.2, 1.6));
				world.spawn(
					new Asteroid({
						pos: this.pos,
						vel,
						size: this.size - 1,
						rng: world.rng,
					}),
				);
			}
		}
		return true;
	}
}
