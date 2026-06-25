document.addEventListener('DOMContentLoaded', async () => {
  // Enforce authentication
  const isAuthed = await checkAuth(true);
  if (!isAuthed) return;

  // UI Elements
  const userAvatar = document.getElementById('user-avatar');
  const usernameEl = document.getElementById('username');
  const userEmailEl = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');
  const tokenForm = document.getElementById('token-form');
  const tokenInput = document.getElementById('token-input');
  
  // Status Elements
  const subDot = document.getElementById('sub-dot');
  const subStatusText = document.getElementById('sub-status-text');
  const tokenBadge = document.getElementById('token-status-badge');
  const lastVoteTimeEl = document.getElementById('last-vote-time');
  const lastVoteResultBadge = document.getElementById('last-vote-result-badge');
  
  // Containers
  const logsTableBody = document.getElementById('logs-table-body');
  const stripeActionContainer = document.getElementById('stripe-action-container');
  const stripeCardContainer = document.getElementById('stripe-card-container');
  const pricingInfoText = document.getElementById('pricing-info-text');

  let appConfig = null;

  // Bind logout action
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutUser);
  }

  // Load User Information
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

  // Check URL parameters for Checkout notifications
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('checkout') === 'success') {
    showToast('Subscription activated successfully! Welcome to K-Voter.', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  /**
   * Fetch current subscription, token status and logs
   */
  async function loadDashboardData() {
    const token = await getSessionToken();
    if (!token) return;

    try {
      // 0. Load public configuration parameters if not loaded
      if (!appConfig) {
        const configRes = await fetch('/api/auth/config');
        if (configRes.ok) {
          appConfig = await configRes.json();
        }
      }

      // 1. Fetch User status from backend
      const statusRes = await fetch('/api/user/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!statusRes.ok) throw new Error('Failed to retrieve user status');
      const statusData = await statusRes.json();

      // 2. Render Subscription Status
      const subStatus = statusData.subscription_status || 'inactive';
      const isSubbed = subStatus === 'active' || subStatus === 'trialing';
      
      subStatusText.textContent = subStatus.toUpperCase();
      if (isSubbed) {
        subDot.className = 'pulse-dot active';
        pricingInfoText.textContent = 'Your premium subscription is active. Enjoy automatic daily voting!';
      } else {
        subDot.className = 'pulse-dot inactive';
        pricingInfoText.textContent = 'Your subscription is currently inactive. Activate your plan below to enable automated voting.';
      }

      // 3. Render Token Status Badge
      if (statusData.has_token) {
        tokenBadge.className = 'badge badge-success';
        tokenBadge.textContent = 'Configured';
        tokenInput.placeholder = '•••••••••••••••••••••••••••••••• (Secured)';
      } else {
        tokenBadge.className = 'badge badge-danger';
        tokenBadge.textContent = 'Missing';
        tokenInput.placeholder = 'Paste __Secure-authjs.session-token cookie value here...';
      }

      // 4. Render Last Vote details
      if (statusData.last_vote_at) {
        const voteDate = new Date(statusData.last_vote_at);
        lastVoteTimeEl.textContent = voteDate.toLocaleString();
      } else {
        lastVoteTimeEl.textContent = 'Never';
      }

      // 5. Render Last Vote Result Badge
      const result = statusData.last_vote_result;
      if (result) {
        lastVoteResultBadge.textContent = result.replace('_', ' ').toUpperCase();
        if (result === 'success') {
          lastVoteResultBadge.className = 'badge badge-success';
        } else if (result === 'already_voted') {
          lastVoteResultBadge.className = 'badge badge-info';
        } else if (result === 'captcha') {
          lastVoteResultBadge.className = 'badge badge-warning';
        } else {
          lastVoteResultBadge.className = 'badge badge-danger';
        }
      } else {
        lastVoteResultBadge.textContent = 'N/A';
        lastVoteResultBadge.className = 'badge badge-info';
      }

      // 6. Load Payment Action Buttons
      renderBillingControls(isSubbed);

      // 7. Load Logs Table
      await loadLogsTable(token);

    } catch (err) {
      console.error('Error loading dashboard data:', err);
      showToast('Error loading stats.', 'error');
    }
  }

  /**
   * Render Buy Me a Coffee checkout or portal controls
   */
  function renderBillingControls(isSubbed) {
    stripeActionContainer.innerHTML = '';
    stripeCardContainer.innerHTML = '';

    if (isSubbed) {
      // Show portal link in header
      const portalBtn = document.createElement('button');
      portalBtn.className = 'btn btn-secondary';
      portalBtn.textContent = 'Manage Subscription';
      portalBtn.addEventListener('click', redirectToBillingPortal);
      stripeActionContainer.appendChild(portalBtn);

      const portalCardBtn = document.createElement('button');
      portalCardBtn.className = 'btn btn-secondary';
      portalCardBtn.style.width = '100%';
      portalCardBtn.textContent = 'Billing Settings';
      portalCardBtn.addEventListener('click', redirectToBillingPortal);
      stripeCardContainer.appendChild(portalCardBtn);
    } else {
      // Show checkout link in right panel
      const checkoutBtn = document.createElement('button');
      checkoutBtn.className = 'btn btn-accent';
      checkoutBtn.style.width = '100%';
      checkoutBtn.textContent = 'Subscribe Now (Buy Me a Coffee)';
      checkoutBtn.addEventListener('click', redirectToCheckout);
      stripeCardContainer.appendChild(checkoutBtn);
    }
  }

  function redirectToCheckout() {
    if (!appConfig?.bmcMembershipUrl) {
      showToast('Buy Me a Coffee membership link is not configured.', 'error');
      return;
    }
    
    showToast('Redirecting to Buy Me a Coffee membership page...', 'info');
    // Open BMC membership page in a new window or current tab
    window.location.href = appConfig.bmcMembershipUrl;
  }

  function redirectToBillingPortal() {
    showToast('To cancel or update payment details, please manage it from your Buy Me a Coffee supporter dashboard.', 'info');
    setTimeout(() => {
      window.location.href = 'https://www.buymeacoffee.com';
    }, 2500);
  }

  /**
   * Fetch and populate logs table
   */
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
            <td colspan="3" style="text-align: center; color: var(--text-muted);">No executions recorded yet. Active votes will display here.</td>
          </tr>`;
        return;
      }

      logs.forEach(log => {
        const row = document.createElement('tr');
        
        // Date
        const dateCell = document.createElement('td');
        dateCell.textContent = new Date(log.voted_at).toLocaleString();
        row.appendChild(dateCell);

        // Status Badge
        const statusCell = document.createElement('td');
        const badge = document.createElement('span');
        badge.textContent = log.status.replace('_', ' ').toUpperCase();
        
        if (log.status === 'success') {
          badge.className = 'badge badge-success';
        } else if (log.status === 'already_voted') {
          badge.className = 'badge badge-info';
        } else if (log.status === 'captcha') {
          badge.className = 'badge badge-warning';
        } else {
          badge.className = 'badge badge-danger';
        }
        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        // Detail
        const detailCell = document.createElement('td');
        detailCell.textContent = log.detail || '-';
        row.appendChild(detailCell);

        logsTableBody.appendChild(row);
      });

    } catch (e) {
      console.error('Logs fetch failed:', e);
    }
  }

  // Token submission handler
  if (tokenForm) {
    tokenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const tokenValue = tokenInput.value.trim();
      if (!tokenValue) {
        showToast('Please enter a valid non-empty token string.', 'error');
        return;
      }

      const token = await getSessionToken();
      if (!token) return;

      try {
        const saveBtn = document.getElementById('save-token-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Securing Token...';

        const response = await fetch('/api/user/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ token: tokenValue })
        });

        const data = await response.json();
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Secure Token';

        if (response.ok && data.success) {
          showToast('Top.gg session token encrypted and secured!', 'success');
          tokenInput.value = ''; // Clear input field
          await loadDashboardData(); // Refresh UI
        } else {
          throw new Error(data.error || 'Failed to save token');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Guide helper modal link
  const viewGuideBtn = document.getElementById('view-guide-btn');
  if (viewGuideBtn) {
    viewGuideBtn.addEventListener('click', (e) => {
      e.preventDefault();
      alert("HOW TO EXTRACT YOUR TOKEN:\n\n1. Go to top.gg on your desktop and log in via Discord.\n2. Open Developer Tools (press F12 or right-click -> Inspect).\n3. Go to the 'Application' tab (Chrome/Edge) or 'Storage' tab (Firefox).\n4. In the left panel under 'Cookies', click on 'https://top.gg'.\n5. Find '__Secure-authjs.session-token' in the list.\n6. Copy its full value (a long jwt token) and paste it here.");
    });
  }

  // Start data loading
  await loadDashboardData();
});
