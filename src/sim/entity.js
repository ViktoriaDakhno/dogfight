import { wrapPos } from "./arena.js";
import { Vector2 } from "./vector.js";

// Базова сутність. Від неї успадковуємось РІВНО на один рівень:
// Ship, Bullet, Asteroid, Pickup, Explosion extends Entity — і все.
// Решта поведінки (homing, pickup, ефекти) — компоненти-поля, див. components.js.
export class Entity {
	static #nextId = 1; // приватний статичний лічильник: ззовні не скинути й не зіпсувати
	#id = Entity.#nextId++;

	constructor({ kind, pos, vel = Vector2.ZERO, angle = 0, radius = 0 }) {
		this.kind = kind;
		this.pos = pos;
		this.vel = vel;
		this.angle = angle;
		this.radius = radius;
		this.alive = true; // false = «мертвий», World приб'є його в sweep наприкінці кроку
		this.world = null; // встановлює World.spawn
		this.prevPos = pos;
		this.prevAngle = angle;
	}

	get id() {
		return this.#id;
	}

	get collidable() {
		return this.alive && this.radius > 0;
	}

	// Стан для інтерполяції. Вектори незмінні, тому досить скопіювати посилання:
	// наступний update створить новий pos, а старий об'єкт ніхто не змінить.
	savePrev() {
		this.prevPos = this.pos;
		this.prevAngle = this.angle;
	}

	update(dt) {
		this.pos = wrapPos(this.pos.add(this.vel.scale(dt)));
	}
}
