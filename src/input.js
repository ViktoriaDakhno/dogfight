export function createInput(target) {
	const down = new Set(); // клавіші, які зараз затиснуті
	const pressed = new Set(); // клавіші, натиснуті саме в цьому кроці

	target.addEventListener("keydown", (e) => {
		if (!down.has(e.code)) pressed.add(e.code); // ігноруємо автоповтор
		down.add(e.code);
		if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
	});
	target.addEventListener("keyup", (e) => down.delete(e.code));
	target.addEventListener("blur", () => down.clear()); // втрата фокусу = відпустили все

	return {
		isDown: (code) => down.has(code),
		justPressed: (code) => pressed.has(code),
		endFrame: () => pressed.clear(),
	};
}
