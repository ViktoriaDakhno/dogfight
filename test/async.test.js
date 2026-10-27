import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { createDevApiHandler, devApiHandler } from "../dev/dev-api.js";
import { applyFaults, parseFaults } from "../src/assets/faults.js";
import {
	backoffDelay,
	fetchJson,
	HttpError,
	isRetryable,
} from "../src/assets/http.js";
import { loadAll, loadJson } from "../src/assets/loader.js";
import { once, sleep } from "../src/async.js";
import { Lobby, parseRooms } from "../src/lobby/lobby.js";
import { Ship } from "../src/sim/ship.js";
import { Vector2 } from "../src/sim/vector.js";
import { World } from "../src/sim/world.js";

// Справжній HTTP-сервер з тим самим middleware, що підключає Vite
let server;
let base;
let hits = 0;
before(async () => {
	server = createServer((req, res) => {
		hits++;
		devApiHandler(req, res, () => {
			if (req.url.startsWith("/ok.json")) {
				res.setHeader("Content-Type", "application/json");
				res.end('{"ok":true}');
			} else {
				res.statusCode = 404;
				res.end("not found");
			}
		});
	});
	await new Promise((r) => server.listen(0, r));
	base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const count = async (fn) => {
	const start = hits;
	try {
		return { value: await fn(), requests: hits - start };
	} catch (error) {
		return { error, requests: hits - start };
	}
};

test("fetchJson: 404 — це НЕ reject від fetch, а наша HttpError після перевірки ok", async () => {
	const res = await fetch(`${base}/missing.json`); // fetch виконався
	assert.equal(res.ok, false);
	assert.equal(res.status, 404);
	await assert.rejects(fetchJson(`${base}/missing.json`), HttpError);
});

test("withRetry: 4xx не повторюється — рівно один запит", async () => {
	const r = await count(() => loadJson(`${base}/missing.json`, { baseMs: 1 }));
	assert.equal(r.error.status, 404);
	assert.equal(r.requests, 1);
});

test("withRetry: 503 двічі, потім успіх — три запити, затримки зростають", async () => {
	const delays = [];
	const r = await count(() =>
		loadJson(`${base}/ok.json?flaky=2&key=t1`, {
			baseMs: 20,
			random: () => 1, // без jitter, щоб перевірити саму експоненту
			onRetry: ({ delay }) => delays.push(delay),
		}),
	);
	assert.deepEqual(r.value, { ok: true });
	assert.equal(r.requests, 3);
	assert.deepEqual(delays, [20, 40]);
});

test("backoff з jitter: у межах [½·2^n·base, 2^n·base], не більше maxMs", () => {
	for (let attempt = 0; attempt < 6; attempt++) {
		const full = Math.min(1000, 100 * 2 ** attempt);
		assert.equal(
			backoffDelay(attempt, { baseMs: 100, maxMs: 1000, random: () => 0 }),
			full / 2,
		);
		assert.equal(
			backoffDelay(attempt, { baseMs: 100, maxMs: 1000, random: () => 1 }),
			full,
		);
	}
});

test("таймаут: AbortSignal.timeout → TimeoutError, повторюється, потім здається", async () => {
	const retries = [];
	const r = await count(() =>
		loadJson(`${base}/ok.json?delay=1000`, {
			timeoutMs: 80,
			attempts: 2,
			baseMs: 10,
			onRetry: (info) => retries.push(info.error.name),
		}),
	);
	assert.equal(r.error.name, "TimeoutError");
	assert.deepEqual(retries, ["TimeoutError"]);
	assert.equal(r.requests, 2);
});

test("abort посеред запиту: AbortError, без повторів", async () => {
	const controller = new AbortController();
	setTimeout(() => controller.abort(), 50);
	const r = await count(() =>
		loadJson(`${base}/ok.json?delay=2000`, { signal: controller.signal }),
	);
	assert.equal(r.error.name, "AbortError");
	assert.equal(r.requests, 1);
});

test("битий JSON: SyntaxError, без повторів", async () => {
	const r = await count(() => loadJson(`${base}/ok.json?corrupt=1`));
	assert.equal(r.error.name, "SyntaxError");
	assert.equal(r.requests, 1);
	assert.equal(isRetryable(r.error), false);
});

test("sleep переривається сигналом", async () => {
	const controller = new AbortController();
	const started = performance.now();
	setTimeout(() => controller.abort(), 20);
	await assert.rejects(sleep(5000, controller.signal), { name: "AbortError" });
	assert.ok(performance.now() - started < 1000);
});

// ---------- loadAll ----------
const fakeLoaders = (log) => ({
	json: (url, opts) => loadJson(`${base}${url}`, { ...opts, baseMs: 5 }),
	image: (url, opts) => {
		log?.push(url);
		return loadJson(`${base}${url}`, { ...opts, baseMs: 5 });
	},
	sound: (url, opts) => loadJson(`${base}${url}`, { ...opts, baseMs: 5 }),
});

const pack = (n, delay) => ({
	baseUrl: "/",
	items: Array.from({ length: n }, (_, i) => ({
		id: `f${i}`,
		type: "image",
		url: `ok.json?delay=${delay}&i=${i}`,
	})),
});

test("loadAll: прогрес по кожному файлу, concurrent швидше за sequential", async () => {
	const progress = [];
	let t = performance.now();
	await loadAll(pack(5, 100), {
		loaders: fakeLoaders(),
		onProgress: (p) => progress.push(p.done),
	});
	const concurrent = performance.now() - t;
	assert.deepEqual(progress, [1, 2, 3, 4, 5]);

	t = performance.now();
	await loadAll(pack(5, 100), { loaders: fakeLoaders(), mode: "sequential" });
	const sequential = performance.now() - t;

	assert.ok(concurrent < 300, `concurrent ${concurrent}`);
	assert.ok(sequential >= 500, `sequential ${sequential}`);
});

test("loadAll: некритичний 404 → failures, пак завершується", async () => {
	const manifest = {
		baseUrl: "/",
		items: [
			{ id: "arena", type: "json", url: "ok.json", critical: true },
			{ id: "rocks", type: "image", url: "nope.png" },
		],
	};
	const result = await loadAll(manifest, { loaders: fakeLoaders() });
	assert.deepEqual(result.data.get("arena"), { ok: true });
	assert.equal(result.failures.length, 1);
	assert.equal(result.failures[0].error.status, 404);
});

test("loadAll: критичний збій відхиляє пак і скасовує сусідів", async () => {
	const manifest = {
		baseUrl: "/",
		items: [
			{ id: "arena", type: "json", url: "ok.json?corrupt=1", critical: true },
			{ id: "slow", type: "image", url: "ok.json?delay=3000" },
		],
	};
	const statuses = [];
	const started = performance.now();
	await assert.rejects(
		loadAll(manifest, {
			loaders: fakeLoaders(),
			onItem: (item, info) => statuses.push(`${item.id}:${info.status}`),
		}),
		{ name: "AssetError" },
	);
	await sleep(30); // дати «сусіду» обробити abort
	assert.ok(performance.now() - started < 1000, "повільний файл не чекали 3 с");
	assert.ok(statuses.includes("slow:failed"), "сусіда скасовано");
});

test("faults: збої змінюють копію маніфесту, не оригінал", () => {
	const manifest = JSON.parse(
		readFileSync("public/assets/manifest.json", "utf8"),
	);
	const before = JSON.stringify(manifest);
	const { plan, options } = applyFaults(
		manifest,
		parseFaults("?fault=404,timeout,nonsense"),
	);
	assert.equal(JSON.stringify(manifest), before);
	assert.match(plan.items.find((i) => i.id === "asteroids").url, /missing/);
	assert.match(plan.items.find((i) => i.id === "arena").url, /delay=60000/);
	assert.equal(options.timeoutMs, 2000);
});

// ---------- лобі ----------
test("Lobby: кімнати приходять подією rooms", async () => {
	const lobby = new Lobby({ url: `${base}/api/rooms`, intervalMs: 10_000 });
	const got = once(lobby, "rooms");
	lobby.start();
	const { detail } = await got;
	lobby.stop();
	assert.ok(detail.rooms.length >= 4);
	assert.ok(detail.rooms.every((r) => r.arena.width > 0));
});

test("Lobby: таймаут → подія error з kind timeout", async () => {
	const lobby = new Lobby({
		url: `${base}/api/rooms?delay=1000`,
		timeoutMs: 80,
		intervalMs: 10_000,
	});
	const got = once(lobby, "error");
	lobby.start();
	const { detail } = await got;
	lobby.stop();
	assert.equal(detail.kind, "timeout");
});

test("Lobby: вихід посеред запиту → aborted, а rooms вже ніколи не прийде", async () => {
	const lobby = new Lobby({
		url: `${base}/api/rooms?delay=300`,
		intervalMs: 50,
	});
	let roomsEvents = 0;
	lobby.addEventListener("rooms", () => roomsEvents++);
	const aborted = once(lobby, "aborted");
	lobby.start();
	await sleep(50);
	lobby.stop(); // гравець пішов
	const { detail } = await aborted;
	assert.equal(detail.reason.name, "AbortError");
	await sleep(500); // відповідь сервера «з того світу» вже нічого не змінить
	assert.equal(roomsEvents, 0);
	assert.equal(lobby.active, false);
});

test("Lobby: join зупиняє оновлення і віддає кімнату; повна кімната — ні", async () => {
	const lobby = new Lobby({ url: `${base}/api/rooms`, intervalMs: 10_000 });
	const got = once(lobby, "rooms");
	lobby.start();
	await got;
	assert.equal(lobby.join("tournament", "Віка"), false, "повна кімната");
	assert.equal(lobby.join("classic", "   "), false, "порожнє ім'я");
	const joined = once(lobby, "join");
	assert.equal(lobby.join("classic", " Віка "), true);
	const { detail } = await joined;
	assert.equal(detail.name, "Віка");
	assert.equal(detail.room.id, "classic");
	assert.equal(lobby.active, false);
});

test("parseRooms: перевіряє форму відповіді", () => {
	assert.throws(() => parseRooms({}), { name: "DataError" });
	assert.equal(
		parseRooms({
			rooms: [{ id: 1 }, { id: "a", name: "A", players: 1, maxPlayers: 2 }],
		}).length,
		1,
	);
});

// ---------- шина подій ----------
test("Симуляція шле fired / hit / exploded / scored через EventTarget", () => {
	const world = new World();
	const seen = [];
	for (const type of ["fired", "hit", "exploded", "scored"])
		world.events.addEventListener(type, (e) => seen.push([type, e.detail]));

	const shooter = world.spawn(
		new Ship({ pos: new Vector2(100, 100), angle: 0 }),
	);
	const target = world.spawn(new Ship({ pos: new Vector2(800, 450) }));
	target.invulnerable = 0;
	shooter.fire();
	assert.equal(seen[0][0], "fired");
	assert.equal(seen[0][1].ownerId, shooter.id);

	for (let i = 0; i < 4; i++) target.takeDamage(25, world, shooter.id);
	const types = seen.map(([t]) => t);
	assert.deepEqual(types, [
		"fired",
		"hit",
		"hit",
		"hit",
		"hit",
		"exploded",
		"scored",
	]);
	assert.equal(seen.at(-1)[1].total, 100);
});

test("Симуляція не імпортує звук, HUD чи DOM", () => {
	for (const file of readdirSync("src/sim")) {
		const code = readFileSync(`src/sim/${file}`, "utf8");
		const imports = [...code.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
		for (const path of imports)
			assert.match(path, /^\.\/[\w-]+\.js$/, `${file} імпортує ${path}`);
		assert.doesNotMatch(code, /\bdocument\.|\bwindow\./, `${file} чіпає DOM`);
	}
});

test("dev-api: відсутній ассет → справжній 404, а не index.html зі статусом 200", async () => {
	const handler = createDevApiHandler({ publicDir: "public" });
	const call = (url) =>
		new Promise((resolve) => {
			const res = {
				statusCode: 200,
				headers: {},
				setHeader(k, v) {
					this.headers[k.toLowerCase()] = v;
				},
				on() {},
				end(body) {
					resolve({
						status: this.statusCode,
						type: this.headers["content-type"],
						body,
					});
				},
			};
			handler({ url }, res, () => resolve({ status: "next" }));
		});
	assert.equal(
		(await call("/assets/sprites/ships.png")).status,
		"next",
		"існує → далі до Vite",
	);
	assert.equal(
		(await call("/assets/sprites/asteroids-missing.png")).status,
		404,
	);
	assert.equal(
		(await call("/assets/../package.json")).status,
		"next",
		"поза /assets — не наша справа",
	);
	const html = await call("/assets/sprites/ships.png?html=1");
	assert.equal(html.status, 200);
	assert.match(html.type, /text\/html/);
});
