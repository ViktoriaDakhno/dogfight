// Детермінований генератор (mulberry32) як замикання над станом `s`.
// Однаковий seed → однакові астероїди й вибухи. Знадобиться в Lab 5 (клієнт і сервер
// мають отримати той самий світ), тому Math.random у симуляції не використовуємо.
export function createRng(seed = 1) {
	let s = seed >>> 0;

	function next() {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	return {
		next,
		range: (min, max) => min + (max - min) * next(),
		chance: (p) => next() < p,
		pick: (items) => items[Math.floor(next() * items.length)],
	};
}
