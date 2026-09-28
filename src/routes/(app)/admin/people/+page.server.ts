import { actions as teamActions, load as teamLoad } from '../../team/+page.server';

/**
 * People, inside Admin Controls, is the Team page itself — same load, same
 * form actions — so there is one roster implementation, not two drifting
 * copies. Team Leads keep reaching it at /team from the sidebar; admins reach
 * it here with the Admin Controls tab bar around it.
 *
 * The forms on that page post to relative `?/action` URLs, so they land back
 * on this route and keep the tab bar.
 *
 * Assigned rather than re-exported with `export { … } from`: SvelteKit's type
 * generation only reads `export const`, and a bare re-export leaves this
 * route's PageData untyped.
 */
export const load = teamLoad;
export const actions = teamActions;
