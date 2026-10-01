export const ARENA = { width: 1600, height: 900 };

// «загортання» країв: вийшов праворуч, з'явився ліворуч
export function wrap(value, size) {
	return ((value % size) + size) % size;
}
