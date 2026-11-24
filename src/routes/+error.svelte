<script lang="ts">
	import { page } from '$app/state';
	import GlobalSearch from '#lib/components/shell/GlobalSearch.svelte';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Something went wrong.');
	const dumpDate = $derived((page.data?.dumpDate as string | undefined) ?? 'current');
	// Pull a VNDB id out of the path or the message, to say exactly what is missing.
	const missingId = $derived(
		/\/(?:producer|staff|vn)\/([^/?#]+)/.exec(page.url.pathname)?.[1] ??
			/\b([psv]\d+)\b/i.exec(message)?.[1] ??
			null
	);
</script>

<svelte:head>
	<title>{status === 404 ? 'Not found' : 'Error'} · VNDB Explorer</title>
</svelte:head>

<section class="py-14">
	<p class="text-xs font-medium text-ink-3">{status === 404 ? 'Not found' : `Error ${status}`}</p>
	{#if status === 404}
		<h1 class="mt-2 text-2xl font-semibold tracking-tighter text-ink">
			{#if missingId}
				<span class="tnum font-mono text-xl">{missingId}</span> is not in the {dumpDate} dump
			{:else}
				This page does not exist
			{/if}
		</h1>
		<p class="mt-2 max-w-(--container-reading) text-base text-ink-2">
			The record may have been added to VNDB after this dump, deleted, or the address may be
			mistyped. Search by name, alias or VNDB ID instead.
		</p>
	{:else}
		<h1 class="mt-2 text-2xl font-semibold tracking-tighter text-ink">The page could not be loaded</h1>
		<p
			class="mt-3 max-w-(--container-reading) border-l-2 border-danger pl-3 text-base text-ink-2"
		>
			{message}
		</p>
	{/if}

	<div class="mt-6 max-w-[44rem]">
		<!-- The top bar's search owns Ctrl/⌘+K on every error page, root errors
		     included (TopBar shows its search whenever `page.error` is set), so this
		     one binds no shortcut and shows no key hint. -->
		<GlobalSearch size="hero" hotkey={false} />
	</div>

	<p class="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
		<a class="link" href="/">Home</a>
		<a class="link" href="/discover/brands">Hidden brand links</a>
		<a class="link" href="/discover/aliases">Potential aliases</a>
		<a class="link" href="/compare">Compare brands</a>
	</p>
</section>
