import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { base } from '$app/paths';
import { hasToken } from '$lib/auth';
import type { LayoutLoad } from './$types';

// SPA mode: token lives in localStorage, only readable in the browser.
export const ssr = false;
export const prerender = false;

/**
 * Auth guard for every route. Allows the /login route through
 * unauthenticated; redirects every other route to /login when no token
 * is present.
 *
 * `redirect()` does not auto-prefix the configured `paths.base`, so we
 * prepend it manually using `$app/paths`. With `base = "/v2"` the
 * target becomes "/v2/login".
 */
export const load: LayoutLoad = async ({ url }) => {
	// During SSR (build / pre-render) we have no localStorage, so just
	// return — the client-side load runs again with the real environment.
	if (!browser) return {};

	const path = url.pathname;
	const isLoginRoute = path === `${base}/login` || path.startsWith(`${base}/login/`);
	if (isLoginRoute) return {};

	if (!hasToken()) {
		throw redirect(302, `${base}/login`);
	}

	return {};
};
