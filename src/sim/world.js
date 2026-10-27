import { ARENA, torusDelta } from "./arena.js";
import { circleCollisions } from "./collision.js";
import { createRng } from "./random.js";
import { resolveCollision } from "./rules.js";
import { Vector2 } from "./vector.js";

const NO_INPUT = { isDown: () => false };

// Менеджер сутностей: усі «речі у світі» в одній Map<id, Entity>.
export class World {
	#entities = new Map();
	#pending = []; // створені під час кроку — додаються після нього
	#stepping = false;

	constructor({
		seed = 1,
		systems = [],
		detect = circleCollisions, // можна підмінити на spatial hash
		resolve = resolveCollision,
	} = {}) {
		this.rng = createRng(seed);
		this.systems = systems;
		this.detect = detect;
		this.resolve = resolve;
		this.time = 0;
		this.scores = new Map(); // id корабля → очки
		// Шина подій. Симуляція лише повідомляє «що сталося»; хто слухає
		// (звук, HUD, у Lab 5 — мережа), вона не знає й нічого з них не імпортує.
		this.events = new EventTarget();
	}

	emit(type, detail) {
		this.events.dispatchEvent(new CustomEvent(type, { detail }));
	}

	get size() {
		return this.#entities.size;
	}

	// for (const e of world) — обхід усіх сутностей
	*[Symbol.iterator]() {
		yield* this.#entities.values();
	}

	// for (const b of world.ofKind("bullet")) — без проміжного масиву
	*ofKind(kind) {
		for (const e of this) if (e.kind === kind) yield e;
	}

	get(id) {
		return this.#entities.get(id);
	}

	spawn(entity) {
		entity.world = this;
		if (this.#stepping) this.#pending.push(entity);
		else this.#add(entity);
		return entity;
	}

	// відкладене видалення: лише позначка, саме видалення — у #sweep наприкінці кроку
	despawn(id) {
		const e = this.#entities.get(id);
		if (e) e.alive = false;
	}

	addScore(id, points, pos = null) {
		if (!this.scores.has(id)) return; // очки лише кораблям
		const total = this.scores.get(id) + points;
		this.scores.set(id, total);
		this.emit("scored", { id, points, total, x: pos?.x, y: pos?.y });
	}

	step(dt, inputs = new Map()) {
		this.#stepping = true;
		this.time += dt;

		for (const e of this) e.savePrev();
		for (const system of this.systems) system(this, dt);
		for (const e of this) {
			if (e.alive) e.update(dt, inputs.get(e.id) ?? NO_INPUT);
		}
		for (const [a, b] of this.detect(this)) {
			// попередня пара могла вже «вбити» одного з них
			if (a.collidable && b.collidable) this.resolve(this, a, b);
		}

		this.#stepping = false;
		for (const e of this.#pending) this.#add(e);
		this.#pending.length = 0;
		this.#sweep();
	}

	// випадкова точка, далека від усього, з чим можна зіткнутися
	findSafeSpot(minDist = 150, tries = 40) {
		let best = new Vector2(ARENA.width / 2, ARENA.height / 2);
		let bestClear = Number.NEGATIVE_INFINITY;
		for (let i = 0; i < tries; i++) {
			const p = new Vector2(
				this.rng.range(60, ARENA.width - 60),
				this.rng.range(60, ARENA.height - 60),
			);
			let clear = Number.POSITIVE_INFINITY;
			for (const e of this) {
				if (!e.collidable || e.kind === "pickup") continue;
				clear = Math.min(clear, torusDelta(p, e.pos).length() - e.radius);
			}
			if (clear >= minDist) return p;
			if (clear > bestClear) {
				bestClear = clear;
				best = p;
			}
		}
		return best;
	}

	#add(e) {
		this.#entities.set(e.id, e);
		if (e.kind === "ship" && !this.scores.has(e.id)) this.scores.set(e.id, 0);
	}

	#sweep() {
		const dead = [];
		for (const [id, e] of this.#entities) if (!e.alive) dead.push(id);
		for (const id of dead) this.#entities.delete(id);
	}
}
