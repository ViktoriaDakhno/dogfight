// Спрайтшит = одна картинка з кадрами однакового розміру в один рядок.
// drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) вирізає кадр (source rect) і малює його.
export function createSprites(images, manifest) {
	const sheets = new Map();
	for (const item of manifest.items) {
		const img = images.get(item.id);
		if (item.type !== "image" || !img) continue; // не завантажився → has() поверне false → векторна заміна
		const [fw, fh] = item.frameSize;
		sheets.set(item.id, {
			img,
			fw,
			fh,
			frames: new Map(item.frames.map((name, i) => [name, i])),
		});
	}

	return {
		has: (id) => sheets.has(id),

		// size — сторона кадру на екрані (в одиницях арени), angle — поворот навколо центру
		draw(ctx, id, frame, x, y, size, angle = 0) {
			const sheet = sheets.get(id);
			const index = sheet?.frames.get(frame);
			if (index === undefined) return false;
			ctx.save();
			ctx.translate(x, y);
			if (angle) ctx.rotate(angle);
			ctx.drawImage(
				sheet.img,
				index * sheet.fw,
				0,
				sheet.fw,
				sheet.fh,
				-size / 2,
				-size / 2,
				size,
				size,
			);
			ctx.restore();
			return true;
		},
	};
}

// Порожні спрайти: рендер малює все векторно (як у Lab 2)
export const NO_SPRITES = { has: () => false, draw: () => false };
