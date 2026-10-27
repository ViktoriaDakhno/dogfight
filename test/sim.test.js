import assert from "node:assert/strict";
import { test } from "node:test";
import { Asteroid } from "../src/sim/asteroid.js";
import { Bullet } from "../src/sim/bullet.js";
import { circleCollisions } from "../src/sim/collision.js";
import { makeHoming } from "../src/sim/components.js";
import { Entity } from "../src/sim/entity.js";
import { createGame } from "../src/sim/game.js";
import { Pickup } from "../src/sim/pickup.js";
import { Ship } from "../src/sim/ship.js";
import { homingSystem } from "../src/sim/systems.js";
import { Vector2 } from "../src/sim/vector.js";
import { World } from "../src/sim/world.js";

const DT = 1 / 60;
const keys = (...codes) => ({ isDown: (c) => codes.includes(c) });
const v = (x, y) => new Vector2(x, y);

test("Vector2: методи чисті, аргументи не мутуються", () => {
	const a = v(1, 2);
	const b = v(3, 4);
	const c = a.add(b);
	assert.deepEqual([a.x, a.y, b.x, b.y], [1, 2, 3, 4]);
	assert.deepEqual([c.x, c.y], [4, 6]);
	assert.equal(v(3, 4).length(), 5);
	assert.ok(Math.abs(Vector2.fromAngle(Math.PI / 2).y - 1) < 1e-12);
	assert.ok(Math.abs(v(1, 0).rotate(Math.PI).x + 1) < 1e-12);
	assert.equal(v(2, 0).dot(v(0, 5)), 0);
});

test("Entity: унікальний id, лише для читання, наслідування в один рівень", () => {
	const a = new Entity({ kind: "x", pos: v(0, 0) });
	const b = new Entity({ kind: "x", pos: v(0, 0) });
	assert.notEqual(a.id, b.id);
	assert.throws(() => {
		a.id = 99; // геттер без сеттера → TypeError у strict mode
	}, TypeError);
	assert.equal(Object.getPrototypeOf(Ship.prototype), Entity.prototype);
	assert.equal(
		Object.getPrototypeOf(Object.getPrototypeOf(Ship.prototype)),
		Object.prototype,
	);
});

test("Ship: #hp приватне, назовні лише get hp()", () => {
	const world = new World();
	const ship = world.spawn(new Ship({ pos: v(100, 100) }));
	ship.invulnerable = 0;
	assert.equal(ship.hp, 100);
	ship.takeDamage(30, world, -1);
	assert.equal(ship.hp, 70);
	assert.throws(() => {
		ship.hp = 1000;
	}, TypeError);
	assert.equal(Object.keys(ship).includes("hp"), false);
});

test("this: метод, переданий як колбек, втрачає this; bind і стрілка лагодять", () => {
	const world = new World();
	const ship = world.spawn(new Ship({ pos: v(100, 100) }));
	const fire = ship.fire;
	assert.throws(() => fire(), TypeError); // this === undefined
	assert.ok(fire.bind(ship)() instanceof Bullet);
	ship.fireCooldown = 0;
	const viaArrow = () => ship.fire();
	assert.ok(viaArrow() instanceof Bullet);
});

test("World: Map, ітерація, ofKind-генератор, відкладене видалення", () => {
	const world = new World();
	const ship = world.spawn(new Ship({ pos: v(100, 100) }));
	const rock = world.spawn(
		new Asteroid({ pos: v(800, 400), vel: Vector2.ZERO, rng: world.rng }),
	);
	assert.equal(world.size, 2);
	assert.deepEqual([...world.ofKind("asteroid")], [rock]);
	assert.equal(world.get(ship.id), ship);

	world.despawn(rock.id);
	assert.equal(world.size, 2, "до кінця кроку лише позначка");
	world.step(DT);
	assert.equal(world.size, 1);
	assert.equal(world.get(rock.id), undefined);
});

test("Кулі: TTL, вилітають з носа з успадкованою швидкістю", () => {
	const world = new World();
	const ship = world.spawn(new Ship({ pos: v(800, 450), angle: 0 }));
	ship.vel = v(100, 0);
	const bullet = ship.fire();
	assert.ok(bullet.pos.x > ship.pos.x + ship.radius);
	assert.equal(bullet.vel.x, 800);
	assert.equal(ship.fire(), null, "cooldown");
	for (let i = 0; i < 70; i++) world.step(DT);
	assert.equal([...world.ofKind("bullet")].length, 0);
});

