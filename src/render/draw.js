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
	ctx.fillStyle = ARENA.background;
	ctx.fillRect(0, 0, ARENA.width, ARENA.height);

	ctx.strokeStyle = ARENA.grid; // сітка, щоб було видно рух
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let x = 0; x <= ARENA.width; x += ARENA.gridStep) {
		ctx.moveTo(x, 0);
		ctx.lineTo(x, ARENA.height);
	}
	for (let y = 0; y <= ARENA.height; y += ARENA.gridStep) {
		ctx.moveTo(0, y);
		ctx.lineTo(ARENA.width, y);
	}
	ctx.stroke();

	ctx.strokeStyle = ARENA.border;
	ctx.lineWidth = 3;
	ctx.strokeRect(0, 0, ARENA.width, ARENA.height);
}

// ---------- векторні заміни (Lab 2), якщо спрайт не завантажився ----------
function vectorShip(ctx, ship) {
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
}

function vectorAsteroid(ctx, asteroid) {
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
}

// ---------- сутності ----------
function drawShip(ctx, ship, alpha, sprites) {
	if (ship.destroyed) return;
	// блимання під час невразливості після респауну
	if (ship.invulnerable > 0 && Math.floor(performance.now() / 100) % 2 === 0)
		return;

	const p = lerpPos(ship, alpha);
	const angle = lerpAngle(ship.prevAngle, ship.angle, alpha);
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
		ctx.arc(0, 0, ship.radius + 10, 0, Math.PI * 2);
		ctx.stroke();
	}

	const frame = ship.thrust ? `${ship.skin}-thrust` : ship.skin;
	if (!sprites.draw(ctx, "ships", frame, 0, 0, 48, angle)) {
		ctx.rotate(angle);
		vectorShip(ctx, ship);
	}
	ctx.restore();
}

function drawBullet(ctx, bullet, alpha, sprites) {
	const p = lerpPos(bullet, alpha);
	const frame = bullet.homing ? "homing" : "normal";
	if (sprites.draw(ctx, "bullets", frame, p.x, p.y, 14)) return;
	ctx.fillStyle = bullet.homing ? "#c792ea" : "#ffe08a";
	ctx.beginPath();
	ctx.arc(p.x, p.y, bullet.radius, 0, Math.PI * 2);
	ctx.fill();
}

const ROCK_FRAMES = ["a", "b", "c"];

function drawAsteroid(ctx, asteroid, alpha, sprites) {
	const p = lerpPos(asteroid, alpha);
	const angle = lerpAngle(asteroid.prevAngle, asteroid.angle, alpha);
	const frame = ROCK_FRAMES[asteroid.id % ROCK_FRAMES.length];
	// у кадрі 128 px камінь має радіус ~56 px → масштаб 128/112
	const size = asteroid.radius * 2 * (128 / 112);

	ctx.save();
	ctx.translate(p.x, p.y);
	if (!sprites.draw(ctx, "asteroids", frame, 0, 0, size, angle)) {
		ctx.rotate(angle);
		vectorAsteroid(ctx, asteroid);
	} else if (asteroid.homing) {
		// «мисливець»: червоне кільце поверх спрайта
		ctx.strokeStyle = "#ff6b6b";
		ctx.lineWidth = 2;
		ctx.setLineDash([6, 6]);
		ctx.beginPath();
		ctx.arc(0, 0, asteroid.radius + 6, 0, Math.PI * 2);
		ctx.stroke();
		ctx.setLineDash([]);
	}
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

export function drawEntity(ctx, entity, alpha, sprites) {
	DRAWERS[entity.kind]?.(ctx, entity, alpha, sprites);
}
