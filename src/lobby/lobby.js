import { DataError, explainError, fetchJson } from "../assets/http.js";

// Дані лобі без жодного DOM. Події:
//   "loading"  почався запит
//   "rooms"    { rooms, updatedAt } — прийшов свіжий список
//   "error"    { error, kind, text, retryInMs } — запит не вдався, наступна спроба за інтервалом
//   "aborted"  запит скасовано, бо лобі закрили (гравець пішов)
//   "join"     { room, name } — гравець приєднався, лобі зупинене
export class Lobby extends EventTarget {
	#session = null; // AbortController «лобі відкрите»: abort() = гравець пішов
	#request = null; // AbortController поточного запиту
	#timer = null;
	#rooms = [];

	constructor({
		url = "/api/rooms",
		intervalMs = 3000,
		timeoutMs = 2500,
		load = fetchJson,
	} = {}) {
		super();
		this.url = url;
		this.intervalMs = intervalMs;
		this.timeoutMs = timeoutMs;
		this.load = load;
	}

	get rooms() {
		return this.#rooms;
	}

	get active() {
		return this.#session !== null;
	}

	#emit(type, detail) {
		this.dispatchEvent(new CustomEvent(type, { detail }));
	}

	start() {
		if (this.#session) return;
		this.#session = new AbortController();
		this.refresh();
	}

	// Зупинити все: таймер і запит, що летить. Відповідь, яка прийде пізніше,
	// вже нікуди не запише список — екрана лобі немає.
	stop() {
		if (!this.#session) return;
		clearTimeout(this.#timer);
		this.#session.abort(new DOMException("гравець пішов з лобі", "AbortError"));
		this.#session = null;
	}

	async refresh() {
		const session = this.#session;
		if (!session) return;
		clearTimeout(this.#timer);
		this.#request?.abort(); // ручне «Оновити» поки старий запит ще летить — старий не потрібен
		const request = new AbortController();
		this.#request = request;
		const signal = AbortSignal.any([session.signal, request.signal]);

		this.#emit("loading");
		try {
			// timeoutMs → AbortSignal.timeout всередині fetchJson: кожен запит має межу
			const data = await this.load(this.url, {
				signal,
				timeoutMs: this.timeoutMs,
			});
			this.#rooms = parseRooms(data);
			this.#emit("rooms", { rooms: this.#rooms, updatedAt: new Date() });
		} catch (error) {
			if (session.signal.aborted) {
				this.#emit("aborted", { reason: session.signal.reason });
				return;
			}
			if (request.signal.aborted) return; // замінено новішим запитом
			this.#emit("error", {
				error,
				...explainError(error),
				retryInMs: this.intervalMs,
			});
		} finally {
			// наступне оновлення — лише якщо лобі ще відкрите і це останній запит
			if (!session.signal.aborted && this.#request === request) {
				this.#timer = setTimeout(() => this.refresh(), this.intervalMs);
			}
		}
	}

	join(roomId, name) {
		const room = this.#rooms.find((r) => r.id === roomId);
		const trimmed = String(name ?? "").trim();
		if (!room || !trimmed) return false;
		if (room.players >= room.maxPlayers) return false;
		this.stop();
		this.#emit("join", { room, name: trimmed });
		return true;
	}
}

// Мережа — це «чужі» дані: перевіряємо форму, перш ніж довіряти
export function parseRooms(data) {
	if (!Array.isArray(data?.rooms)) throw new DataError("немає масиву rooms");
	return data.rooms
		.filter(
			(r) =>
				typeof r?.id === "string" &&
				typeof r.name === "string" &&
				Number.isFinite(r.players) &&
				Number.isFinite(r.maxPlayers),
		)
		.map((r) => ({ ...r, arena: { ...r.arena } }));
}
