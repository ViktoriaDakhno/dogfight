import { applyFaults, parseFaults, runBench } from "./assets/faults.js";
import { explainError, isRetryable } from "./assets/http.js";
import { loadAll, loadJson } from "./assets/loader.js";
import { once, sleep } from "./async.js";
import { createAudio, createDecodeContext } from "./audio.js";
import { createInput } from "./input.js";
import { Lobby } from "./lobby/lobby.js";
import { mountLobbyView } from "./lobby/lobby-view.js";
import { createLoop } from "./loop.js";
import { setupCanvas } from "./render/canvas.js";
import { drawBackground, drawEntity } from "./render/draw.js";
import { createHud } from "./render/hud.js";
import {
	createLoadingState,
	drawBackdrop,
	drawLoading,
} from "./render/loading.js";
import { createSprites } from "./render/sprites.js";
import { ARENA, configureArena } from "./sim/arena.js";
import { createGame } from "./sim/game.js";
import { showPanel } from "./ui/panel.js";

const canvas = document.querySelector("#game");
const ui = document.querySelector("#ui");
const { ctx, view } = setupCanvas(canvas);
const params = new URLSearchParams(location.search);
const faults = parseFaults(location.search);
const decodeCtx = createDecodeContext();

// маленький rAF-цикл для екранів до гри (завантаження)
function runScreen(draw) {
	let id = 0;
	const frame = () => {
		draw();
		id = requestAnimationFrame(frame);
	};
	id = requestAnimationFrame(frame);
	return () => cancelAnimationFrame(id);
}

// ---------- 1. Завантаження ----------
async function loadAssets() {
	for (let round = 1; ; round++) {
		const state = createLoadingState(round);
		const stopScreen = runScreen(() => drawLoading(ctx, view, state));
		const controller = new AbortController();
		const onKey = (e) => {
			if (e.key === "Escape")
				controller.abort(new DOMException("натиснуто Esc", "AbortError"));
		};
		window.addEventListener("keydown", onKey);
		const active = round === 1 ? faults : new Set(); // збій лише на першу спробу

		try {
			const manifest = await loadJson("/assets/manifest.json", {
				signal: controller.signal,
			});

			if (params.has("bench") && round === 1) {
				state.message = "вимірюю sequential vs concurrent…";
				state.bench = await runBench(manifest, { audioCtx: decodeCtx });
				console.table(state.bench);
			}

			const { plan, options } = applyFaults(manifest, active);
			if (options.abortAfterMs)
				setTimeout(
					() =>
						controller.abort(
							new DOMException(
								"?fault=abort: скасовано посеред завантаження",
								"AbortError",
							),
						),
					options.abortAfterMs,
				);

			state.total = plan.items.length;
			state.message = "завантажую ассети…";
			const started = performance.now();
			const assets = await loadAll(plan, {
				signal: controller.signal,
				audioCtx: decodeCtx,
				timeoutMs: options.timeoutMs,
				onProgress: (p) => Object.assign(state, p),
				onItem: (item, info) => {
					state.items.set(item.id, info);
					if (info.status === "retry")
						console.warn(
							`[loading] ${item.id}: ${info.error.message} → спроба ${info.attempt + 1}/${info.of} через ${info.delay} мс`,
						);
				},
			});
			const total = Math.round(performance.now() - started);
			state.message = `готово за ${total} мс`;
			console.info(`[loading] ${plan.items.length} файлів за ${total} мс`);

			if (state.bench) {
				await showPanel(ui, {
					tone: "info",
					docked: true,
					title: "Sequential vs concurrent",
					lines: [
						`Той самий пак з ${plan.items.length} файлів, без кешу:`,
						...state.bench.map(
							(r) =>
								`${r.mode === "sequential" ? "for + await" : "Promise.all"}, затримка ${r.delayMs} мс/файл → ${r.ms} мс`,
						),
					],
					buttons: [{ text: "Продовжити", value: "ok" }],
				});
			}

			if (assets.failures.length > 0) {
				const choice = await showPanel(ui, {
					tone: "warning",
					docked: true,
					title: "Деякі файли не завантажились",
					lines: [
						...assets.failures.map(
							(f) => `${f.item.id}: ${explainError(f.error).text}`,
						),
						"Гра працюватиме без них: векторна графіка замість спрайта, тиша замість звуку.",
					],
					buttons: [
						{ text: "Продовжити без них", value: "continue" },
						{ text: "Спробувати ще раз", value: "retry" },
					],
				});
				if (choice === "retry") continue;
			} else {
				await sleep(250); // щоб 100% встигли намалюватись
			}
			return { manifest: plan, ...assets };
		} catch (error) {
			const aborted = controller.signal.aborted;
			state.message = aborted ? "скасовано" : "помилка";
			state.failed = true;
			console.error("[loading]", error);
			await showPanel(ui, {
				docked: true,
				title: aborted
					? "Завантаження скасовано"
					: "Не вдалося завантажити гру",
				lines: [
					aborted
						? `Причина: ${controller.signal.reason?.message}`
						: explainError(error).text,
					aborted
						? "Незавершені запити зупинено через AbortController."
						: isRetryable(error.cause ?? error)
							? "Збій тимчасовий: зроблено кілька спроб з backoff, сервер так і не відповів."
							: "Повтор тут не допоможе (файл відсутній або зіпсований), тому спроба була одна.",
				],
				buttons: [{ text: "Спробувати ще раз", value: "retry" }],
			});
		} finally {
			stopScreen();
			window.removeEventListener("keydown", onKey);
		}
	}
}

