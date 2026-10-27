import { sleep } from "../async.js";

// fetch НЕ відхиляє проміс на 404/500: це «сервер відповів». Тому статус
// перевіряємо самі й перетворюємо на помилку з номером статусу.
export class HttpError extends Error {
	constructor(url, status, statusText = "") {
		super(`HTTP ${status} ${statusText}`.trim());
		this.name = "HttpError";
		this.url = url;
		this.status = status;
	}
}

// Дані прийшли, але не того вигляду (наприклад, у /api/rooms немає масиву rooms)
export class DataError extends Error {
	constructor(message) {
		super(message);
		this.name = "DataError";
	}
}

// Чи має сенс повторювати запит?
//   так: обрив мережі (TypeError), таймаут, 5xx — це може минути
//   ні:  4xx (файлу немає — і не з'явиться), битий JSON, скасування гравцем
export function isRetryable(error) {
	if (error?.name === "AbortError") return false;
	if (error?.name === "TimeoutError") return true;
	if (error instanceof HttpError) return error.status >= 500;
	if (error instanceof TypeError) return true;
	return false;
}

// Експоненційна затримка з jitter: 2^attempt * base, потім випадково в [½, 1] від неї.
// Jitter потрібен, щоб сотня клієнтів після збою сервера не повернулась в одну мить.
export function backoffDelay(
	attempt,
	{ baseMs = 250, maxMs = 3000, random = Math.random } = {},
) {
	const exp = Math.min(maxMs, baseMs * 2 ** attempt);
	return Math.round(exp / 2 + random() * (exp / 2));
}

export async function withRetry(
	fn,
	{ attempts = 3, baseMs = 250, maxMs = 3000, signal, onRetry, random } = {},
) {
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn(attempt);
		} catch (error) {
			if (signal?.aborted) throw signal.reason;
			if (!isRetryable(error) || attempt >= attempts - 1) throw error;
			const delay = backoffDelay(attempt, { baseMs, maxMs, random });
			onRetry?.({ attempt: attempt + 1, of: attempts, delay, error });
			await sleep(delay, signal);
		}
	}
}

// Сигнал одного запиту: «скасовано ззовні» АБО «вичерпано час на цю спробу»
export function requestSignal(signal, timeoutMs) {
	const timeout = AbortSignal.timeout(timeoutMs);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function fetchChecked(
	url,
	{ signal, timeoutMs = 4000, cache } = {},
) {
	const res = await fetch(url, {
		signal: requestSignal(signal, timeoutMs),
		cache,
	});
	if (!res.ok) throw new HttpError(url, res.status, res.statusText);
	return res;
}

// Два кроки: заголовки (fetch) і тіло (res.json). Між ними теж може статись збій.
export async function fetchJson(url, options) {
	const res = await fetchChecked(url, options);
	return res.json();
}

// Людське пояснення помилки — для екрана завантаження і лобі
export function explainError(error) {
	const cause = error?.cause ?? error;
	switch (cause?.name) {
		case "AbortError":
			return { kind: "abort", text: "Скасовано" };
		case "TimeoutError":
			return { kind: "timeout", text: "Сервер не відповів вчасно (таймаут)" };
		case "HttpError":
			return {
				kind: "http",
				text: `Сервер відповів помилкою: ${cause.message}`,
			};
		case "SyntaxError":
			return { kind: "json", text: `Битий JSON: ${cause.message}` };
		case "DataError":
			return { kind: "data", text: `Неочікувані дані: ${cause.message}` };
		case "TypeError":
			return { kind: "network", text: "Немає з'єднання з сервером" };
		default:
			return { kind: "other", text: String(cause?.message ?? cause) };
	}
}
