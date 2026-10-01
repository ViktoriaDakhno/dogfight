export function setupCanvas(canvas) {
	const ctx = canvas.getContext("2d");
	const view = { width: 0, height: 0, dpr: 1 };

	function resize() {
		const dpr = window.devicePixelRatio || 1;
		view.width = window.innerWidth;
		view.height = window.innerHeight;
		view.dpr = dpr;
		canvas.width = Math.round(view.width * dpr); // реальні пікселі
		canvas.height = Math.round(view.height * dpr);
		canvas.style.width = `${view.width}px`; // CSS-розмір
		canvas.style.height = `${view.height}px`;
	}

	window.addEventListener("resize", resize);
	resize();
	return { ctx, view };
}
