// DOM лобі. Лише малює й передає кліки в Lobby; сам нічого не завантажує.
const NAME_KEY = "dogfight.name";

function el(tag, props = {}, children = []) {
	const node = Object.assign(document.createElement(tag), props);
	node.append(...children);
	return node;
}

function savedName() {
	try {
		return localStorage.getItem(NAME_KEY) ?? "";
	} catch {
		return "";
	}
}

function saveName(name) {
	try {
		localStorage.setItem(NAME_KEY, name);
	} catch {
		// приватний режим — просто не запам'ятовуємо
	}
}

export function mountLobbyView(container, lobby, { warnings = [] } = {}) {
	const views = new AbortController(); // знімає всі слухачі однією командою при unmount
	const on = (target, type, fn) =>
		target.addEventListener(type, fn, { signal: views.signal });

	let selected = null;

	const nameInput = el("input", {
		maxLength: 16,
		placeholder: "Пілот",
		value: savedName() || "Пілот",
	});
	const list = el("div", { className: "rooms" });
	const status = el("div", {
		className: "status",
		textContent: "Завантажую кімнати…",
	});
	const refreshBtn = el("button", { type: "button", textContent: "Оновити" });
	const joinBtn = el("button", {
		type: "button",
		className: "primary",
		textContent: "Приєднатися",
		disabled: true,
	});
	const warningBox = el(
		"div",
		{ className: "warnings" },
		warnings.map((text) => el("div", { textContent: `⚠ ${text}` })),
	);

	const root = el("div", { className: "panel lobby" }, [
		el("h1", { textContent: "Dogfight · лобі" }),
		el("label", { className: "field" }, [
			el("span", { textContent: "Ім'я пілота" }),
			nameInput,
		]),
		el("div", { className: "label", textContent: "Кімнати" }),
		list,
		status,
		el("div", { className: "actions" }, [refreshBtn, joinBtn]),
		warningBox,
	]);
	container.append(root);

	function updateJoin() {
		const room = lobby.rooms.find((r) => r.id === selected);
		joinBtn.disabled =
			!room || room.players >= room.maxPlayers || !nameInput.value.trim();
	}

	function renderRooms(rooms) {
		if (!rooms.some((r) => r.id === selected && r.players < r.maxPlayers)) {
			selected = rooms.find((r) => r.players < r.maxPlayers)?.id ?? null;
		}
		list.replaceChildren(
			...rooms.map((room) => {
				const full = room.players >= room.maxPlayers;
				const a = room.arena ?? {};
				const btn = el(
					"button",
					{
						type: "button",
						className: `room${room.id === selected ? " selected" : ""}`,
						disabled: full,
					},
					[
						el("strong", { textContent: room.name }),
						el("span", {
							textContent: `${room.players}/${room.maxPlayers} гравців`,
						}),
						el("small", {
							textContent: `${a.width ?? "?"}×${a.height ?? "?"}, астероїдів: ${a.asteroids ?? "?"}`,
						}),
					],
				);
				btn.addEventListener("click", () => {
					selected = room.id;
					renderRooms(lobby.rooms);
				});
				return btn;
			}),
		);
		updateJoin();
	}

	on(lobby, "loading", () => {
		status.textContent = "Оновлюю…";
		status.className = "status";
	});
	on(lobby, "rooms", (e) => {
		renderRooms(e.detail.rooms);
		status.textContent = `Оновлено о ${e.detail.updatedAt.toLocaleTimeString("uk-UA")} · автооновлення кожні ${lobby.intervalMs / 1000} с`;
		status.className = "status";
	});
	on(lobby, "error", (e) => {
		status.textContent = `⚠ ${e.detail.text}. Повтор через ${e.detail.retryInMs / 1000} с`;
		status.className = "status error";
	});
	on(refreshBtn, "click", () => lobby.refresh());
	on(nameInput, "input", updateJoin);
	on(joinBtn, "click", () => {
		saveName(nameInput.value.trim());
		lobby.join(selected, nameInput.value);
	});
	on(nameInput, "keydown", (e) => {
		if (e.key === "Enter" && !joinBtn.disabled) joinBtn.click();
	});
	// лобі оновлюється, лише поки його видно: вкладку сховали — запити зупиняються
	on(document, "visibilitychange", () => {
		if (document.hidden) lobby.stop();
		else lobby.start();
	});

	return {
		unmount() {
			views.abort();
			root.remove();
		},
	};
}
