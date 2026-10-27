import { Entity } from "./entity.js";

export const BULLET = {
	speed: 700, // px/с відносно корабля
	ttl: 1.1, // с життя
	damage: 25,
	radius: 3,
	armTime: 0.25, // перші 0.25 с куля не б'є власника
};

export class Bullet extends Entity {
	constructor({ pos, vel, ownerId, homing = null }) {
		super({ kind: "bullet", pos, vel, radius: BULLET.radius });
		this.ownerId = ownerId;
		this.damage = BULLET.damage;
		this.ttl = BULLET.ttl;
		this.age = 0;
		this.homing = homing; // компонент: null або makeHoming(...)
	}

	update(dt) {
		super.update(dt);
		this.age += dt;
		if (this.age >= this.ttl) this.alive = false;
	}
}
