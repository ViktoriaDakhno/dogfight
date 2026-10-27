import { makePickup } from "./components.js";
import { Entity } from "./entity.js";

// Стоїть на місці, колізиться, але це не корабель і не куля.
// Що саме він дає — описано даними в компоненті `pickup`, а не класом.
export class Pickup extends Entity {
	constructor({ pos, type }) {
		super({ kind: "pickup", pos, radius: 14 });
		this.pickup = makePickup(type); // компонент
		this.ttl = 12;
		this.age = 0;
	}

	// super.update не викликаємо: pickup не рухається
	update(dt) {
		this.age += dt;
		if (this.age >= this.ttl) this.alive = false;
	}
}
