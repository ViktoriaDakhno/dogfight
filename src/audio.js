// Звук на Web Audio. Модуль слухає шину подій симуляції; симуляція про нього не знає.
//
// Два правила платформи:
//  1) AudioContext може грати лише після жесту гравця (клік/клавіша) — unlock().
//  2) Декодування — справжня робота, тож робимо його на екрані завантаження.
//     Для цього беремо OfflineAudioContext: він не грає звук, тому його можна
//     створити до кліку без попереджень браузера. AudioBuffer не прив'язаний
//     до контексту — потім його грає звичайний AudioContext.

export function createDecodeContext() {
	const Offline = globalThis.OfflineAudioContext;
	return Offline ? new Offline(1, 1, 44100) : null;
}

export function createAudio(buffers) {
	let ctx = null;
	let master = null;
	let muted = false;

	function unlock() {
		const AudioCtx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
		if (!AudioCtx) return Promise.resolve();
		if (!ctx) {
			ctx = new AudioCtx(); // створюємо всередині обробника кліку
			master = ctx.createGain();
			master.gain.value = 0.6;
			master.connect(ctx.destination);
		}
		return ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
	}

	function play(name, { volume = 1, rate = 1 } = {}) {
		if (muted || !ctx || ctx.state !== "running") return;
		const buffer = buffers.get(name);
		if (!buffer) return; // звук не завантажився — гра йде далі мовчки
		const source = ctx.createBufferSource(); // одноразовий вузол, буфер — багаторазовий
		source.buffer = buffer;
		source.playbackRate.value = rate;
		const gain = ctx.createGain();
		gain.gain.value = volume;
		source.connect(gain).connect(master);
		source.start();
	}

	// підписка на події симуляції: playerId — щоб не «стріляв» кожен корабель у вухо
	function connect(events, { playerId }) {
		const jitter = () => 0.94 + Math.random() * 0.12; // трохи різна висота — менш монотонно
		events.addEventListener("fired", (e) => {
			if (e.detail.ownerId === playerId)
				play("shoot", { volume: 0.35, rate: jitter() });
		});
		events.addEventListener("hit", () =>
			play("hit", { volume: 0.5, rate: jitter() }),
		);
		events.addEventListener("exploded", (e) => {
			const ship = e.detail.kind === "ship";
			play("explosion", {
				volume: ship ? 1 : 0.6,
				rate: ship ? 0.8 : 0.9 + (3 - (e.detail.size ?? 3)) * 0.2,
			});
		});
		events.addEventListener("picked", (e) => {
			if (e.detail.holderId === playerId) play("pickup", { volume: 0.7 });
		});
	}

	return {
		unlock,
		play,
		connect,
		toggleMute() {
			muted = !muted;
		},
		get label() {
			if (!ctx) return "очікує кліку";
			if (muted) return "вимкнено (M)";
			return ctx.state === "running"
				? `увімкнено (${buffers.size})`
				: ctx.state;
		},
	};
}
