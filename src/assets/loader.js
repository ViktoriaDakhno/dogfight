import { fetchChecked, fetchJson, withRetry } from "./http.js";

// ---------- окремі завантажувачі ----------
// Кожен приймає { signal, timeoutMs, attempts, onRetry, cache } і повторює
// тимчасові збої з backoff. 404 не повторюється (див. isRetryable).

export function loadJson(url, opts = {}) {
	return withRetry(() => fetchJson(url, opts), opts);
}

export function loadImage(url, opts = {}) {
	return withRetry(async () => {
		const res = await fetchChecked(url, opts); // статус перевірено → 404 відрізняємо від обриву
		const blob = await res.blob();
		return decodeImage(blob, opts.signal);
	}, opts);
}

export function loadAudio(audioCtx, url, opts = {}) {
	return withRetry(async () => {
		const res = await fetchChecked(url, opts);
		const bytes = await res.arrayBuffer();
		return audioCtx.decodeAudioData(bytes); // декодуємо ЗАРАЗ, а не на першому пострілі
	}, opts);
}

// Колбек-API (onload/onerror) → проміс. Єдине місце, де new Promise пишемо руками.
// Проміс дає один порядок і для картинки з кешу (onload може прийти одразу),
// і для картинки з мережі.
function decodeImage(blob, signal) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const objectUrl = URL.createObjectURL(blob);
		const cleanup = () => {
			URL.revokeObjectURL(objectUrl);
			signal?.removeEventListener("abort", onAbort);
		};
		function onAbort() {
			cleanup();
			reject(signal.reason);
		}
		img.onload = () => {
			cleanup();
			resolve(img);
		};
		img.onerror = () => {
			cleanup();
			reject(new Error(`файл не є картинкою (${blob.type || "?"})`));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		img.src = objectUrl;
	});
}

export const DEFAULT_LOADERS = {
	json: (url, opts) => loadJson(url, opts),
	image: (url, opts) => loadImage(url, opts),
	sound: (url, opts, ctx) =>
		ctx
			? loadAudio(ctx, url, opts)
			: Promise.reject(new Error("Web Audio недоступний")),
};

// Помилка конкретного файлу: пам'ятає, який саме ассет упав, і першопричину
export class AssetError extends Error {
	constructor(item, cause) {
		super(`${item.id}: ${cause?.message ?? cause}`, { cause });
		this.name = "AssetError";
		this.item = item;
	}
}

// ---------- весь пак ----------
// mode "concurrent" (за замовчуванням): усі запити стартують одразу, Promise.all.
// mode "sequential": for + await — для порівняння часу в README.
//
// critical: true  → без цього файлу гри немає: loadAll відхиляється, решта запитів скасовується.
// critical: false → файл може відпасти: потрапляє у failures, гра стартує з заміною.
export async function loadAll(
	manifest,
	{
		mode = "concurrent",
		signal,
		onProgress,
		onItem,
		loaders = DEFAULT_LOADERS,
		audioCtx,
		...requestOpts
	} = {},
) {
	const internal = new AbortController(); // щоб зупинити «сусідів», коли впав критичний файл
	const packSignal = signal
		? AbortSignal.any([signal, internal.signal])
		: internal.signal;

	const items = manifest.items;
	const total = items.length;
	let done = 0;
	const result = {
		images: new Map(),
		sounds: new Map(),
		data: new Map(),
		failures: [],
		timings: new Map(),
	};

	// Обгортка над одним файлом: лічильник прогресу ДО того, як проміс піде в Promise.all.
	// Сам Promise.all мовчить до кінця — прогрес-бар з нього не зробиш.
	const track = (item) => {
		const path = `${manifest.baseUrl ?? ""}${item.url}`;
		const started = performance.now();
		let retries = 0;
		onItem?.(item, { status: "loading" });

		return loaders[item.type](
			path,
			{
				...requestOpts,
				signal: packSignal,
				onRetry: (info) => {
					retries = info.attempt;
					onItem?.(item, { status: "retry", ...info });
				},
			},
			audioCtx,
		)
			.then(
				(value) => {
					const ms = performance.now() - started;
					result.timings.set(item.id, ms);
					const bucket =
						item.type === "image"
							? result.images
							: item.type === "sound"
								? result.sounds
								: result.data;
					bucket.set(item.id, value);
					onItem?.(item, { status: "ok", ms, retries });
					return value;
				},
				(error) => {
					onItem?.(item, { status: "failed", error, retries });
					if (item.critical || packSignal.aborted)
						throw new AssetError(item, error);
					result.failures.push({ item, error });
					return null; // некритичний: пак продовжується
				},
			)
			.finally(() => {
				done += 1;
				onProgress?.({ done, total, fraction: done / total });
			});
	};

	try {
		if (mode === "sequential") {
			for (const item of items) await track(item); // наступний стартує, лише коли попередній завершився
		} else {
			await Promise.all(items.map(track)); // усі стартують одразу
		}
	} catch (error) {
		// Promise.all сам нічого не скасовує — «сусіди» добігали б. Зупиняємо їх вручну.
		internal.abort(
			new DOMException(
				`${error.item?.id ?? "пак"} не завантажився`,
				"AbortError",
			),
		);
		throw signal?.aborted
			? new AssetError({ id: "pack" }, signal.reason)
			: error;
	}
	return result;
}
