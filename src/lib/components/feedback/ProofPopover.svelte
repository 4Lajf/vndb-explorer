<script lang="ts" module>
	/** Panel → the panel its trigger sits in, so a nested popover counts as "inside" its parent. */
	const ownerPanel = new WeakMap<HTMLElement, HTMLElement>();
	/** Open panels, outermost first: Escape closes only the innermost. */
	const openPanels: HTMLElement[] = [];
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import X from '@lucide/svelte/icons/x';

	/**
	 * Proof popover. The panel is moved to `<body>` and placed in viewport
	 * coordinates, so no scroll container, `overflow` wrapper or
	 * `backdrop-filter` ancestor (floating sheet, Atlas panels, table scrollers)
	 * can clip or offset it. It flips above the trigger when there is more room
	 * there and follows the trigger while anything behind it scrolls.
	 */
	interface Props {
		title: string;
		subtitle?: string;
		align?: 'left' | 'right';
		widthClass?: string;
		onopen?: () => void;
		trigger: Snippet<[{ open: boolean; toggle: (e: MouseEvent) => void }]>;
		children: Snippet<[{ close: () => void }]>;
	}
	let {
		title,
		subtitle,
		align = 'left',
		widthClass = 'w-[min(24rem,calc(100vw-1.5rem))]',
		onopen,
		trigger,
		children
	}: Props = $props();

	const EDGE = 8;
	const GAP = 6;
	const MAX_H = 420;

	let open = $state(false);
	let triggerWrap = $state<HTMLSpanElement | null>(null);
	let panelEl = $state<HTMLDivElement | null>(null);
	/** Vertical anchoring uses `top` below the trigger and `bottom` above it, so late-loading rows grow away from the trigger. */
	let pos = $state<{ left: number; top: number | null; bottom: number | null; maxH: number }>({
		left: EDGE,
		top: 0,
		bottom: null,
		maxH: MAX_H
	});
	let raf = 0;

	/** The trigger's box, or `null` once a scroll container has scrolled it out of sight. */
	function visibleTriggerRect(): DOMRect | null {
		const el = (triggerWrap?.firstElementChild as HTMLElement | null) ?? triggerWrap;
		if (!el || !el.isConnected) return null;
		const rect = el.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) return null;
		if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
			return null;
		}
		for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
			const cs = getComputedStyle(p);
			if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
			const pr = p.getBoundingClientRect();
			if (cs.overflowY !== 'visible' && (rect.bottom < pr.top || rect.top > pr.bottom)) return null;
			if (cs.overflowX !== 'visible' && (rect.right < pr.left || rect.left > pr.right)) return null;
		}
		return rect;
	}

	function place() {
		const rect = visibleTriggerRect();
		if (!rect) {
			open = false;
			return;
		}
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const width = panelEl?.offsetWidth ?? Math.min(384, vw - EDGE * 2);
		let left = align === 'right' ? rect.right - width : rect.left;
		left = Math.max(EDGE, Math.min(vw - width - EDGE, left));

		const spaceBelow = vh - rect.bottom - GAP - EDGE;
		const spaceAbove = rect.top - GAP - EDGE;
		const above = spaceBelow < 260 && spaceAbove > spaceBelow;
		const maxH = Math.max(120, Math.min(MAX_H, above ? spaceAbove : spaceBelow));
		pos = above
			? { left, top: null, bottom: vh - rect.top + GAP, maxH }
			: { left, top: rect.bottom + GAP, bottom: null, maxH };
	}

	function schedulePlace() {
		if (raf) return;
		raf = requestAnimationFrame(() => {
			raf = 0;
			if (open) place();
		});
	}

	function close() {
		open = false;
	}

	function toggle(e: MouseEvent) {
		e.stopPropagation();
		if (open) {
			open = false;
			return;
		}
		place();
		open = true;
		onopen?.();
	}

	/** True when `target` is this popover's trigger, its panel, or a popover opened from inside its panel. */
	function owns(target: EventTarget | null): boolean {
		if (!(target instanceof Node)) return false;
		if (triggerWrap?.contains(target)) return true;
		const start = target instanceof Element ? target : target.parentElement;
		let el = start?.closest<HTMLElement>('[data-proof-popover]') ?? null;
		while (el) {
			if (el === panelEl) return true;
			el = ownerPanel.get(el) ?? null;
		}
		return false;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (!open || e.key !== 'Escape') return;
		if (openPanels.length > 0 && openPanels[openPanels.length - 1] !== panelEl) return;
		e.preventDefault();
		close();
		(triggerWrap?.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true });
	}

	function onWindowPointerdown(e: PointerEvent) {
		if (open && !owns(e.target)) close();
	}

	/** Moves the panel to `<body>` and keeps it placed while the page behind it scrolls or resizes. */
	function mountPanel(node: HTMLDivElement) {
		const parent = triggerWrap?.closest<HTMLElement>('[data-proof-popover]');
		if (parent) ownerPanel.set(node, parent);
		document.body.appendChild(node);
		openPanels.push(node);
		place();
		// Out of the page's tab order once moved, so take focus: Tab then walks the panel.
		node.focus({ preventScroll: true });

		const onScroll = (e: Event) => {
			// Scrolling inside this panel (or one opened from it) does not move the trigger.
			if (e.target instanceof Node && node.contains(e.target)) return;
			schedulePlace();
		};
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', schedulePlace);

		return {
			destroy() {
				window.removeEventListener('scroll', onScroll, true);
				window.removeEventListener('resize', schedulePlace);
				if (raf) cancelAnimationFrame(raf);
				raf = 0;
				const i = openPanels.indexOf(node);
				if (i >= 0) openPanels.splice(i, 1);
				node.remove();
			}
		};
	}
</script>

<svelte:window onkeydown={onWindowKeydown} onpointerdown={onWindowPointerdown} />

<span class="inline-flex items-center" bind:this={triggerWrap}>
	{@render trigger({ open, toggle })}
</span>

{#if open}
	<div
		bind:this={panelEl}
		use:mountPanel
		data-proof-popover
		role="dialog"
		tabindex="-1"
		aria-label={title}
		class="fixed z-[60] flex flex-col overflow-hidden rounded-lg border border-rule-strong bg-surface-raised text-left font-sans text-sm font-normal tracking-normal whitespace-normal text-ink normal-case shadow-pop outline-none {widthClass}"
		style="left: {pos.left}px; {pos.top !== null ? `top: ${pos.top}px` : `bottom: ${pos.bottom}px`}; max-height: {pos.maxH}px"
	>
		<div class="flex shrink-0 items-start justify-between gap-2 border-b border-rule px-3 py-2">
			<div class="min-w-0">
				<p class="truncate text-xs font-semibold text-ink">{title}</p>
				{#if subtitle}
					<p class="truncate text-2xs text-ink-3">{subtitle}</p>
				{/if}
			</div>
			<button
				type="button"
				class="inline-flex size-5 shrink-0 items-center justify-center rounded-xs text-ink-3 hover:bg-surface-hover hover:text-ink"
				aria-label="Close"
				onclick={close}
			>
				<X size={12} />
			</button>
		</div>
		<div class="min-h-0 overflow-y-auto overscroll-contain px-3 py-2 text-xs text-ink-2">
			{@render children({ close })}
		</div>
	</div>
{/if}