// ---------- 2. Лобі ----------
function lobbyUrl() {
	switch (params.get("lobby")) {
		case "lag":
			return "/api/rooms?delay=1500"; // відповідає, але повільно: зручно ловити abort при виході
		case "slow":
			return "/api/rooms?delay=4000"; // довше за таймаут 2.5 с
		case "down":
			return "/api/rooms?status=503";
		case "badjson":
			return "/api/rooms?corrupt=1";
		default:
			return "/api/rooms";
	}
}

async function chooseRoom({ warnings, audio }) {
	const lobby = new Lobby({
		url: lobbyUrl(),
		intervalMs: 3000,
		timeoutMs: 2500,
	});
	const lobbyView = mountLobbyView(ui, lobby, { warnings });
	const stopScreen = runScreen(() => drawBackdrop(ctx, view));
	lobby.addEventListener("aborted", (e) =>
		console.info("[lobby] запит скасовано:", e.detail.reason?.message),
	);
	// "join" диспетчеризується синхронно всередині обробника кліку →
	// unlock() викликається в межах жесту гравця
	lobby.addEventListener("join", () => audio.unlock());
	lobby.start();
	try {
		const event = await once(lobby, "join");
		return event.detail;
	} finally {
		stopScreen();
		lobbyView.unmount();
	}
}

// ---------- 3. Гра ----------
function startGame({ assets, room, name, audio }) {
	configureArena(assets.data.get("arena"), room.arena);
	const sprites = createSprites(assets.images, assets.manifest);
	const { world, player } = createGame({
		seed: room.arena.seed,
		asteroids: room.arena.asteroids,
		homingChance: room.arena.homingChance,
		playerName: name,
	});

	// підписники шини подій: симуляція їх не імпортує
	audio.connect(world.events, { playerId: player.id });
	const hud = createHud(world.events, { player });

	const input = createInput(window);
	const inputs = new Map([[player.id, input]]);

	// ---- this у колбеках (Lab 2) ----
	// БАГ (демонстрація, ?bug): передаємо функцію, а не виклик → this === window
	if (params.has("bug")) window.addEventListener("keydown", player.fire);
	// ФІКС: стрілка-обгортка, this === player
	canvas.addEventListener("pointerdown", () => player.fire());

	// запасний unlock: якщо браузер не дав звук на кліку «Приєднатися»
	window.addEventListener("pointerdown", () => audio.unlock());
	window.addEventListener("keydown", (e) => {
		audio.unlock();
		if (e.code === "KeyM") audio.toggleMute();
	});

	if (import.meta.env?.DEV) window.game = { world, player, assets, audio };

	const loop = createLoop({
		simulate(dt) {
			world.step(dt, inputs);
			input.endFrame();
		},
		render(alpha) {
			ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
			ctx.clearRect(0, 0, view.width, view.height);

			// арена масштабується під вікно й центрується
			const MARGIN = 24;
			const scale = Math.min(
				(view.width - MARGIN * 2) / ARENA.width,
				(view.height - MARGIN * 2) / ARENA.height,
			);
			ctx.save();
			ctx.translate(
				(view.width - ARENA.width * scale) / 2,
				(view.height - ARENA.height * scale) / 2,
			);
			ctx.scale(scale, scale);
			ctx.beginPath();
			ctx.rect(0, 0, ARENA.width, ARENA.height);
			ctx.clip();

			drawBackground(ctx);
			for (const entity of world) drawEntity(ctx, entity, alpha, sprites);
			hud.drawWorld(ctx);
			ctx.restore();

			hud.drawScreen(ctx, loop.stats, { world, room, audio }, view);
		},
	});
	loop.start();
}

// ---------- старт ----------
async function boot() {
	const assets = await loadAssets(); // гра не стартує, доки ассети не готові
	const audio = createAudio(assets.sounds);
	const warnings = assets.failures.map(
		(f) =>
			`${f.item.id} не завантажено (${explainError(f.error).kind}) — використано заміну`,
	);
	const { room, name } = await chooseRoom({ warnings, audio });
	startGame({ assets, room, name, audio });
}

boot().catch((error) => {
	console.error("[boot]", error);
	showPanel(ui, {
		title: "Неочікувана помилка",
		lines: [String(error?.message ?? error)],
		buttons: [{ text: "Перезавантажити", value: "reload" }],
	}).then(() => location.reload());
});
