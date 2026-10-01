export function createLoop({ step = 1 / 60, simulate, render }) {
	let accumulator = 0;
	let last = 0;
	let rafId = null;

	const stats = { stepsPerSec: 0, framesPerSec: 0, frameMs: 0 };
	let stepsCount = 0;
	let framesCount = 0;
	let windowStart = 0;

	function frame(now) {
		const frameMs = Math.max(0, now - last);
		last = now;
		stats.frameMs = frameMs;

		// обмеження 0.25 с: після «зависання» не намагаємось наздогнати все
		accumulator += Math.min(frameMs / 1000, 0.25);

		while (accumulator >= step) {
			simulate(step);
			stepsCount++;
			accumulator -= step;
		}

		render(accumulator / step); // alpha
		framesCount++;

		// раз на секунду оновлюємо лічильники для HUD
		if (now - windowStart >= 1000) {
			const sec = (now - windowStart) / 1000;
			stats.stepsPerSec = stepsCount / sec;
			stats.framesPerSec = framesCount / sec;
			stepsCount = 0;
			framesCount = 0;
			windowStart = now;
		}

		rafId = requestAnimationFrame(frame);
	}

	function start() {
		if (rafId !== null) return;
		last = performance.now();
		windowStart = last;
		accumulator = 0;
		rafId = requestAnimationFrame(frame);
	}

	function stop() {
		cancelAnimationFrame(rafId);
		rafId = null;
	}

	return { start, stop, stats };
}
