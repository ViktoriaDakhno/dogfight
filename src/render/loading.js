import { explainError } from "../assets/http.js";

// Стан екрана завантаження — звичайний об'єкт, який оновлюють колбеки loadAll.
export function createLoadingState(round) {
	return {
		round,
		fraction: 0,
		done: 0,
		total: 0,
		items: new Map(), // id → { status, attempt, delay, ms, error }
		bench: null,
		failed: false,
		message: "Завантажую маніфест…",
	};
}

// Тло під лобі: повільно дрейфуюча сітка, щоб екран не виглядав «застиглим»
export function drawBackdrop(ctx, view, t = performance.now()) {
	ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
	ctx.fillStyle = "#0b0f1a";
	ctx.fillRect(0, 0, view.width, view.height);
	const step = 60;
	const shift = (t / 80) % step;
	ctx.strokeStyle = "#151f36";
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let x = -step + shift; x < view.width; x += step) {
		ctx.moveTo(x, 0);
		ctx.lineTo(x, view.height);
	}
	for (let y = -step + shift; y < view.height; y += step) {
		ctx.moveTo(0, y);
		ctx.lineTo(view.width, y);
	}
	ctx.stroke();
}

const ICONS = { loading: "…", retry: "⟳", ok: "✓", failed: "✗" };
const COLORS = {
	loading: "#9aa7bd",
	retry: "#ffd166",
	ok: "#9fe870",
	failed: "#ff6b6b",
};

function describe(info) {
	switch (info.status) {
		case "ok":
			return `${Math.round(info.ms)} мс${info.retries ? ` (після ${info.retries} повт.)` : ""}`;
		case "retry":
			return `спроба ${info.attempt + 1}/${info.of} через ${info.delay} мс (${explainError(info.error).kind})`;
		case "failed":
			return `${explainError(info.error).text}${info.retries ? ` · спроб: ${info.retries + 1}` : " · без повторів"}`;
		default:
			return "завантаження";
	}
}

export function drawLoading(ctx, view, state) {
	ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
	ctx.fillStyle = "#0b0f1a";
	ctx.fillRect(0, 0, view.width, view.height);

	const w = Math.min(560, view.width - 48);
	const x = (view.width - w) / 2;
	let y = Math.max(60, view.height / 2 - 200);

	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = "#e8f1ff";
	ctx.font = "bold 32px monospace";
	ctx.fillText("DOGFIGHT", view.width / 2, y);
	y += 36;

	// справжній прогрес-бар: частка файлів, що вже завершились
	ctx.fillStyle = "#1e2a45";
	ctx.fillRect(x, y, w, 18);
	ctx.fillStyle = state.failed ? "#ff6b6b" : "#5ec8ff";
	ctx.fillRect(x, y, w * state.fraction, 18);
	ctx.strokeStyle = "#4a6fa5";
	ctx.lineWidth = 1;
	ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 17);
	y += 40;

	ctx.font = "14px monospace";
	ctx.fillStyle = "#9aa7bd";
	const percent = Math.round(state.fraction * 100);
	ctx.fillText(
		`${percent}% · ${state.done}/${state.total || "?"} файлів · ${state.message}`,
		view.width / 2,
		y,
	);
	y += 28;

	ctx.textAlign = "left";
	for (const [id, info] of state.items) {
		ctx.fillStyle = COLORS[info.status];
		ctx.fillText(
			`${ICONS[info.status]} ${id.padEnd(10)} ${describe(info)}`,
			x,
			y,
		);
		y += 20;
	}

	if (state.bench) {
		y += 12;
		ctx.fillStyle = "#e8f1ff";
		ctx.fillText("sequential vs concurrent (без кешу):", x, y);
		y += 20;
		for (const row of state.bench) {
			ctx.fillStyle = row.mode === "concurrent" ? "#9fe870" : "#ffd166";
			ctx.fillText(
				`${row.mode.padEnd(11)} затримка ${String(row.delayMs).padStart(3)} мс/файл → ${row.ms} мс`,
				x,
				y,
			);
			y += 20;
		}
	}

	ctx.textAlign = "center";
	ctx.fillStyle = "#6b7a99";
	ctx.font = "12px monospace";
	ctx.fillText(
		`Esc — скасувати · спроба завантаження №${state.round}`,
		view.width / 2,
		view.height - 16,
	);
}
