/**
 * Overlay transitions, built on Motion (https://motion.dev).
 *
 * These exist for a scrolling reason, not a decorative one. A slide-over locks
 * the page while it is open, so the lock has to be released at the moment the
 * panel stops covering the page. A CSS `@keyframes` entry animation cannot do
 * that: it fires on mount, has no exit half, and hands the caller nothing to
 * await — so the panel was torn out of the DOM instantly and the page got its
 * scrollbar back while the eye was still on the panel. Motion's animations
 * return a promise, so close can wait for the panel to actually leave.
 *
 * Motion animations are also interruptible: re-opening mid-close picks up from
 * wherever the panel had travelled to rather than snapping back to the edge.
 */
import { animate } from 'motion';

/** The portal's standard ease-out, matching --ess-t-slow's curve. */
const EASE = [0.32, 0.72, 0, 1] as const;

export function prefersReducedMotion(): boolean {
	return (
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/**
 * Slides a right-hand panel in over its scrim, resolving once both have
 * settled.
 *
 * The start state is written synchronously rather than left to the animation's
 * first frame: this runs from an effect, before paint, and a panel that paints
 * once at full opacity before travelling is worse than no animation at all.
 */
export async function overlayIn(scrim: HTMLElement, panel: HTMLElement): Promise<void> {
	scrim.style.opacity = '0';
	panel.style.transform = 'translateX(100%)';

	if (prefersReducedMotion()) {
		// The panel still appears, it just does not travel.
		panel.style.transform = '';
		await animate(scrim, { opacity: 1 }, { duration: 0.12 }).finished;
		return;
	}

	await Promise.all([
		animate(scrim, { opacity: 1 }, { duration: 0.18, ease: 'linear' }).finished,
		animate(panel, { x: '0%' }, { duration: 0.32, ease: EASE }).finished
	]);
}

/**
 * Slides the panel back out. Callers await this before unmounting and before
 * releasing the scroll lock, so the page never regains its scrollbar while the
 * panel is still on screen.
 */
export async function overlayOut(scrim: HTMLElement, panel: HTMLElement): Promise<void> {
	if (prefersReducedMotion()) {
		await animate(scrim, { opacity: 0 }, { duration: 0.1 }).finished;
		return;
	}

	await Promise.all([
		animate(scrim, { opacity: 0 }, { duration: 0.24, ease: 'linear' }).finished,
		animate(panel, { x: '100%' }, { duration: 0.24, ease: EASE }).finished
	]);
}
