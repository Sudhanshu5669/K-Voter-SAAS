/**
 * K-Voter User Dashboard JS
 * Handles: user data display, token management, vote logs, admin nav link injection
 */
document.addEventListener('DOMContentLoaded', async () => {

  // ── Auth Guard ────────────────────────────────────────────────────────────
  const isAuthed = await checkAuth(true);
  if (!isAuthed) return;

  // ── UI Elements ───────────────────────────────────────────────────────────
  const userAvatar          = document.getElementById('user-avatar');
  const usernameEl          = document.getElementById('username');
  const userEmailEl         = document.getElementById('user-email');
  const logoutBtn           = document.getElementById('logout-btn');
  const tokenForm           = document.getElementById('token-form');
  const tokenInput          = document.getElementById('token-input');

  // Status Elements
  const subDot              = document.getElementById('sub-dot');
  const subStatusText       = document.getElementById('sub-status-text');
  const tokenBadge          = document.getElementById('token-status-badge');
  const lastVoteTimeEl      = document.getElementById('last-vote-time');
  const lastVoteResultBadge = document.getElementById('last-vote-result-badge');

  // Containers
  const logsTableBody       = document.getElementById('logs-table-body');
  const stripeCardContainer = document.getElementById('stripe-card-container');
  const pricingInfoText     = document.getElementById('pricing-info-text');
  const adminNavItem        = document.getElementById('admin-nav-item');

  // Bind logout
  logoutBtn?.addEventListener('click', logoutUser);

  // ── Load User Profile ─────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (user) {
    const meta = user.user_metadata || {};
    const displayName = meta.full_name || meta.name || meta.custom_claims?.global_name || user.email.split('@')[0];
    usernameEl.textContent = displayName;
    userEmailEl.textContent = user.email;

    const avatarUrl = meta.avatar_url || meta.picture;
    if (avatarUrl && userAvatar) {
      userAvatar.src = avatarUrl;
      userAvatar.style.display = 'block';
    }
  }

  // ── Check URL params (from checkout redirects) ────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('checkout') === 'success') {
    showToast('Subscription activated successfully! Welcome to K-Voter.', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // ── Load All Dashboard Data ───────────────────────────────────────────────
  async function loadDashboardData() {
    const token = await getSessionToken();
    if (!token) return;

    try {
      // Fetch user status
      const statusRes = await fetch('/api/user/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!statusRes.ok) throw new Error('Failed to retrieve user status');
      const statusData = await statusRes.json();

      // ── Render Subscription Status ──
      const subStatus = statusData.subscription_status || 'inactive';
      const isApproved = subStatus === 'active';

      if (isApproved) {
        subDot.className = 'pulse-dot active';
        subStatusText.textContent = 'APPROVED';
        pricingInfoText.textContent = 'Your account is approved! Automated voting runs every 6 hours.';
      } else {
        subDot.className = 'pulse-dot inactive';
        subStatusText.textContent = 'PENDING';
        pricingInfoText.textContent = 'Your account is pending approval. Contact the admin to activate automated voting.';
      }

      // ── Render Token Status Badge ──
      if (statusData.has_token) {
        tokenBadge.className = 'badge badge-success';
        tokenBadge.textContent = 'Configured';
        tokenInput.placeholder = '•••••••••••••••••••••••••••••• (Token secured)';
      } else {
        tokenBadge.className = 'badge badge-danger';
        tokenBadge.textContent = 'Missing';
        tokenInput.placeholder = 'Paste __Secure-authjs.session-token value here...';
      }

      // ── Render Last Vote ──
      if (statusData.last_vote_at) {
        lastVoteTimeEl.textContent = new Date(statusData.last_vote_at).toLocaleString();
      } else {
        lastVoteTimeEl.textContent = 'Never';
      }

      // ── Render Last Result Badge ──
      const result = statusData.last_vote_result;
      if (result) {
        lastVoteResultBadge.textContent = result.replace('_', ' ').toUpperCase();
        lastVoteResultBadge.className = result === 'success'
          ? 'badge badge-success'
          : result === 'already_voted'
          ? 'badge badge-info'
          : result === 'captcha'
          ? 'badge badge-warning'
          : 'badge badge-danger';
      } else {
        lastVoteResultBadge.textContent = 'N/A';
        lastVoteResultBadge.className = 'badge badge-info';
      }

      // ── Render Account Activation Card ──
      renderActivationCard(isApproved, statusData.approved_until);

      // ── Check Admin & Show Admin Nav Link ──
      await checkAndShowAdminLink(token);

      // ── Load Logs ──
      await loadLogsTable(token);

    } catch (err) {
      console.error('Error loading dashboard data:', err);
      showToast('Error loading dashboard data.', 'error');
    }
  }

  // ── Render Activation Card ────────────────────────────────────────────────
  function renderActivationCard(isApproved, approvedUntil) {
    stripeCardContainer.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 0.75rem;';

    // Status badge
    const badge = document.createElement('div');
    badge.style.cssText = `
      width: 100%; text-align: center; padding: 12px; border-radius: 12px;
      font-weight: 600; font-size: 0.95rem;
    `;
    if (isApproved) {
      badge.style.backgroundColor = 'rgba(16, 185, 129, 0.12)';
      badge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      badge.style.color = 'var(--success)';
      badge.textContent = '✓ Automated Voting Active';
    } else {
      badge.style.backgroundColor = 'rgba(245, 158, 11, 0.12)';
      badge.style.border = '1px solid rgba(245, 158, 11, 0.3)';
      badge.style.color = 'var(--warning)';
      badge.textContent = '⚠ Pending Admin Activation';
    }
    wrapper.appendChild(badge);

    // Approved Until expiry info
    if (isApproved && approvedUntil) {
      const d = new Date(approvedUntil);
      const now = new Date();
      const daysLeft = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
      const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

      const expiryEl = document.createElement('div');
      expiryEl.style.cssText = 'text-align: center; font-size: 0.82rem; padding: 0.4rem;';

      if (daysLeft <= 0) {
        expiryEl.style.color = 'var(--error)';
        expiryEl.innerHTML = `⏰ Access expired on <strong>${dateStr}</strong>. Contact admin to renew.`;
      } else if (daysLeft <= 5) {
        expiryEl.style.color = 'var(--warning)';
        expiryEl.innerHTML = `⚠ Expires on <strong>${dateStr}</strong> (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left). Contact admin to renew.`;
      } else {
        expiryEl.style.color = 'var(--text-secondary)';
        expiryEl.innerHTML = `Access valid until <strong style="color:var(--text-primary)">${dateStr}</strong> (${daysLeft} days)`;
      }
      wrapper.appendChild(expiryEl);
    }

    stripeCardContainer.appendChild(wrapper);
  }

  // ── Check Admin & Inject Nav Link ─────────────────────────────────────────
  async function checkAndShowAdminLink(token) {
    try {
      const res = await fetch('/api/admin/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.is_admin && adminNavItem) {
          adminNavItem.style.display = 'block';
        }
      }
    } catch {
      // Non-admin or error — silently ignore
    }
  }

  // ── Load Vote Logs Table ──────────────────────────────────────────────────
  async function loadLogsTable(token) {
    try {
      const logsRes = await fetch('/api/user/logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!logsRes.ok) throw new Error('Failed to retrieve logs');
      const { logs } = await logsRes.json();

      logsTableBody.innerHTML = '';

      if (!logs || logs.length === 0) {
        logsTableBody.innerHTML = `
          <tr>
            <td colspan="3" style="text-align: center; color: var(--text-muted);">
              No executions recorded yet. Votes will appear here once automation runs.
            </td>
          </tr>`;
        return;
      }

      logs.forEach(log => {
        const row = document.createElement('tr');

        // Date cell
        const dateCell = document.createElement('td');
        dateCell.textContent = new Date(log.voted_at).toLocaleString();
        row.appendChild(dateCell);

        // Status badge
        const statusCell = document.createElement('td');
        const badge = document.createElement('span');
        badge.textContent = log.status.replace('_', ' ').toUpperCase();
        badge.className = log.status === 'success'
          ? 'badge badge-success'
          : log.status === 'already_voted'
          ? 'badge badge-info'
          : log.status === 'captcha'
          ? 'badge badge-warning'
          : 'badge badge-danger';
        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        // Detail
        const detailCell = document.createElement('td');
        detailCell.textContent = log.detail || '—';
        row.appendChild(detailCell);

        logsTableBody.appendChild(row);
      });

    } catch (err) {
      console.error('Logs fetch failed:', err);
    }
  }

  // ── Token Form Submission ─────────────────────────────────────────────────
  tokenForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tokenValue = tokenInput.value.trim();
    if (!tokenValue) {
      showToast('Please enter a valid non-empty token string.', 'error');
      return;
    }

    const sessionToken = await getSessionToken();
    if (!sessionToken) return;

    const saveBtn = document.getElementById('save-token-btn');
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Encrypting & Saving...';

      const response = await fetch('/api/user/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ token: tokenValue })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        showToast('Token encrypted and secured successfully!', 'success');
        tokenInput.value = '';
        await loadDashboardData();
      } else {
        throw new Error(data.error || 'Failed to save token');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save & Secure Token';
    }
  });

  // ── Cookie Extraction Guide ───────────────────────────────────────────────
  document.getElementById('view-guide-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    alert(
      "HOW TO EXTRACT YOUR TOP.GG TOKEN:\n\n" +
      "1. Go to https://top.gg and log in with Discord.\n" +
      "2. Press F12 to open Developer Tools.\n" +
      "3. Click the 'Application' tab (Chrome/Edge) or 'Storage' tab (Firefox).\n" +
      "4. In the left sidebar, expand 'Cookies' and click 'https://top.gg'.\n" +
      "5. Find the cookie named '__Secure-authjs.session-token'.\n" +
      "6. Copy the full value (a long JWT starting with 'ey...' or similar).\n" +
      "7. Paste it in the token field and click Save.\n\n" +
      "⚠ Your token expires if you log out of Top.gg. Re-paste if votes start failing."
    );
  });

  // ── Start Loading ─────────────────────────────────────────────────────────
  await loadDashboardData();
});
