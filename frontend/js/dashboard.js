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

      // 2. Render Approval Status
      const subStatus = statusData.subscription_status || 'inactive';
      const isApproved = subStatus === 'active';
      
      subStatusText.textContent = isApproved ? 'APPROVED' : 'PENDING APPROVAL';
      if (isApproved) {
        subDot.className = 'pulse-dot active';
        pricingInfoText.textContent = 'Your account is approved! Automated voting runs every 6 hours.';
      } else {
        subDot.className = 'pulse-dot inactive';
        pricingInfoText.textContent = 'Your account is pending approval. Automated voting is currently disabled. Contact admin to activate.';
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

      // 6. Load Account Status Buttons/Info
      renderAccountStatusControls(isApproved);

      // Check Admin status and load admin panel if applicable
      await checkAndLoadAdminPanel(token);

      // 7. Load Logs Table
      await loadLogsTable(token);

    } catch (err) {
      console.error('Error loading dashboard data:', err);
      showToast('Error loading stats.', 'error');
    }
  }

  /**
   * Render Account Activation / Status Info in Sidebar
   */
  function renderAccountStatusControls(isApproved) {
    stripeActionContainer.innerHTML = '';
    stripeCardContainer.innerHTML = '';

    const statusBadge = document.createElement('div');
    statusBadge.style.width = '100%';
    statusBadge.style.textAlign = 'center';
    statusBadge.style.padding = '12px';
    statusBadge.style.borderRadius = '12px';
    statusBadge.style.fontWeight = '600';
    statusBadge.style.fontSize = '0.95rem';

    if (isApproved) {
      statusBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.12)';
      statusBadge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      statusBadge.style.color = 'var(--success)';
      statusBadge.textContent = '✓ Automated Voting Active';
    } else {
      statusBadge.style.backgroundColor = 'rgba(245, 158, 11, 0.12)';
      statusBadge.style.border = '1px solid rgba(245, 158, 11, 0.3)';
      statusBadge.style.color = 'var(--warning)';
      statusBadge.textContent = '⚠ Pending Admin Activation';
    }
    stripeCardContainer.appendChild(statusBadge);
  }

  /**
   * Check if current user is admin, and render panel
   */
  async function checkAndLoadAdminPanel(token) {
    const adminPanel = document.getElementById('admin-panel');
    if (!adminPanel) return;

    try {
      const res = await fetch('/api/admin/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        // Not an admin, hide panel
        adminPanel.style.display = 'none';
        return;
      }

      const data = await res.json();
      if (data.success && data.is_admin) {
        adminPanel.style.display = 'block';
        await loadAdminUsers(token);
        
        // Bind manual cron trigger button
        const triggerCronBtn = document.getElementById('trigger-cron-btn');
        if (triggerCronBtn && !triggerCronBtn.dataset.bound) {
          triggerCronBtn.dataset.bound = 'true';
          triggerCronBtn.addEventListener('click', async () => {
            try {
              triggerCronBtn.disabled = true;
              triggerCronBtn.textContent = 'Executing Cron...';
              showToast('Manually triggering vote cron job...', 'info');

              const triggerRes = await fetch('/api/admin/trigger-cron', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
              });

              const triggerData = await triggerRes.json();
              triggerCronBtn.disabled = false;
              triggerCronBtn.textContent = 'Trigger Vote Cron Now';

              if (triggerRes.ok && triggerData.success) {
                const s = triggerData.results;
                showToast(`Cron completed: Success ${s.success}, Already Voted ${s.already_voted}, Captcha ${s.captcha}, Errors ${s.error}`, 'success');
                await loadDashboardData(); // Reload UI logs and data
              } else {
                throw new Error(triggerData.error || 'Failed to execute cron');
              }
            } catch (err) {
              triggerCronBtn.disabled = false;
              triggerCronBtn.textContent = 'Trigger Vote Cron Now';
              showToast(err.message, 'error');
            }
          });
        }
      }
    } catch (e) {
      console.warn('Admin check skipped or failed:', e);
      adminPanel.style.display = 'none';
    }
  }

  /**
   * Fetch and display user list for admin
   */
  async function loadAdminUsers(token) {
    const tableBody = document.getElementById('admin-users-table-body');
    if (!tableBody) return;

    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to retrieve registered users');
      const { users } = await res.json();

      tableBody.innerHTML = '';

      if (!users || users.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted);">No registered users found.</td>
          </tr>`;
        return;
      }

      users.forEach(user => {
        const row = document.createElement('tr');
        
        // User (Username)
        const nameCell = document.createElement('td');
        nameCell.style.fontWeight = '500';
        nameCell.textContent = user.discord_username;
        row.appendChild(nameCell);

        // Email
        const emailCell = document.createElement('td');
        emailCell.textContent = user.email || 'N/A';
        row.appendChild(emailCell);

        // Status Badge
        const statusCell = document.createElement('td');
        const badge = document.createElement('span');
        const isApproved = user.subscription_status === 'active';
        badge.textContent = isApproved ? 'APPROVED' : 'INACTIVE';
        badge.className = isApproved ? 'badge badge-success' : 'badge badge-danger';
        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        // Last Vote Time
        const lastVoteCell = document.createElement('td');
        lastVoteCell.textContent = user.last_vote_at ? new Date(user.last_vote_at).toLocaleString() : 'Never';
        row.appendChild(lastVoteCell);

        // Last Vote Result
        const resultCell = document.createElement('td');
        const resBadge = document.createElement('span');
        const r = user.last_vote_result;
        if (r) {
          resBadge.textContent = r.replace('_', ' ').toUpperCase();
          if (r === 'success') resBadge.className = 'badge badge-success';
          else if (r === 'already_voted') resBadge.className = 'badge badge-info';
          else if (r === 'captcha') resBadge.className = 'badge badge-warning';
          else resBadge.className = 'badge badge-danger';
        } else {
          resBadge.textContent = 'N/A';
          resBadge.className = 'badge badge-info';
        }
        resultCell.appendChild(resBadge);
        row.appendChild(resultCell);

        // Action Button
        const actionCell = document.createElement('td');
        actionCell.style.textAlign = 'right';
        const actionBtn = document.createElement('button');
        actionBtn.className = isApproved ? 'btn btn-secondary' : 'btn btn-primary';
        actionBtn.style.padding = '0.4rem 0.8rem';
        actionBtn.style.fontSize = '0.8rem';
        actionBtn.textContent = isApproved ? 'Suspend' : 'Approve';
        
        actionBtn.addEventListener('click', async () => {
          try {
            actionBtn.disabled = true;
            const toggleRes = await fetch(`/api/admin/users/${user.id}/toggle-approval`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const toggleData = await toggleRes.json();
            
            if (toggleRes.ok && toggleData.success) {
              showToast(`Status updated successfully!`, 'success');
              await loadDashboardData(); // Refresh everything
            } else {
              throw new Error(toggleData.error || 'Failed to update user status');
            }
          } catch (err) {
            actionBtn.disabled = false;
            showToast(err.message, 'error');
          }
        });

        actionCell.appendChild(actionBtn);
        row.appendChild(actionCell);

        tableBody.appendChild(row);
      });

    } catch (e) {
      console.error('[ADMIN] Load user list error:', e);
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--error);">Error loading registered users list.</td>
        </tr>`;
    }
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
