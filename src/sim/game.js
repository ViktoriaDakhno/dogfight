import { ARENA } from "./arena.js";
import { Ship } from "./ship.js";
import { createSpawner, spawnAsteroid } from "./spawner.js";
import { homingSystem } from "./systems.js";
import { Vector2 } from "./vector.js";
import { World } from "./world.js";

// Збирає стартовий світ. Без DOM — можна запускати в Node (тести) і на сервері (Lab 5).
export function createGame({ seed = 2026 } = {}) {
	const world = new World({ seed, systems: [createSpawner(), homingSystem] });

	const player = world.spawn(
		new Ship({
			pos: new Vector2(ARENA.width / 2, ARENA.height / 2),
			name: "Гравець",
		}),
	);
	// навчальна ціль: такий самий Ship, але без керування (input за замовчуванням — нічого не натиснуто)
	const drone = world.spawn(
		new Ship({ pos: world.findSafeSpot(300), color: "#ff6b6b", name: "Дрон" }),
	);

	for (let i = 0; i < 5; i++) spawnAsteroid(world, { homing: i === 0 });

	return { world, player, drone };
}
