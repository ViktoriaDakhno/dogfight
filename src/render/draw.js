import { ARENA } from "../sim/arena.js";

// інтерполяція координати з урахуванням «загортання»: беремо найкоротший шлях
function lerpWrap(a, b, t, size) {
	let d = b - a;
	if (d > size / 2) d -= size;
	else if (d < -size / 2) d += size;
	return a + d * t;
}

// інтерполяція кута: найкоротший поворот (класична помилка — крутитись на 360°)
function lerpAngle(a, b, t) {
	const d =
		((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) -
		Math.PI;
	return a + d * t;
}

export function interpolateShip(prev, curr, alpha) {
	return {
		x: lerpWrap(prev.x, curr.x, alpha, ARENA.width),
		y: lerpWrap(prev.y, curr.y, alpha, ARENA.height),
		angle: lerpAngle(prev.angle, curr.angle, alpha),
		thrust: curr.thrust,
	};
}

export function drawBackground(ctx) {
	ctx.fillStyle = "#101626";
	ctx.fillRect(0, 0, ARENA.width, ARENA.height);

	ctx.strokeStyle = "#1e2a45"; // сітка, щоб було видно рух
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let x = 0; x <= ARENA.width; x += 100) {
		ctx.moveTo(x, 0);
		ctx.lineTo(x, ARENA.height);
	}
	for (let y = 0; y <= ARENA.height; y += 100) {
		ctx.moveTo(0, y);
		ctx.lineTo(ARENA.width, y);
	}
	ctx.stroke();

	ctx.strokeStyle = "#4a6fa5";
	ctx.lineWidth = 3;
	ctx.strokeRect(0, 0, ARENA.width, ARENA.height);
}

export function drawShip(ctx, ship) {
	ctx.save();
	ctx.translate(ship.x, ship.y); // початок координат — у корабель
	ctx.rotate(ship.angle); // повертаємо полотно

	ctx.strokeStyle = "#e8f1ff";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(20, 0);
	ctx.lineTo(-14, -12);
	ctx.lineTo(-8, 0);
	ctx.lineTo(-14, 12);
	ctx.closePath();
	ctx.stroke();

	if (ship.thrust) {
		ctx.strokeStyle = "#ffb347";
		ctx.beginPath();
		ctx.moveTo(-9, -5);
		ctx.lineTo(-22 - Math.random() * 10, 0);
		ctx.lineTo(-9, 5);
		ctx.stroke();
	}
	ctx.restore();
}

export function drawHud(ctx, stats) {
	ctx.fillStyle = "#9fe870";
	ctx.font = "14px monospace";
	ctx.fillText(`steps/s: ${stats.stepsPerSec.toFixed(1)}`, 12, 22);
	ctx.fillText(`frames/s: ${stats.framesPerSec.toFixed(1)}`, 12, 40);
	ctx.fillText(`frame: ${stats.frameMs.toFixed(1)} ms`, 12, 58);
}
