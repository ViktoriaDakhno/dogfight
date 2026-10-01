import { createInput } from "./input.js";
import { createLoop } from "./loop.js";
import { setupCanvas } from "./render/canvas.js";
import {
	drawBackground,
	drawHud,
	drawShip,
	interpolateShip,
} from "./render/draw.js";
import { ARENA } from "./sim/arena.js";
import { createShip, integrate } from "./sim/ship.js";

const canvas = document.querySelector("#game");
const { ctx, view } = setupCanvas(canvas);
const input = createInput(window);

let previous = createShip();
let current = previous;

const loop = createLoop({
	simulate(dt) {
		previous = current;
		current = integrate(current, input, dt);
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
		drawShip(ctx, interpolateShip(previous, current, alpha));
		ctx.restore();

		drawHud(ctx, loop.stats);
	},
});

loop.start();
