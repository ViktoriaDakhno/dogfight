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

function lerpPos(e, alpha) {
	return {
		x: lerpWrap(e.prevPos.x, e.pos.x, alpha, ARENA.width),
		y: lerpWrap(e.prevPos.y, e.pos.y, alpha, ARENA.height),
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

function drawShip(ctx, ship, alpha) {
	if (ship.destroyed) return;
	// блимання під час невразливості після респауну
	if (ship.invulnerable > 0 && Math.floor(performance.now() / 100) % 2 === 0)
		return;

	const p = lerpPos(ship, alpha);
	ctx.save();
	ctx.translate(p.x, p.y);

	// смужка hp над кораблем (не обертається разом з ним)
	ctx.fillStyle = "#2a3550";
	ctx.fillRect(-16, -28, 32, 4);
	ctx.fillStyle = ship.hp > 30 ? "#9fe870" : "#ff6b6b";
	ctx.fillRect(-16, -28, (32 * ship.hp) / 100, 4);

	if (ship.effects.has("shield")) {
		ctx.strokeStyle = "#5ec8ff";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(0, 0, ship.radius + 8, 0, Math.PI * 2);
		ctx.stroke();
	}

	ctx.rotate(lerpAngle(ship.prevAngle, ship.angle, alpha));
	ctx.strokeStyle = ship.color;
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

function drawBullet(ctx, bullet, alpha) {
	const p = lerpPos(bullet, alpha);
	ctx.fillStyle = bullet.homing ? "#c792ea" : "#ffe08a";
	ctx.beginPath();
	ctx.arc(p.x, p.y, bullet.radius, 0, Math.PI * 2);
	ctx.fill();
}

function drawAsteroid(ctx, asteroid, alpha) {
	const p = lerpPos(asteroid, alpha);
	ctx.save();
	ctx.translate(p.x, p.y);
	ctx.rotate(lerpAngle(asteroid.prevAngle, asteroid.angle, alpha));
	ctx.strokeStyle = asteroid.homing ? "#ff6b6b" : "#9aa7bd";
	ctx.lineWidth = 2;
	ctx.beginPath();
	const n = asteroid.shape.length;
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2;
		const r = asteroid.radius * asteroid.shape[i];
		if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
		else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
	}
	ctx.closePath();
	ctx.stroke();
	ctx.restore();
}

function drawPickup(ctx, item) {
	const fading = item.ttl - item.age < 3;
	if (fading && Math.floor(item.age * 6) % 2 === 0) return; // блимає перед зникненням
	const pulse = 1 + Math.sin(item.age * 4) * 0.1;
	ctx.save();
	ctx.translate(item.pos.x, item.pos.y);
	ctx.strokeStyle = item.pickup.color;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(0, 0, item.radius * pulse, 0, Math.PI * 2);
	ctx.stroke();
	ctx.fillStyle = item.pickup.color;
	ctx.font = "bold 14px monospace";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(item.pickup.label, 0, 1);
	ctx.restore();
}

function drawExplosion(ctx, boom) {
	ctx.globalAlpha = Math.max(0, 1 - boom.age / boom.life);
	ctx.fillStyle = boom.color;
	for (const p of boom.particles) ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
	ctx.globalAlpha = 1;
}

// таблиця «kind → як малювати» замість ланцюжка if/else
const DRAWERS = {
	ship: drawShip,
	bullet: drawBullet,
	asteroid: drawAsteroid,
	pickup: drawPickup,
	explosion: drawExplosion,
};

export function drawEntity(ctx, entity, alpha) {
	DRAWERS[entity.kind]?.(ctx, entity, alpha);
}

export function drawHud(ctx, stats, { player, world }, view) {
	ctx.fillStyle = "#9fe870";
	ctx.font = "14px monospace";
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillText(`steps/s: ${stats.stepsPerSec.toFixed(1)}`, 12, 22);
	ctx.fillText(`frames/s: ${stats.framesPerSec.toFixed(1)}`, 12, 40);
	ctx.fillText(`frame: ${stats.frameMs.toFixed(1)} ms`, 12, 58);

	ctx.fillStyle = "#e8f1ff";
	ctx.fillText(`score: ${world.scores.get(player.id) ?? 0}`, 12, 84);
	ctx.fillText(`hp: ${player.hp}   deaths: ${player.deaths}`, 12, 102);
	ctx.fillText(`entities: ${world.size}`, 12, 120);

	const effects = [...player.effects]
		.map(([type, left]) => `${type} ${left.toFixed(1)}s`)
		.join("  ");
	if (effects) {
		ctx.fillStyle = "#c792ea";
		ctx.fillText(effects, 12, 138);
	}

	if (player.destroyed) {
		ctx.fillStyle = "#ff6b6b";
		ctx.font = "bold 24px monospace";
		ctx.textAlign = "center";
		ctx.fillText(
			`Респаун через ${Math.max(0, player.respawnIn).toFixed(1)} с`,
			view.width / 2,
			view.height / 2,
		);
	}

	ctx.fillStyle = "#6b7a99";
	ctx.font = "12px monospace";
	ctx.textAlign = "left";
	ctx.fillText(
		"←/→ A/D поворот · ↑/W тяга · Space стрільба · клік — один постріл · pickup: S щит, R швидкострільність, H самонавідні кулі",
		12,
		view.height - 12,
	);
}
