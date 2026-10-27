import { loadAll } from "./loader.js";

// Навмисні збої для галереї помилок. Вмикаються параметром адреси:
//   ?fault=404       спрайт астероїдів не існує          → гра стартує з векторною заміною
//   ?fault=html      200 OK, але замість PNG прийшов HTML  → «файл не є картинкою», без повторів
//   ?fault=slow      спрайт кораблів їде 3 с               → видно прогрес-бар
//   ?fault=timeout   arena.json не відповідає              → 3 спроби по 2 с → кнопка Retry
//   ?fault=badjson   arena.json битий                      → без повторів → кнопка Retry
//   ?fault=flaky     arena.json двічі віддає 503           → retry з backoff → успіх
//   ?fault=abort     усе повільне, через 0.8 с abort()     → «скасовано» → кнопка Retry
// Можна поєднувати: ?fault=404,slow. Збій діє лише на ПЕРШУ спробу:
// після «Спробувати ще раз» завантаження проходить нормально.
export const FAULTS = [
	"404",
	"html",
	"slow",
	"timeout",
	"badjson",
	"flaky",
	"abort",
];

export function parseFaults(search) {
	const raw = new URLSearchParams(search).get("fault") ?? "";
	return new Set(
		raw
			.split(",")
			.map((s) => s.trim())
			.filter((s) => FAULTS.includes(s)),
	);
}

export function withQuery(url, params) {
	const [path, query = ""] = url.split("?");
	const q = new URLSearchParams(query);
	for (const [k, v] of Object.entries(params)) q.set(k, String(v));
	return `${path}?${q}`;
}

// Повертає НОВИЙ маніфест (оригінал не мутуємо) і налаштування завантаження
export function applyFaults(manifest, faults) {
	const plan = structuredClone(manifest);
	const byId = new Map(plan.items.map((item) => [item.id, item]));
	const options = { timeoutMs: 4000, abortAfterMs: null };

	if (faults.has("404"))
		byId.get("asteroids").url = "sprites/asteroids-missing.png";
	if (faults.has("html"))
		byId.get("asteroids").url = withQuery(byId.get("asteroids").url, {
			html: 1,
		});
	if (faults.has("slow"))
		byId.get("ships").url = withQuery(byId.get("ships").url, { delay: 3000 });
	if (faults.has("timeout")) {
		byId.get("arena").url = withQuery(byId.get("arena").url, { delay: 60000 });
		options.timeoutMs = 2000;
	}
	if (faults.has("badjson"))
		byId.get("arena").url = withQuery(byId.get("arena").url, { corrupt: 1 });
	if (faults.has("flaky")) {
		const key = Math.random().toString(36).slice(2); // окремий лічильник збоїв для кожного запуску
		byId.get("arena").url = withQuery(byId.get("arena").url, { flaky: 2, key });
	}
	if (faults.has("abort")) {
		for (const item of plan.items)
			item.url = withQuery(item.url, { delay: 2500 });
		options.abortAfterMs = 800;
	}
	return { plan, options };
}

// ---------- sequential vs concurrent ----------
// ?bench: той самий пак вантажиться двома способами, без кешу.
// delayMs імітує повільну мережу: кожен файл «їде» delayMs мілісекунд.
export async function runBench(manifest, { audioCtx, delays = [0, 200] } = {}) {
	const rows = [];
	for (const delayMs of delays) {
		const plan = structuredClone(manifest);
		if (delayMs > 0)
			for (const item of plan.items)
				item.url = withQuery(item.url, { delay: delayMs });
		for (const mode of ["sequential", "concurrent"]) {
			const started = performance.now();
			await loadAll(plan, { mode, audioCtx, cache: "no-store" });
			rows.push({
				mode,
				delayMs,
				files: plan.items.length,
				ms: Math.round(performance.now() - started),
			});
		}
	}
	return rows;
}
