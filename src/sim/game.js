import { ARENA } from "./arena.js";
import { Ship } from "./ship.js";
import { createSpawner, spawnAsteroid } from "./spawner.js";
import { homingSystem } from "./systems.js";
import { Vector2 } from "./vector.js";
import { World } from "./world.js";

// Збирає стартовий світ. Без DOM — можна запускати в Node (тести) і на сервері (Lab 5).
// Параметри приходять з кімнати лобі (room.arena); розмір арени задає configureArena.
export function createGame({
	seed = 2026,
	asteroids = 5,
	homingChance = 0.25,
	playerName = "Гравець",
} = {}) {
	const world = new World({
		seed,
		systems: [
			createSpawner({ minAsteroids: asteroids + 1, homingChance }),
			homingSystem,
		],
	});

	const player = world.spawn(
		new Ship({
			pos: new Vector2(ARENA.width / 2, ARENA.height / 2),
			name: playerName,
		}),
	);
	// навчальна ціль: такий самий Ship, але без керування (input за замовчуванням — нічого не натиснуто)
	const drone = world.spawn(
		new Ship({
			pos: world.findSafeSpot(300),
			color: "#ff6b6b",
			name: "Дрон",
			skin: "drone",
		}),
	);

	for (let i = 0; i < asteroids; i++)
		spawnAsteroid(world, { homing: i === 0 && homingChance > 0 });

	return { world, player, drone };
}
