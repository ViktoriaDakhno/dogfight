import { once } from "../async.js";

// Модальна панель з кнопками. Повертає проміс з value натиснутої кнопки:
//   const choice = await showPanel(ui, { title, lines, buttons })
// Клік — це подія; «дочекатися одного кліку» — це проміс (notes §7, once()).
export async function showPanel(
	container,
	{ title, lines = [], buttons, tone = "error", docked = false },
) {
	const root = document.createElement("div");
	root.className = `panel ${tone}${docked ? " docked" : ""}`; // docked: унизу, щоб не закривати список файлів
	const h = document.createElement("h2");
	h.textContent = title;
	root.append(h);
	for (const line of lines) {
		const p = document.createElement("p");
		p.textContent = line;
		root.append(p);
	}
	const actions = document.createElement("div");
	actions.className = "actions";
	const nodes = buttons.map((b, i) => {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.textContent = b.text;
		if (i === 0) btn.className = "primary";
		actions.append(btn);
		return btn;
	});
	root.append(actions);
	container.append(root);
	nodes[0]?.focus();

	const done = new AbortController(); // після першого кліку решта слухачів знімається
	try {
		const index = await Promise.race(
			nodes.map((btn, i) =>
				once(btn, "click", { signal: done.signal }).then(() => i),
			),
		);
		return buttons[index].value;
	} finally {
		done.abort();
		root.remove();
	}
}
