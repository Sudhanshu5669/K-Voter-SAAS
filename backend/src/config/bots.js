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
 *      - `botId` = the number in that URL (the bot's Discord application id).
 *   2. Add an entry keyed by a short lowercase slug (used in the DB + admin UI)
 *      with just `key`, `name` and `botId`.
 *   3. That's it. `entityId` (Top.gg's internal GraphQL id) is resolved
 *      automatically from `botId` at runtime via resolveEntityId() below, so
 *      you no longer need to dig it out of DevTools. You *may* still hard-code
 *      `entityId` to skip the one-time lookup — every bot shipped below has it
 *      pre-filled — but it is optional.
 *
 * Each entry:
 *   key      - short unique slug, also stored in users.selected_bots / vote_logs
 *   name     - human-friendly display name (shown in logs + admin panel)
 *   botId    - Discord application id (used to build the Playwright vote URL and
 *              to resolve entityId when it isn't hard-coded)
 *   entityId - (optional) Top.gg GraphQL entity id used by the API vote method.
 *              Resolved from botId automatically when omitted.
 */
export const BOTS = {
  // --- Card / gacha collection bots (the classic vote-farm targets) ---
  karuta: {
    key: 'karuta',
    name: 'Karuta',
    entityId: '4283790394010009600',
    botId: '646937666251915264',
  },
  sofi: {
    key: 'sofi',
    name: 'Sofi',
    entityId: '208581066080296960',
    botId: '853629533855809596',
  },
  mudae: {
    key: 'mudae',
    name: 'Mudae',
    entityId: '4283371123597541376',
    botId: '432610292342587392',
  },

  // --- Popular economy / collection bots with vote rewards ---
  owo: {
    key: 'owo',
    name: 'OwO',
    entityId: '4283331369380249600',
    botId: '408785106942164992',
  },
  poketwo: {
    key: 'poketwo',
    name: 'Pokétwo',
    entityId: '4283991920317988865',
    botId: '716390085896962058',
  },
  pokemeow: {
    key: 'pokemeow',
    name: 'PokéMeow',
    entityId: '4283790537891414017',
    botId: '664508672713424926',
  },
  dankmemer: {
    key: 'dankmemer',
    name: 'Dank Memer',
    entityId: '4283303439207923712',
    botId: '270904126974590976',
  },
};

/**
 * Bots assigned to a user by default when the admin hasn't picked anything yet.
 * Keeps existing single-bot (Karuta) behaviour working out of the box.
 */
export const DEFAULT_BOTS = ['karuta'];

/** All configured bot keys, e.g. ['karuta', 'sofi', ...]. */
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

const GRAPHQL_URL = 'https://api.top.gg/graphql';

// In-memory cache of botId → entityId so we only hit the API once per process.
const entityIdCache = new Map();

/**
 * Resolve a bot's Top.gg GraphQL entity id from its public Discord application
 * id (botId). This is the same lookup the Top.gg vote page does; it needs no
 * authentication. Results are cached for the lifetime of the process.
 *
 * @param {string} botId - Discord application id (the number in the vote URL)
 * @returns {Promise<string>} the Top.gg entity id
 * @throws if the bot can't be found on Top.gg or the request fails
 */
export async function resolveEntityId(botId) {
  if (entityIdCache.has(botId)) {
    return entityIdCache.get(botId);
  }

  const payload = {
    query: 'query($externalId: String!) { discordBot(externalId: $externalId) { id } }',
    variables: { externalId: String(botId) },
  };

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'origin': 'https://top.gg',
      'referer': 'https://top.gg/',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to resolve entityId for botId ${botId}: HTTP ${response.status}`);
  }

  const body = await response.json();
  if (body.errors && body.errors.length > 0) {
    throw new Error(`Failed to resolve entityId for botId ${botId}: ${body.errors[0].message}`);
  }

  const entityId = body.data?.discordBot?.id;
  if (!entityId) {
    throw new Error(`Bot with botId ${botId} was not found on Top.gg`);
  }

  entityIdCache.set(botId, entityId);
  return entityId;
}

/**
 * Return a bot's entityId, using the hard-coded value if present or resolving
 * (and caching) it from botId otherwise. Use this instead of reading
 * bot.entityId directly so registry entries can omit entityId.
 *
 * @param {object} bot - a bot config from BOTS
 * @returns {Promise<string>} the Top.gg entity id
 */
export async function getEntityId(bot) {
  if (bot.entityId) {
    return bot.entityId;
  }
  return resolveEntityId(bot.botId);
}
