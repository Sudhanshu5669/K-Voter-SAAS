/**
 * Bot Registry
 * ---------------------------------------------------------------------------
 * Central list of every Top.gg bot this service can vote for.
 *
 * Because the stored session token is a *Top.gg* session cookie (tied to the
 * user's Top.gg account, not to any single bot), one token can vote for any
 * number of bots. Adding support for a new bot therefore only requires adding
 * one entry below — no other code changes are needed.
 *
 * HOW TO ADD A NEW BOT
 *   1. Open the bot's Top.gg page, e.g. https://top.gg/bot/<botId>/vote
 *      - `botId`   = the number in that URL (Discord application ID).
 *   2. Get the `entityId` (Top.gg's internal GraphQL id). To find it: open the
 *      vote page, open DevTools → Network, click Vote, and look at the
 *      `api.top.gg/graphql` request payload — the `entityId` / `i` variable is
 *      the value you need. (It is NOT the same as the botId.)
 *   3. Add an entry keyed by a short lowercase slug (used in the DB + admin UI).
 *
 * Each entry:
 *   key      - short unique slug, also stored in users.selected_bots / vote_logs
 *   name     - human-friendly display name (shown in logs + admin panel)
 *   entityId - Top.gg GraphQL entity id (used by the API vote method)
 *   botId    - Discord application id (used to build the Playwright vote URL)
 */
export const BOTS = {
  karuta: {
    key: 'karuta',
    name: 'Karuta',
    entityId: '4283790394010009600',
    botId: '646937666251915264',
  },
  sofi: {
    key: 'sofi',
    name: 'Sofi',
    entityId: 'REPLACE_WITH_SOFI_ENTITY_ID',
    botId: '853629533855809596',
  },
};

/**
 * Bots assigned to a user by default when the admin hasn't picked anything yet.
 * Keeps existing single-bot (Karuta) behaviour working out of the box.
 */
export const DEFAULT_BOTS = ['karuta'];

/** All configured bot keys, e.g. ['karuta']. */
export const BOT_KEYS = Object.keys(BOTS);

/** Look up a bot config by key. Returns undefined if the key is unknown. */
export function getBot(key) {
  return BOTS[key];
}

/** Return every configured bot as an array (for listing in the admin UI). */
export function listBots() {
  return Object.values(BOTS);
}

/**
 * Given a user's raw selected_bots value, return the list of valid bot configs
 * to vote for.
 *
 * - null / undefined  → fall back to DEFAULT_BOTS (user's assignment was never
 *   set, e.g. a legacy row) so existing users keep voting for Karuta.
 * - an explicit array (including []) → used literally. An empty array therefore
 *   means "admin assigned no bots" → vote for nothing.
 * Unknown / removed bot keys are silently dropped.
 */
export function resolveUserBots(selectedBots) {
  const keys = Array.isArray(selectedBots) ? selectedBots : DEFAULT_BOTS;

  return keys
    .map((key) => BOTS[key])
    .filter(Boolean); // drop unknown / removed bot keys
}
