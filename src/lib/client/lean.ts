import type { Orientation } from './ui';

/** How far a peeked card slides toward the one looking at it, in px. */
const LEAN_PX = 22;
const ZOOM = 1.22;

/** Toward the table edge a player sits at — where they hold a card up to their own eyes. */
const TOWARD_OWNER: Record<Orientation, [number, number]> = {
	0: [0, 1],
	180: [0, -1],
	90: [-1, 0],
	[-90]: [1, 0]
};

export interface LeanParams {
	/** Who is looking at this card right now, or null. */
	peekerId: string | null;
	ownerId: string;
	orientation: Orientation;
}

/**
 * Svelte action for a hand slot: while someone looks at the card, it lifts off
 * the table and slides toward that player — as if picked up and held close to
 * their face — so everyone can see at a glance whose card is being looked at, and by whom.
 */
export function leanToward(node: HTMLElement, params: LeanParams) {
	node.style.transition =
		'translate 320ms cubic-bezier(0.34, 1.4, 0.64, 1), scale 320ms cubic-bezier(0.34, 1.4, 0.64, 1)';

	function apply({ peekerId, ownerId, orientation }: LeanParams) {
		if (!peekerId) {
			node.style.translate = '';
			node.style.scale = '';
			node.style.zIndex = '';
			return;
		}
		let [dx, dy] = TOWARD_OWNER[orientation];
		if (peekerId !== ownerId) {
			const seat = document.querySelector(`[data-seat="${CSS.escape(peekerId)}"]`);
			if (seat) {
				const from = node.getBoundingClientRect();
				const to = seat.getBoundingClientRect();
				const vx = to.left + to.width / 2 - (from.left + from.width / 2);
				const vy = to.top + to.height / 2 - (from.top + from.height / 2);
				const length = Math.hypot(vx, vy) || 1;
				[dx, dy] = [vx / length, vy / length];
			}
		}
		node.style.translate = `${dx * LEAN_PX}px ${dy * LEAN_PX}px`;
		node.style.scale = String(ZOOM);
		node.style.zIndex = '20';
	}

	apply(params);
	return { update: apply };
}
