import { wrapPos } from "./arena.js";
import { BULLET, Bullet } from "./bullet.js";
import { makeEffects, makeHoming, tickEffects } from "./components.js";
import { Entity } from "./entity.js";
import { Explosion } from "./explosion.js";
import { Vector2 } from "./vector.js";

export const TUNING = {
	turnSpeed: 4.2, // рад/с
	thrust: 550, // прискорення, px/с²
	drag: 0.8, // опір (експоненційне згасання)
	maxSpeed: 450, // px/с
	fireCooldown: 0.25, // с між пострілами
	rapidCooldown: 0.08, // з pickup «rapid»
	maxHp: 100,
	respawnDelay: 2, // с
	spawnShield: 1.5, // с невразливості після появи
	ramDamage: 20, // шкода від зіткнення з астероїдом
};

export class Ship extends Entity {
	#hp = TUNING.maxHp; // приватне: змінити можна лише через takeDamage

	constructor({ pos, angle = -Math.PI / 2, color = "#e8f1ff", name = "ship" }) {
		super({ kind: "ship", pos, angle, radius: 14 });
		this.color = color;
		this.name = name;
		this.thrust = false;
		this.fireCooldown = 0;
		this.invulnerable = TUNING.spawnShield;
		this.respawnIn = 0;
		this.deaths = 0;
		this.effects = makeEffects(); // компонент: що дали pickup-и
	}

	get hp() {
		return this.#hp;
	}

	get destroyed() {
		return this.#hp <= 0;
	}

	get collidable() {
		return super.collidable && !this.destroyed;
	}

	update(dt, input) {
		if (this.destroyed) {
			this.respawnIn -= dt;
			if (this.respawnIn <= 0) this.respawn();
			return;
		}

		tickEffects(this.effects, dt);
		this.fireCooldown = Math.max(0, this.fireCooldown - dt);
		this.invulnerable = Math.max(0, this.invulnerable - dt);

		// та сама фізика, що й integrate() з Lab 1, але на Vector2
		if (input.isDown("ArrowLeft") || input.isDown("KeyA"))
			this.angle -= TUNING.turnSpeed * dt;
		if (input.isDown("ArrowRight") || input.isDown("KeyD"))
			this.angle += TUNING.turnSpeed * dt;

		this.thrust = input.isDown("ArrowUp") || input.isDown("KeyW");
		let vel = this.vel;
		if (this.thrust)
			vel = vel.add(Vector2.fromAngle(this.angle, TUNING.thrust * dt));
		this.vel = vel
			.scale(Math.exp(-TUNING.drag * dt))
			.clampLength(TUNING.maxSpeed);

		if (input.isDown("Space")) this.fire();

		super.update(dt); // рух + загортання з Entity
	}

	// Звичайний метод: `this` визначається В МОМЕНТ ВИКЛИКУ.
	// player.fire() → this === player. Передали як колбек (addEventListener("keydown", player.fire))
	// → браузер викличе з this === window, і рядок з this.pos.add впаде з TypeError.
	fire() {
		const dir = Vector2.fromAngle(this.angle);
		const nose = this.pos.add(dir.scale(this.radius + 6));
		if (!this.alive || this.destroyed || this.fireCooldown > 0) return null;

		this.fireCooldown = this.effects.has("rapid")
			? TUNING.rapidCooldown
			: TUNING.fireCooldown;

		const homing = this.effects.has("homing")
			? makeHoming({
					targets: ["asteroid", "ship"],
					turnRate: 4,
					range: 450,
					ignoreId: this.id,
				})
			: null;

		const bullet = new Bullet({
			pos: wrapPos(nose),
			vel: this.vel.add(dir.scale(BULLET.speed)), // успадкована швидкість корабля
			ownerId: this.id,
			homing,
		});
		return this.world.spawn(bullet);
	}

	takeDamage(amount, world, sourceId) {
		if (this.destroyed || this.invulnerable > 0) return false;
		if (this.effects.has("shield")) return false;

		this.#hp = Math.max(0, this.#hp - amount);
		if (this.#hp === 0) this.#explode(world, sourceId);
		return true;
	}

	// приватний метод: викликається лише зсередини класу
	#explode(world, sourceId) {
		this.deaths++;
		this.respawnIn = TUNING.respawnDelay;
		this.thrust = false;
		this.effects.clear();
		world.spawn(
			new Explosion({
				pos: this.pos,
				rng: world.rng,
				color: this.color,
				count: 40,
				speed: 220,
				life: 1.2,
			}),
		);
		if (sourceId !== this.id) world.addScore(sourceId, 100);
	}

	respawn() {
		const spot = this.world.findSafeSpot(150); // поки корабель «мертвий», себе не враховує
		this.#hp = TUNING.maxHp;
		this.pos = spot;
		this.vel = Vector2.ZERO;
		this.angle = -Math.PI / 2;
		this.invulnerable = TUNING.spawnShield;
		this.savePrev(); // щоб інтерполяція не «протягла» корабель через пів арени
	}
}
