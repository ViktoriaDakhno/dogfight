import { createInput } from "./input.js";
import { createLoop } from "./loop.js";
import { setupCanvas } from "./render/canvas.js";
import { drawBackground, drawEntity, drawHud } from "./render/draw.js";
import { ARENA } from "./sim/arena.js";
import { createGame } from "./sim/game.js";

const canvas = document.querySelector("#game");
const { ctx, view } = setupCanvas(canvas);
const input = createInput(window);

const { world, player } = createGame();
const inputs = new Map([[player.id, input]]); // id корабля → його керування

// ---- this у колбеках ----
// БАГ (навмисна демонстрація, відкрийте http://localhost:5173/?bug):
// передаємо саму функцію, а не виклик. Браузер викликає її як колбек події
// з this === window → у fire() рядок this.pos.add(...) падає з TypeError.
if (new URLSearchParams(location.search).has("bug")) {
	window.addEventListener("keydown", player.fire);
}
// ФІКС: стрілка-обгортка. Усередині — звичайний виклик player.fire(),
// зліва від крапки стоїть player, тому this === player.
canvas.addEventListener("pointerdown", () => player.fire());

// для дослідів у консолі під час захисту: game.player, game.world
if (import.meta.env?.DEV) window.game = { world, player };

const loop = createLoop({
	simulate(dt) {
		world.step(dt, inputs);
		input.endFrame();
	},
	render(alpha) {
		ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
		ctx.clearRect(0, 0, view.width, view.height);

		// арена масштабується під вікно й центрується
		const MARGIN = 24; // відступ від країв вікна, щоб межі арени було видно
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

		// обрізаємо все, що виходить за межі арени
		ctx.beginPath();
		ctx.rect(0, 0, ARENA.width, ARENA.height);
		ctx.clip();

		drawBackground(ctx);
		for (const entity of world) drawEntity(ctx, entity, alpha);
		ctx.restore();

		drawHud(ctx, loop.stats, { player, world }, view);
	},
});

loop.start();
