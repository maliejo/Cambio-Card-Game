/** How far a card leans toward the cursor, in degrees. */
const MAX_TILT = 14;

/**
 * Svelte action: the card leans toward the mouse pointer like it is being
 * pressed at that spot, and a glossy sheen follows the cursor. Exposed as CSS
 * variables (--rx, --ry, --mx, --my) for the card's styles to use. Touch and
 * pen input are ignored — there is no hover to follow there.
 */
export function tilt(node: HTMLElement, enabled: boolean) {
	function move(event: PointerEvent) {
		if (!enabled || event.pointerType !== 'mouse') return;
		const rect = node.getBoundingClientRect();
		const x = (event.clientX - rect.left) / rect.width; // 0 … 1
		const y = (event.clientY - rect.top) / rect.height;
		node.style.setProperty('--rx', `${(0.5 - y) * MAX_TILT}deg`);
		node.style.setProperty('--ry', `${(x - 0.5) * MAX_TILT}deg`);
		node.style.setProperty('--mx', `${x * 100}%`);
		node.style.setProperty('--my', `${y * 100}%`);
	}
	function reset() {
		for (const prop of ['--rx', '--ry', '--mx', '--my']) node.style.removeProperty(prop);
	}

	node.addEventListener('pointermove', move);
	node.addEventListener('pointerleave', reset);
	return {
		update(next: boolean) {
			enabled = next;
			if (!enabled) reset();
		},
		destroy() {
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerleave', reset);
		}
	};
}