test("Колізії: пари з урахуванням загортання країв", () => {
	const world = new World();
	const a = world.spawn(new Ship({ pos: v(5, 450) }));
	const b = world.spawn(new Ship({ pos: v(1595, 450) }));
	world.spawn(new Ship({ pos: v(800, 450) }));
	const pairs = [...circleCollisions(world)];
	assert.equal(pairs.length, 1);
	assert.deepEqual(new Set(pairs[0]), new Set([a, b]));
});

test("Куля руйнує астероїд, він розколюється, гравець отримує очки", () => {
	const world = new World();
	const ship = world.spawn(new Ship({ pos: v(100, 100) }));
	const rock = world.spawn(
		new Asteroid({
			pos: v(800, 450),
			vel: Vector2.ZERO,
			size: 2,
			rng: world.rng,
		}),
	);
	for (let i = 0; i < 2; i++) {
		world.spawn(
			new Bullet({ pos: v(800, 450), vel: Vector2.ZERO, ownerId: ship.id }),
		);
		world.step(DT);
	}
	assert.equal(rock.alive, false);
	assert.equal(world.scores.get(ship.id), 50);
	assert.equal([...world.ofKind("asteroid")].length, 2);
	assert.equal([...world.ofKind("explosion")].length, 1);
});

test("Знищення корабля: вибух, очки стрільцю, респаун через 2 с", () => {
	const world = new World();
	const shooter = world.spawn(new Ship({ pos: v(100, 100) }));
	const target = world.spawn(new Ship({ pos: v(800, 450) }));
	target.invulnerable = 0;
	for (let i = 0; i < 4; i++) {
		world.spawn(
			new Bullet({ pos: v(800, 450), vel: Vector2.ZERO, ownerId: shooter.id }),
		);
		world.step(DT);
	}
	assert.equal(target.hp, 0);
	assert.equal(target.destroyed, true);
	assert.equal(target.collidable, false);
	assert.equal(world.scores.get(shooter.id), 100);
	for (let i = 0; i < 125; i++) world.step(DT);
	assert.equal(target.hp, 100);
	assert.equal(target.deaths, 1);
	assert.equal(world.get(target.id), target, "той самий id після респауну");
});

test("Homing: одна система для кулі й астероїда (композиція)", () => {
	const world = new World({ systems: [homingSystem] });
	const ship = world.spawn(new Ship({ pos: v(800, 200) }));
	const bullet = world.spawn(
		new Bullet({
			pos: v(600, 450),
			vel: v(300, 0),
			ownerId: -1,
			homing: makeHoming({ targets: ["ship"], turnRate: 4, range: 600 }),
		}),
	);
	const rock = world.spawn(
		new Asteroid({
			pos: v(1000, 450),
			vel: v(-60, 0),
			size: 1,
			rng: world.rng,
			homing: makeHoming({ targets: ["ship"], turnRate: 2, range: 600 }),
		}),
	);
	world.step(DT);
	assert.ok(bullet.vel.y < 0, "куля повертає вгору до корабля");
	assert.ok(rock.vel.y < 0, "астероїд теж");
	assert.ok(
		Math.abs(bullet.vel.length() - 300) < 1e-9,
		"швидкість не змінюється",
	);
	assert.ok(ship.alive);
});

test("Pickup: стоїть, колізиться, дає ефект будь-кому з компонентом effects", () => {
	const world = new World();
	const ship = world.spawn(new Ship({ pos: v(400, 400) }));
	const item = world.spawn(new Pickup({ pos: v(410, 400), type: "rapid" }));
	world.step(DT);
	assert.equal(item.alive, false);
	assert.ok(ship.effects.has("rapid"));
	ship.fire();
	assert.ok(ship.fireCooldown < 0.1);
});

test("Детермінізм: той самий seed і ті самі дії → той самий світ", () => {
	const run = () => {
		const { world, player } = createGame({ seed: 7 });
		const inputs = new Map([
			[player.id, keys("ArrowUp", "Space", "ArrowLeft")],
		]);
		for (let i = 0; i < 1200; i++) world.step(DT, inputs);
		return JSON.stringify(
			[...world].map((e) => [e.kind, e.pos.x.toFixed(6), e.pos.y.toFixed(6)]),
		);
	};
	assert.equal(run(), run());
});

test("Довга гра без помилок: 60 с симуляції зі стрільбою", () => {
	const { world, player } = createGame({ seed: 42 });
	const inputs = new Map([[player.id, keys("ArrowUp", "Space", "KeyD")]]);
	for (let i = 0; i < 3600; i++) world.step(DT, inputs);
	assert.ok(world.size > 0);
	assert.ok(world.time > 59.9);
});
