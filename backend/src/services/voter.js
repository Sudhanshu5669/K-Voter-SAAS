import crypto from 'crypto';
import { getBot, getEntityId } from '../config/bots.js';

const GRAPHQL_URL = 'https://api.top.gg/graphql';

// Default bot used when a caller doesn't pass one (keeps single-bot callers working).
const DEFAULT_BOT = getBot('karuta');

function getHeaders(sessionToken) {
  return {
    'accept': 'application/json',
    'content-type': 'application/json',
    'origin': 'https://top.gg',
    'referer': 'https://top.gg/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'cookie': `__Secure-authjs.session-token=${sessionToken}`
  };
}

/**
 * Check the vote status of a user
 * @param {string} sessionToken - Decrypted top.gg session token
 * @param {object} [bot] - Bot config from the registry (defaults to Karuta)
 * @returns {Promise<object>} { status: 'VOTED' | 'NOT_VOTED' | 'ERROR', timeUntilNextVote: number, error?: string }
 */
export async function checkVoteStatus(sessionToken, bot = DEFAULT_BOT) {
  try {
    const entityId = await getEntityId(bot);
    const payload = {
      query: "query gvs($i: String!) { entity(id: $i) { id voteStatus { timeUntilNextVote status id isSubscribed } } }",
      operationName: "gvs",
      variables: {
        i: entityId
      }
    };

    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: getHeaders(sessionToken),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP Error ${response.status}: ${text.substring(0, 100)}`);
    }

    const resBody = await response.json();
    if (resBody.errors && resBody.errors.length > 0) {
      throw new Error(resBody.errors[0].message);
    }

    const voteStatus = resBody.data?.entity?.voteStatus;
    if (!voteStatus) {
      console.error('[VOTER] GraphQL response missing voteStatus. Full body:', JSON.stringify(resBody));
      throw new Error('Vote status details missing in GraphQL response');
    }

    return {
      status: voteStatus.status, // "VOTED" or "NOT_VOTED"
      timeUntilNextVote: voteStatus.timeUntilNextVote || 0
    };
  } catch (err) {
    return {
      status: 'ERROR',
      timeUntilNextVote: 0,
      error: err.message
    };
  }
}

/**
 * Cast a vote on behalf of a user
 * @param {string} sessionToken - Decrypted top.gg session token
 * @param {object} [bot] - Bot config from the registry (defaults to Karuta)
 * @returns {Promise<object>} { status: 'success' | 'already_voted' | 'captcha' | 'error', newVoteCount?: number, detail: string }
 */
export async function castVote(sessionToken, bot = DEFAULT_BOT) {
  try {
    const traceId = crypto.randomUUID();
    const encodedData = Buffer.from(JSON.stringify({ traceId })).toString('base64');

    const entityId = await getEntityId(bot);
    const payload = {
      query: "mutation VoteEntity($entityId: String!, $encodedData: String!, $query: String!) { voteEntity(entityId: $entityId, encodedData: $encodedData, query: $query) { isAcknowledged newVoteCount canRetry error captchaProvider } }",
      operationName: "VoteEntity",
      variables: {
        entityId: entityId,
        encodedData: encodedData,
        query: ""
      }
    };

    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: getHeaders(sessionToken),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP Error ${response.status}: ${text.substring(0, 100)}`);
    }

    const resBody = await response.json();
    if (resBody.errors && resBody.errors.length > 0) {
      throw new Error(resBody.errors[0].message);
    }

    const voteResult = resBody.data?.voteEntity;
    if (!voteResult) {
      throw new Error('VoteEntity response details missing');
    }

    if (voteResult.isAcknowledged) {
      return {
        status: 'success',
        newVoteCount: voteResult.newVoteCount,
        detail: 'Vote cast successfully'
      };
    }

    if (voteResult.error === 'USER_ALREADY_VOTED') {
      return {
        status: 'already_voted',
        detail: 'Already voted within the last 12 hours'
      };
    }

    if (voteResult.error === 'CAPTCHA_REQUIRED') {
      return {
        status: 'captcha',
        detail: `Captcha required (${voteResult.captchaProvider || 'hcaptcha'})`
      };
    }

    return {
      status: 'error',
      detail: `API Error: ${voteResult.error}`
    };
  } catch (err) {
    return {
      status: 'error',
      detail: err.message
    };
  }
}

