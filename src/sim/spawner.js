import { Asteroid } from "./asteroid.js";
import { makeHoming, PICKUP_TYPES } from "./components.js";
import { Pickup } from "./pickup.js";
import { Vector2 } from "./vector.js";

export function spawnAsteroid(world, { homing = false } = {}) {
	const { rng } = world;
	const speed = homing ? 70 : rng.range(30, 80);
	return world.spawn(
		new Asteroid({
			pos: world.findSafeSpot(220),
			vel: Vector2.fromAngle(rng.range(0, Math.PI * 2), speed),
			size: homing ? 2 : 3,
			rng,
			// «мисливець»: той самий компонент, що в homing-кулі, тільки ціль — кораблі
			homing: homing
				? makeHoming({ targets: ["ship"], turnRate: 0.7, range: 600 })
				: null,
		}),
	);
}

function count(items) {
	let n = 0;
	for (const _ of items) n++;
	return n;
}

// Система-замикання: таймери живуть у змінних, а не в глобальному стані
export function createSpawner({
	minAsteroids = 6,
	asteroidEvery = 2.5,
	pickupEvery = 7,
	maxPickups = 2,
	homingChance = 0.25,
} = {}) {
	let asteroidTimer = asteroidEvery;
	let pickupTimer = 3;

	return function spawnerSystem(world, dt) {
		asteroidTimer -= dt;
		pickupTimer -= dt;

		if (asteroidTimer <= 0) {
			asteroidTimer = asteroidEvery;
			if (count(world.ofKind("asteroid")) < minAsteroids)
				spawnAsteroid(world, { homing: world.rng.chance(homingChance) });
		}

		if (pickupTimer <= 0) {
			pickupTimer = pickupEvery;
			if (count(world.ofKind("pickup")) < maxPickups) {
				const type = world.rng.pick(Object.keys(PICKUP_TYPES));
				world.spawn(new Pickup({ pos: world.findSafeSpot(120), type }));
			}
		}
	};
}
