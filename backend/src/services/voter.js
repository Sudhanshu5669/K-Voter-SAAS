import crypto from 'crypto';

const GRAPHQL_URL = 'https://api.top.gg/graphql';
const ENTITY_ID = '4283790394010009600'; // Karuta's Top.gg entity ID

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
 * @returns {Promise<object>} { status: 'VOTED' | 'NOT_VOTED' | 'ERROR', timeUntilNextVote: number, error?: string }
 */
export async function checkVoteStatus(sessionToken) {
  try {
    const payload = {
      query: "query gvs($i: String!) { entity(id: $i) { id voteStatus { timeUntilNextVote status id isSubscribed } } }",
      operationName: "gvs",
      variables: {
        i: ENTITY_ID
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
 * @returns {Promise<object>} { status: 'success' | 'already_voted' | 'captcha' | 'error', newVoteCount?: number, detail: string }
 */
export async function castVote(sessionToken) {
  try {
    const traceId = crypto.randomUUID();
    const encodedData = Buffer.from(JSON.stringify({ traceId })).toString('base64');

    const payload = {
      query: "mutation VoteEntity($entityId: String!, $encodedData: String!, $query: String!) { voteEntity(entityId: $entityId, encodedData: $encodedData, query: $query) { isAcknowledged newVoteCount canRetry error captchaProvider } }",
      operationName: "VoteEntity",
      variables: {
        entityId: ENTITY_ID,
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