/**
 * Cast a vote on behalf of a user using browser automation (Playwright)
 * Translated from the user's robust Python implementation.
 * @param {string} sessionToken - Decrypted top.gg session token
 * @param {object} [bot] - Bot config from the registry (defaults to Karuta)
 * @returns {Promise<object>} { status: 'success' | 'already_voted' | 'captcha' | 'error', detail: string }
 */
export async function castVotePlaywright(sessionToken, bot = DEFAULT_BOT) {
  let browser = null;
  try {
    // Dynamically import playwright-chromium (optional dependency)
    let chromium;
    try {
      const pw = await import('playwright-chromium');
      chromium = pw.chromium;
    } catch (importErr) {
      throw new Error('Playwright is not installed. Browser fallback unavailable. Install with: npm install playwright-chromium && npx playwright install chromium');
    }

    console.log('[VOTER-PLAYWRIGHT] Launching browser...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });

    // Inject session cookies for both top.gg and .top.gg
    await context.addCookies([
      {
        name: '__Secure-authjs.session-token',
        value: sessionToken,
        domain: 'top.gg',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax'
      },
      {
        name: '__Secure-authjs.session-token',
        value: sessionToken,
        domain: '.top.gg',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax'
      }
    ]);

    const page = await context.newPage();

    // Intercept GraphQL vote responses
    let voteResult = null;
    page.on('response', async (response) => {
      if (response.url().includes('api.top.gg/graphql')) {
        try {
          const body = await response.json();
          const ve = body?.data?.voteEntity;
          if (ve) {
            voteResult = { ...voteResult, ...ve };
          }
        } catch (e) {
          // ignore parsing/response reading errors
        }
      }
    });

    const voteUrl = `https://top.gg/bot/${bot.botId}/vote`;
    console.log(`[VOTER-PLAYWRIGHT] Loading ${voteUrl} ...`);
    try {
      await page.goto(voteUrl, {
        timeout: 40000,
        waitUntil: 'networkidle'
      });
    } catch (err) {
      console.warn('[VOTER-PLAYWRIGHT] Timed out waiting for network idle. Proceeding with DOM elements...');
    }

    // Let the page hydrate/stabilize for 3 seconds
    await page.waitForTimeout(3000);

    console.log('[VOTER-PLAYWRIGHT] Waiting for page auth hydration...');
    try {
      await page.waitForSelector('#__next, body', { timeout: 20000 });
    } catch (err) {
      console.warn('[VOTER-PLAYWRIGHT] Page elements did not stabilize, scanning DOM directly...');
    }

    const selectors = [
      "button:has-text('Vote')",
      "[data-testid='vote-button']",
      "button:has-text('vote')",
      "a:has-text('Vote')"
    ];

    let voteBtn = null;
    const maxWaitSeconds = 45;
    const startTime = Date.now();
    let lastLoggedCountdown = null;

    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
      const currentText = await page.innerText('body');
      const currentTextLower = currentText.toLowerCase();

      // 1. Check if session expired / not logged in
      if (currentTextLower.includes('login to vote') || currentTextLower.includes('sign in to vote')) {
        console.error('[VOTER-PLAYWRIGHT] Not logged in — Top.gg rejected session cookie.');
        return {
          status: 'error',
          detail: 'Login failed: session cookie rejected by top.gg'
        };
      }

      // 2. Check if we already voted
      if (currentTextLower.includes('already voted') || currentTextLower.includes('vote again in') || currentTextLower.includes('next vote')) {
        console.log('[VOTER-PLAYWRIGHT] User already voted.');
        return {
          status: 'already_voted',
          detail: 'Already voted within the last 12 hours (detected via text)'
        };
      }

      // 3. Check and log ad countdown
      if (currentTextLower.includes('you will be able to vote after this ad')) {
        const lines = currentText.split('\n');
        let countdownVal = null;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes('you will be able to vote after this ad')) {
            if (i + 1 < lines.length) {
              const nextLine = lines[i + 1].trim();
              if (/^\d+$/.test(nextLine)) {
                countdownVal = parseInt(nextLine, 10);
                break;
              }
            }
          }
        }

        if (countdownVal !== null) {
          if (countdownVal !== lastLoggedCountdown) {
            console.log(`[VOTER-PLAYWRIGHT] Ad active. Waiting for ad to finish (${countdownVal}s remaining)...`);
            lastLoggedCountdown = countdownVal;
          }
        } else {
          if (lastLoggedCountdown === null) {
            console.log('[VOTER-PLAYWRIGHT] Ad active. Waiting for ad to finish...');
            lastLoggedCountdown = -1;
          }
        }
      }

      // 4. Search for visible and active vote button
      for (const sel of selectors) {
        const loc = page.locator(sel).first();
        if (await loc.count() > 0 && await loc.isVisible()) {
          const isDisabled = await loc.isDisabled();
          if (!isDisabled) {
            voteBtn = loc;
            break;
          } else {
            console.log(`[VOTER-PLAYWRIGHT] Vote button found via '${sel}' but it is currently disabled...`);
          }
        }
      }

      if (voteBtn !== null) {
        break;
      }

      await page.waitForTimeout(2000);
    }

    if (voteBtn === null) {
      console.error('[VOTER-PLAYWRIGHT] Could not find the Vote button.');
      return {
        status: 'error',
        detail: 'Could not find the Vote button on top.gg'
      };
    }

    console.log('[VOTER-PLAYWRIGHT] Clicking Vote button...');
    await voteBtn.click();

    console.log('[VOTER-PLAYWRIGHT] Waiting for vote processing...');
    await page.waitForTimeout(8000);

    if (voteResult) {
      const error = voteResult.error || 'NONE';
      const ack = voteResult.isAcknowledged || false;
      const newCount = voteResult.newVoteCount || '?';
      const captcha = voteResult.captchaProvider;

      if (captcha) {
        console.error(`[VOTER-PLAYWRIGHT] Captcha triggered (${captcha}).`);
        return {
          status: 'captcha',
          detail: `Captcha required (${captcha})`
        };
      }

      if (error && error !== 'NONE') {
        if (error === 'USER_ALREADY_VOTED' || error.toLowerCase().includes('already')) {
          console.log('[VOTER-PLAYWRIGHT] Already voted (GraphQL error).');
          return {
            status: 'already_voted',
            detail: 'Already voted within the last 12 hours'
          };
        }
        console.error(`[VOTER-PLAYWRIGHT] Vote failed with GraphQL error: ${error}`);
        return {
          status: 'error',
          detail: `Vote failed with GraphQL error: ${error}`
        };
      }

      if (ack) {
        console.log(`[VOTER-PLAYWRIGHT] Success! Total ${bot.name} votes: ${newCount}`);
        return {
          status: 'success',
          newVoteCount: newCount,
          detail: `Voted successfully via Playwright (total votes: ${newCount})`
        };
      } else {
        console.warn('[VOTER-PLAYWRIGHT] Vote response not acknowledged:', voteResult);
        return {
          status: 'success',
          detail: 'Voted but response not acknowledged'
        };
      }
    } else {
      const updatedText = await page.innerText('body');
      const updatedTextLower = updatedText.toLowerCase();
      if (updatedTextLower.includes('already voted') || updatedTextLower.includes('vote again')) {
        console.log('[VOTER-PLAYWRIGHT] Success (detected already voted/vote again in body).');
        return {
          status: 'success',
          detail: 'Voted successfully via Playwright'
        };
      } else if (updatedTextLower.includes('success') || updatedTextLower.includes('thank')) {
        console.log('[VOTER-PLAYWRIGHT] Success (success text in body).');
        return {
          status: 'success',
          detail: 'Voted successfully via Playwright'
        };
      } else {
        console.warn('[VOTER-PLAYWRIGHT] Voted but could not confirm result.');
        return {
          status: 'success',
          detail: 'Voted via Playwright (unconfirmed)'
        };
      }
    }

  } catch (err) {
    console.error('[VOTER-PLAYWRIGHT] Browser flow failed:', err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
