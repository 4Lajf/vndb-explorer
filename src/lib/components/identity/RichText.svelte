<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import { tokenizeBbcode } from '#lib/bbcode.ts';

	/**
	 * VNDB description text. Rendered from whitelisted tokens as real elements:
	 * never `{@html}` on dump text (DESIGN §10.1).
	 */
	interface Props {
		text: string | null | undefined;
		/** Collapse long descriptions behind a "Show more" control. */
		clamp?: number;
		class?: string;
	}
	let { text, clamp = 420, class: klass = '' }: Props = $props();

	const tokens = $derived(tokenizeBbcode(text));
	const length = $derived(
		tokens.reduce((n, t) => n + (t.type === 'break' ? 1 : t.text.length), 0)
	);
	let expanded = $state(false);
	const clipped = $derived(!expanded && length > clamp);

	const visible = $derived.by(() => {
		if (!clipped) return tokens;
		const out: typeof tokens = [];
		let used = 0;
		for (const t of tokens) {
			if (t.type === 'break') {
				out.push(t);
				used += 1;
				continue;
			}
			if (used + t.text.length <= clamp) {
				out.push(t);
				used += t.text.length;
				continue;
			}
			if (t.type === 'text') {
				const room = clamp - used;
				const cut = t.text.slice(0, room).replace(/\s+\S*$/, '');
				if (cut) out.push({ type: 'text', text: `${cut}…` });
			}
			break;
		}
		return out;
	});
</script>

{#if tokens.length > 0}
	<div class="max-w-(--container-reading) text-base text-ink-2 {klass}">
		<p class="break-words">
			{#each visible as tok, i (i)}
				{#if tok.type === 'break'}
					<br />
				{:else if tok.type === 'link'}
					<a
						class="link"
						href={tok.href}
						target={tok.external ? '_blank' : undefined}
						rel={tok.external ? 'noopener noreferrer nofollow' : undefined}
						>{tok.text}{#if tok.external}<ArrowUpRight size={10} class="ml-0.5 inline text-ink-3" />{/if}</a
					>
				{:else}
					{tok.text}
				{/if}
			{/each}
		</p>
		{#if length > clamp}
			<button type="button" class="btn-ghost mt-1 text-xs text-ink-2" onclick={() => (expanded = !expanded)}>
				{expanded ? 'Show less' : 'Show more'}
			</button>
		{/if}
	</div>
{/if}
