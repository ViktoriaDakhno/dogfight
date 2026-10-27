// HUD — підписник шини подій. Симуляція не знає про нього, лише шле
// "scored", "hit", "exploded", "picked"; HUD вирішує, що з цим показати.
const POPUP_MS = 900;
const FEED_MS = 3500;

export function createHud(events, { player }) {
	const popups = []; // «+50» над місцем влучання
	const feed = []; // стрічка подій у кутку
	let damageFlashUntil = 0;

	const now = () => performance.now();
	const say = (text, color = "#e8f1ff") => {
		feed.push({ text, color, at: now() });
		if (feed.length > 5) feed.shift();
	};

	events.addEventListener("scored", (e) => {
		const { id, points, x, y } = e.detail;
		if (id !== player.id || x === undefined) return;
		popups.push({ text: `+${points}`, x, y, at: now() });
	});
	events.addEventListener("hit", (e) => {
		if (e.detail.targetId === player.id) damageFlashUntil = now() + 200;
	});
	events.addEventListener("exploded", (e) => {
		const { kind, id, sourceId } = e.detail;
		if (kind !== "ship") return;
		if (id === player.id) say("Вас збито! Респаун через 2 с", "#ff6b6b");
		else if (sourceId === player.id) say("Дрона збито: +100", "#9fe870");
	});
	events.addEventListener("picked", (e) => {
		if (e.detail.holderId !== player.id) return;
		const names = {
			shield: "Щит",
			rapid: "Швидкострільність",
			homing: "Самонавідні кулі",
		};
		say(`Підібрано: ${names[e.detail.type] ?? e.detail.type}`, "#c792ea");
	});

	return {
		// у координатах арени (викликається всередині трансформації арени)
		drawWorld(ctx) {
			const t = now();
			ctx.font = "bold 18px monospace";
			ctx.textAlign = "center";
			for (let i = popups.length - 1; i >= 0; i--) {
				const p = popups[i];
				const k = (t - p.at) / POPUP_MS;
				if (k >= 1) {
					popups.splice(i, 1);
					continue;
				}
				ctx.globalAlpha = 1 - k;
				ctx.fillStyle = "#ffd166";
				ctx.fillText(p.text, p.x, p.y - 20 - k * 30);
			}
			ctx.globalAlpha = 1;
		},

		// у координатах екрана
		drawScreen(ctx, stats, { world, room, audio }, view) {
			const t = now();
			if (t < damageFlashUntil) {
				ctx.fillStyle = "rgba(255, 60, 60, 0.15)";
				ctx.fillRect(0, 0, view.width, view.height);
			}

			ctx.textAlign = "left";
			ctx.textBaseline = "alphabetic";
			ctx.font = "14px monospace";
			ctx.fillStyle = "#9fe870";
			ctx.fillText(`steps/s: ${stats.stepsPerSec.toFixed(1)}`, 12, 22);
			ctx.fillText(`frames/s: ${stats.framesPerSec.toFixed(1)}`, 12, 40);
			ctx.fillText(`frame: ${stats.frameMs.toFixed(1)} ms`, 12, 58);

			ctx.fillStyle = "#e8f1ff";
			ctx.fillText(
				`${player.name} · score: ${world.scores.get(player.id) ?? 0}`,
				12,
				84,
			);
			ctx.fillText(`hp: ${player.hp}   deaths: ${player.deaths}`, 12, 102);
			ctx.fillText(`entities: ${world.size}`, 12, 120);

			const effects = [...player.effects]
				.map(([type, left]) => `${type} ${left.toFixed(1)}s`)
				.join("  ");
			if (effects) {
				ctx.fillStyle = "#c792ea";
				ctx.fillText(effects, 12, 138);
			}

			ctx.textAlign = "right";
			ctx.fillStyle = "#9aa7bd";
			ctx.fillText(`кімната: ${room.name}`, view.width - 12, 22);
			ctx.fillText(`звук: ${audio.label}`, view.width - 12, 40);
			for (let i = feed.length - 1, row = 0; i >= 0; i--, row++) {
				const item = feed[i];
				const age = t - item.at;
				if (age > FEED_MS) {
					feed.splice(i, 1);
					continue;
				}
				ctx.globalAlpha = 1 - Math.max(0, age - FEED_MS + 800) / 800;
				ctx.fillStyle = item.color;
				ctx.fillText(item.text, view.width - 12, 66 + row * 18);
			}
			ctx.globalAlpha = 1;

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
				"←/→ A/D поворот · ↑/W тяга · Space стрільба · клік — постріл · M звук · pickup: S щит, R швидкострільність, H самонавідні",
				12,
				view.height - 12,
			);
		},
	};
}
