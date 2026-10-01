import { ARENA, wrap } from "./arena.js";

export const TUNING = {
	turnSpeed: 4.2, // рад/с
	thrust: 550, // прискорення, px/с²
	drag: 0.8, // опір (експоненційне згасання)
	maxSpeed: 450, // px/с
};

export function createShip() {
	return {
		x: ARENA.width / 2,
		y: ARENA.height / 2,
		vx: 0,
		vy: 0,
		angle: -Math.PI / 2,
		thrust: false,
	};
}

// чиста функція: не чіпає DOM, не мутує вхід, повертає НОВИЙ стан
export function integrate(ship, input, dt) {
	let { x, y, vx, vy, angle } = ship;

	if (input.isDown("ArrowLeft") || input.isDown("KeyA"))
		angle -= TUNING.turnSpeed * dt;
	if (input.isDown("ArrowRight") || input.isDown("KeyD"))
		angle += TUNING.turnSpeed * dt;

	const thrust = input.isDown("ArrowUp") || input.isDown("KeyW");
	if (thrust) {
		vx += Math.cos(angle) * TUNING.thrust * dt;
		vy += Math.sin(angle) * TUNING.thrust * dt;
	}

	const damping = Math.exp(-TUNING.drag * dt);
	vx *= damping;
	vy *= damping;

	const speed = Math.hypot(vx, vy);
	if (speed > TUNING.maxSpeed) {
		vx = (vx / speed) * TUNING.maxSpeed;
		vy = (vy / speed) * TUNING.maxSpeed;
	}

	x = wrap(x + vx * dt, ARENA.width);
	y = wrap(y + vy * dt, ARENA.height);

	return { x, y, vx, vy, angle, thrust };
}
