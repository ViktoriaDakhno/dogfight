// Маленькі асинхронні цеглинки, спільні для завантаження, лобі й UI.

// Пауза, яку можна перервати сигналом (інакше скасоване завантаження
// ще секунду «спало б» між спробами).
export function sleep(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		function onAbort() {
			clearTimeout(timer);
			reject(signal.reason);
		}
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

// Подія → проміс: дочекатися ОДНОГО спрацювання події.
// Проміс «пам'ятає» результат, подія — ні (notes §7).
export function once(target, type, { signal } = {}) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}
		target.addEventListener(type, resolve, { once: true, signal });
		signal?.addEventListener("abort", () => reject(signal.reason), {
			once: true,
		});
	});
}
