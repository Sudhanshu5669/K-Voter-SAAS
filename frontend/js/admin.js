/**
 * K-Voter Admin Panel JS
 * Handles: auth guard, stats loading, user management (approve/disable), cron triggers
 */
document.addEventListener('DOMContentLoaded', async () => {

  // ── Auth Guard ────────────────────────────────────────────────────────────
  const isAuthed = await checkAuth(true);
  if (!isAuthed) return;

  const token = await getSessionToken();
  if (!token) return;

  // Verify admin access — redirect non-admins immediately
  try {
    const adminRes = await fetch('/api/admin/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!adminRes.ok) {
      showToast('Access denied. Admin only.', 'error');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 2000);
      return;
    }
  } catch {
    window.location.href = 'dashboard.html';
    return;
  }

  // ── Bind UI Actions ───────────────────────────────────────────────────────
  document.getElementById('logout-btn')?.addEventListener('click', logoutUser);

  // Search filter
  document.getElementById('user-search').addEventListener('input', function () {
    filterUsers(this.value.trim().toLowerCase());
  });

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    await loadUsers();
    showToast('User list refreshed.', 'success');
  });

  // Trigger Internal Cron
  const internalBtn = document.getElementById('trigger-internal-btn');
  internalBtn?.addEventListener('click', async () => {
    if (internalBtn.disabled) return;
    try {
      internalBtn.disabled = true;
      internalBtn.textContent = 'Running…';
      showToast('Executing internal vote cron…', 'info');

      const res = await fetch('/api/admin/trigger-cron', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showCronResult(data.results);
        const s = data.results;
        showToast(
          `Done! ✅ ${s.success} voted · ⏱ ${s.already_voted} cooldown · 🤖 ${s.captcha} captcha · ❌ ${s.error} error`,
          'success'
        );
        await Promise.all([loadStats(), loadUsers()]);
      } else {
        throw new Error(data.error || 'Cron execution failed');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      internalBtn.disabled = false;
      internalBtn.innerHTML = `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="flex-shrink:0"><path d="M5 3l14 9-14 9V3z"/></svg> Run Internal Cron`;
    }
  });

  // Trigger GitHub Action
  const githubBtn = document.getElementById('trigger-github-btn');
  githubBtn?.addEventListener('click', async () => {
    if (githubBtn.disabled) return;
    try {
      githubBtn.disabled = true;
      githubBtn.textContent = 'Dispatching…';
      showToast('Dispatching GitHub Actions workflow…', 'info');

      const res = await fetch('/api/admin/trigger-github-action', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast(data.message, 'success');
      } else {
        throw new Error(data.error || 'Failed to dispatch workflow');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      githubBtn.disabled = false;
      githubBtn.innerHTML = `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg> Dispatch GitHub Action`;
    }
  });

  // ── Initial Data Load ─────────────────────────────────────────────────────
  await Promise.all([loadStats(), loadUsers()]);

  // Auto-refresh every 30 seconds
  setInterval(async () => {
    await Promise.all([loadStats(), loadUsers()]);
  }, 30000);

  // ── State ─────────────────────────────────────────────────────────────────
  let allUsersData = [];

  // ── Load Stats ────────────────────────────────────────────────────────────
  async function loadStats() {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();

      document.getElementById('stat-total').textContent = data.total_users ?? '—';
      document.getElementById('stat-active').textContent = data.active_users ?? '—';
      document.getElementById('stat-pending').textContent = data.pending_users ?? '—';
      document.getElementById('stat-votes-today').textContent = data.votes_today ?? '—';
      document.getElementById('stat-total-votes').textContent = data.total_votes ?? '—';
    } catch (err) {
      console.warn('[ADMIN] Stats load error:', err.message);
    }
  }

  // ── Load Users ────────────────────────────────────────────────────────────
  async function loadUsers() {
    const tableBody = document.getElementById('admin-users-body');
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load users');
      const { users } = await res.json();

      allUsersData = users || [];

      // Re-apply current search filter if active
      const searchVal = document.getElementById('user-search').value.trim().toLowerCase();
      renderUsersTable(searchVal ? allUsersData.filter(u =>
        (u.discord_username || '').toLowerCase().includes(searchVal) ||
        (u.email || '').toLowerCase().includes(searchVal)
      ) : allUsersData);

    } catch (err) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; color: var(--error); padding: 2rem;">
            Error loading users: ${escHtml(err.message)}
          </td>
        </tr>`;
    }
  }

  // ── Filter Users ──────────────────────────────────────────────────────────
  function filterUsers(query) {
    if (!query) {
      renderUsersTable(allUsersData);
    } else {
      renderUsersTable(allUsersData.filter(u =>
        (u.discord_username || '').toLowerCase().includes(query) ||
        (u.email || '').toLowerCase().includes(query)
      ));
    }
  }

  // ── Render Table ──────────────────────────────────────────────────────────
  function renderUsersTable(users) {
    const tableBody = document.getElementById('admin-users-body');

    if (!users || users.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; color: var(--text-muted); padding: 3rem;">
            No users found.
          </td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = '';

    users.forEach(user => {
      const row = document.createElement('tr');
      const isActive = user.subscription_status === 'active';
      const hasToken = !!user.encrypted_token;

      // ── Approved Until display ──
      let approvedUntilHtml = '<span style="color:var(--text-muted)">—</span>';
      if (user.approved_until) {
        const d = new Date(user.approved_until);
        const now = new Date();
        const daysLeft = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
        const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

        if (daysLeft <= 0) {
          approvedUntilHtml = `<span style="color:var(--error); font-size:0.82rem;">${dateStr}<br><small>Expired</small></span>`;
        } else if (daysLeft <= 5) {
          approvedUntilHtml = `<span style="color:var(--warning); font-size:0.82rem;">${dateStr}<br><small>${daysLeft}d left</small></span>`;
        } else {
          approvedUntilHtml = `<span style="font-size:0.82rem;">${dateStr}<br><small style="color:var(--text-muted)">${daysLeft}d left</small></span>`;
        }
      }

      // ── Last result badge ──
      const r = user.last_vote_result;
      let resultBadge = '<span class="badge badge-info">N/A</span>';
      if (r) {
        const cls = r === 'success' ? 'badge-success' : r === 'already_voted' ? 'badge-info' : r === 'captcha' ? 'badge-warning' : 'badge-danger';
        resultBadge = `<span class="badge ${cls}">${r.replace('_', ' ').toUpperCase()}</span>`;
      }

      row.innerHTML = `
        <td>
          <div style="font-weight: 600; font-size: 0.9rem;">${escHtml(user.discord_username || 'Unknown')}</div>
        </td>
        <td style="color: var(--text-secondary); font-size: 0.82rem;">${escHtml(user.email || '—')}</td>
        <td>
          <span class="badge ${isActive ? 'badge-success' : 'badge-danger'}">
            ${isActive ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </td>
        <td>
          <span class="badge ${hasToken ? 'badge-success' : 'badge-warning'}">
            ${hasToken ? 'SET' : 'MISSING'}
          </span>
        </td>
        <td style="font-size: 0.82rem; color: var(--text-secondary);">
          ${user.last_vote_at ? new Date(user.last_vote_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Never'}
        </td>
        <td>${resultBadge}</td>
        <td>${approvedUntilHtml}</td>
        <td style="text-align: right;">
          <div class="action-btn-group">
            <button class="btn btn-xs btn-primary approve-btn" data-id="${user.id}" data-name="${escHtml(user.discord_username || 'User')}" title="Approve for 30 days from now">
              Approve 30d
            </button>
            <button class="btn btn-xs btn-secondary disable-btn" data-id="${user.id}" data-name="${escHtml(user.discord_username || 'User')}" title="Disable immediately" ${!isActive ? 'disabled style="opacity:0.45;"' : ''}>
              Disable
            </button>
          </div>
        </td>
      `;

      // ── Approve button ──
      row.querySelector('.approve-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const uid = btn.dataset.id;
        const name = btn.dataset.name;
        if (!confirm(`Approve "${name}" for 30 days?`)) return;

        btn.disabled = true;
        btn.textContent = 'Approving…';
        try {
          const res = await fetch(`/api/admin/users/${uid}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok && data.success) {
            const until = new Date(data.approved_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            showToast(`✅ "${name}" approved until ${until}`, 'success');
            await Promise.all([loadStats(), loadUsers()]);
          } else {
            throw new Error(data.error || 'Approve failed');
          }
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Approve 30d';
          showToast(err.message, 'error');
        }
      });

      // ── Disable button ──
      row.querySelector('.disable-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const uid = btn.dataset.id;
        const name = btn.dataset.name;
        if (!confirm(`Disable "${name}"? They will stop receiving votes immediately.`)) return;

        btn.disabled = true;
        btn.textContent = 'Disabling…';
        try {
          const res = await fetch(`/api/admin/users/${uid}/disable`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast(`"${name}" has been disabled.`, 'success');
            await Promise.all([loadStats(), loadUsers()]);
          } else {
            throw new Error(data.error || 'Disable failed');
          }
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Disable';
          showToast(err.message, 'error');
        }
      });

      tableBody.appendChild(row);
    });
  }

  // ── Show Cron Result panel ────────────────────────────────────────────────
  function showCronResult(results) {
    const panel = document.getElementById('cron-result-panel');
    panel.style.display = 'block';
    document.getElementById('cron-res-success').textContent = results.success || 0;
    document.getElementById('cron-res-already').textContent = results.already_voted || 0;
    document.getElementById('cron-res-captcha').textContent = results.captcha || 0;
    document.getElementById('cron-res-error').textContent = results.error || 0;
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ── HTML escape utility ───────────────────────────────────────────────────
  function escHtml(str) {
    const el = document.createElement('div');
    el.textContent = String(str);
    return el.innerHTML;
  }
});
