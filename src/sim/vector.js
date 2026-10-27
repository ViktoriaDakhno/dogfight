// Незмінний 2D-вектор: кожен метод повертає НОВИЙ вектор, аргументи не мутуються.
// Тому a.add(b) ніколи не змінить ні a, ні b, і посилання на вектор можна сміливо зберігати.
export class Vector2 {
	constructor(x = 0, y = 0) {
		this.x = x;
		this.y = y;
	}

	static ZERO = Object.freeze(new Vector2(0, 0));

	static fromAngle(angle, length = 1) {
		return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length);
	}

	add(v) {
		return new Vector2(this.x + v.x, this.y + v.y);
	}

	sub(v) {
		return new Vector2(this.x - v.x, this.y - v.y);
	}

	scale(k) {
		return new Vector2(this.x * k, this.y * k);
	}

	dot(v) {
		return this.x * v.x + this.y * v.y;
	}

	length() {
		return Math.hypot(this.x, this.y);
	}

	lengthSq() {
		return this.x * this.x + this.y * this.y;
	}

	normalize() {
		const len = this.length();
		return len === 0 ? new Vector2(0, 0) : this.scale(1 / len);
	}

	rotate(angle) {
		const c = Math.cos(angle);
		const s = Math.sin(angle);
		return new Vector2(this.x * c - this.y * s, this.x * s + this.y * c);
	}

	angle() {
		return Math.atan2(this.y, this.x);
	}

	clampLength(max) {
		const len = this.length();
		return len > max ? this.scale(max / len) : this;
	}
}
