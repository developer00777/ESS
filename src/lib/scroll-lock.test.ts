import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { lockPageScroll } from './scroll-lock';

/**
 * The lock is reference counted and reaches for the real DOM, so these stub
 * just enough of it to exercise the counting. The failure this guards against
 * is not cosmetic: a lock that is taken twice and released once leaves the
 * portal permanently unable to scroll, with no way out but a reload.
 */
type Stub = {
	style: Record<string, string>;
	clientWidth: number;
};

let root: Stub;
let scrollToCalls: Array<{ top: number }>;

function install({ gutterSupported = true, scrollbar = 0 } = {}) {
	root = { style: {}, clientWidth: 1000 };
	scrollToCalls = [];

	(globalThis as any).document = { documentElement: root };
	(globalThis as any).window = {
		scrollY: 0,
		innerWidth: 1000 + scrollbar,
		scrollTo: (opts: { top: number }) => scrollToCalls.push(opts)
	};
	(globalThis as any).CSS = { supports: () => gutterSupported };
	(globalThis as any).getComputedStyle = () => ({ paddingRight: '0px' });
}

beforeEach(() => install());

afterEach(() => {
	delete (globalThis as any).document;
	delete (globalThis as any).window;
	delete (globalThis as any).CSS;
	delete (globalThis as any).getComputedStyle;
});

describe('lockPageScroll', () => {
	it('stops the page scrolling and lets it go again', () => {
		const release = lockPageScroll();
		expect(root.style.overflow).toBe('hidden');

		release();
		expect(root.style.overflow).toBe('');
	});

	it('keeps the page locked until the last holder releases', () => {
		const first = lockPageScroll();
		const second = lockPageScroll();

		first();
		expect(root.style.overflow).toBe('hidden');

		second();
		expect(root.style.overflow).toBe('');
	});

	it('ignores a release called twice, so one overlay cannot unlock another', () => {
		const first = lockPageScroll();
		const second = lockPageScroll();

		first();
		first();
		expect(root.style.overflow).toBe('hidden');

		second();
		expect(root.style.overflow).toBe('');
	});

	it('restores the scroll offset if the browser dropped it', () => {
		(globalThis as any).window.scrollY = 820;
		const release = lockPageScroll();

		// Something scrolled the page to the top while it was locked.
		(globalThis as any).window.scrollY = 0;
		release();

		expect(scrollToCalls).toEqual([{ top: 820, behavior: 'instant' }]);
	});

	it('leaves the offset alone when the browser held on to it', () => {
		(globalThis as any).window.scrollY = 820;
		const release = lockPageScroll();
		release();

		expect(scrollToCalls).toEqual([]);
	});

	it('pads the scrollbar away itself when scrollbar-gutter is unsupported', () => {
		install({ gutterSupported: false, scrollbar: 15 });

		const release = lockPageScroll();
		expect(root.style.paddingRight).toBe('15px');

		release();
		expect(root.style.paddingRight).toBe('');
	});

	it('pads nothing when the browser reserves the gutter in CSS', () => {
		install({ gutterSupported: true, scrollbar: 15 });

		const release = lockPageScroll();
		expect(root.style.paddingRight).toBeUndefined();
		release();
	});

	it('pads nothing for overlay scrollbars, which take up no width', () => {
		install({ gutterSupported: false, scrollbar: 0 });

		const release = lockPageScroll();
		expect(root.style.paddingRight).toBeUndefined();
		release();
	});
});
