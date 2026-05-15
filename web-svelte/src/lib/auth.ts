import { browser } from '$app/environment';

/**
 * localStorage key for the API bearer token.
 *
 * Intentionally identical to the legacy frontend (web/app.js) so a user
 * already authenticated against WISSen v1 stays authenticated when
 * landing on v2 and vice versa.
 */
const STORAGE_TOKEN = 'wissen.authToken';

/**
 * Returns the persisted bearer token, or null when no token is stored
 * or when running outside a browser (SSR/load-time).
 */
export function getToken(): string | null {
	if (!browser) return null;
	try {
		const value = localStorage.getItem(STORAGE_TOKEN);
		return value && value.length > 0 ? value : null;
	} catch {
		return null;
	}
}

/**
 * Persists the bearer token in localStorage. No-op outside the browser.
 * Quota / privacy-mode failures are swallowed silently — the user will
 * simply have to log in again on the next visit.
 */
export function setToken(token: string): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_TOKEN, token);
	} catch {
		/* ignore quota / disabled storage */
	}
}

/**
 * Removes the persisted bearer token. No-op outside the browser.
 */
export function clearToken(): void {
	if (!browser) return;
	try {
		localStorage.removeItem(STORAGE_TOKEN);
	} catch {
		/* ignore */
	}
}

/**
 * Convenience predicate: true when a non-empty token is currently stored.
 */
export function hasToken(): boolean {
	return getToken() !== null;
}
