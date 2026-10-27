import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

// Мінімальний «сервер» для розробки: Vite підключає цю функцію як middleware.
// Lab 4 замінить це справжнім сервером на Node.
//
//   GET /api/rooms              список кімнат (кількість гравців змінюється з часом)
//   будь-який URL + ?delay=ms   відповідь із затримкою (повільна мережа, таймаут)
//   будь-який URL + ?status=500 примусова помилка з цим статусом
//   будь-який URL + ?flaky=N    перші N запитів → 503, далі нормально (перевірка retry)
//   будь-який URL + ?corrupt=1  обрізаний, битий JSON
//   будь-який URL + ?html=1     200 OK, але замість файлу — HTML-сторінка (як SPA fallback у Vite)

const ROOMS = [
	{
		id: "training",
		name: "Тренування",
		maxPlayers: 4,
		base: 1,
		arena: {
			width: 1200,
			height: 700,
			asteroids: 3,
			homingChance: 0,
			seed: 11,
		},
	},
	{
		id: "classic",
		name: "Класика",
		maxPlayers: 8,
		base: 3,
		arena: {
			width: 1600,
			height: 900,
			asteroids: 5,
			homingChance: 0.25,
			seed: 2026,
		},
	},
	{
		id: "chaos",
		name: "Хаос",
		maxPlayers: 8,
		base: 5,
		arena: {
			width: 1600,
			height: 900,
			asteroids: 9,
			homingChance: 0.5,
			seed: 7,
		},
	},
	{
		id: "wide",
		name: "Широка арена",
		maxPlayers: 6,
		base: 2,
		arena: {
			width: 2200,
			height: 1100,
			asteroids: 7,
			homingChance: 0.25,
			seed: 99,
		},
	},
	{
		id: "tournament",
		name: "Турнір (заповнено)",
		maxPlayers: 8,
		base: 8,
		arena: {
			width: 1600,
			height: 900,
			asteroids: 6,
			homingChance: 0.3,
			seed: 5,
		},
	},
];

const flakyCounts = new Map();

export function roomsSnapshot(now = Date.now()) {
	const tick = Math.floor(now / 4000); // кожні 4 с «хтось зайшов або вийшов»
	return {
		serverTime: new Date(now).toISOString(),
		rooms: ROOMS.map(({ base, ...room }, i) => ({
			...room,
			players:
				base >= room.maxPlayers
					? room.maxPlayers
					: Math.min(room.maxPlayers - 1, base + ((tick + i) % 3)),
		})),
	};
}

function sendJson(res, status, body) {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function wait(ms, res) {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		res.on("close", () => {
			clearTimeout(timer);
			resolve();
		});
	});
}

// publicDir: якщо задано, відсутній файл у /assets/ отримує справжній 404.
// Без цього Vite для неіснуючої адреси віддає index.html зі статусом 200
// (SPA fallback) — і «картинка» приходить як HTML-сторінка.
export function createDevApiHandler({ publicDir } = {}) {
	return (req, res, next) => handle(req, res, next, publicDir);
}

export const devApiHandler = createDevApiHandler();

function assetMissing(publicDir, pathname) {
	if (!publicDir || !pathname.startsWith("/assets/")) return false;
	const root = resolve(publicDir);
	const file = resolve(join(root, decodeURIComponent(pathname)));
	return !file.startsWith(root) || !existsSync(file);
}

async function handle(req, res, next, publicDir) {
	const url = new URL(req.url, "http://localhost");
	const q = url.searchParams;

	const delay = Math.min(Number(q.get("delay")) || 0, 60_000);
	if (delay > 0) {
		await wait(delay, res);
		if (res.destroyed || res.writableEnded) return; // клієнт уже скасував запит
	}

	const status = Number(q.get("status")) || 0;
	if (status >= 400)
		return sendJson(res, status, { error: `forced ${status}` });

	const flaky = Number(q.get("flaky")) || 0;
	if (flaky > 0) {
		const key = `${url.pathname}|${q.get("key") ?? ""}`;
		const count = (flakyCounts.get(key) ?? 0) + 1;
		flakyCounts.set(key, count);
		if (count <= flaky)
			return sendJson(res, 503, { error: `flaky ${count}/${flaky}` });
	}

	if (q.has("corrupt")) return sendJson(res, 200, '{"width": 1600, "height": ');

	if (q.has("html")) {
		res.statusCode = 200;
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.end("<!doctype html><html><body>не картинка</body></html>");
		return;
	}

	if (url.pathname === "/api/rooms") return sendJson(res, 200, roomsSnapshot());

	if (assetMissing(publicDir, url.pathname))
		return sendJson(res, 404, { error: `not found: ${url.pathname}` });

	next();
}

// Vite-плагін: той самий обробник і для `npm run dev`, і для `npm run preview`
export function devApi() {
	return {
		name: "dogfight-dev-api",
		configureServer(server) {
			server.middlewares.use(
				createDevApiHandler({ publicDir: server.config.publicDir }),
			);
		},
		configurePreviewServer(server) {
			server.middlewares.use(
				createDevApiHandler({ publicDir: server.config.publicDir }),
			);
		},
	};
}
