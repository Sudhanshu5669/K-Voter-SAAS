document.addEventListener('DOMContentLoaded', async () => {
  const navAuthBtn = document.getElementById('nav-auth-btn');
  const heroLoginBtn = document.getElementById('hero-login-btn');
  const priceSubscribeBtn = document.getElementById('price-subscribe-btn');

  // ── 1. Check if user is already authenticated ────────────────────────────
  try {
    const isAuthenticated = await checkAuth();

    if (isAuthenticated) {
      // Redirect CTA buttons to Dashboard for logged-in users
      if (navAuthBtn) {
        navAuthBtn.textContent = 'Dashboard →';
        navAuthBtn.className = 'btn btn-primary';
        navAuthBtn.addEventListener('click', () => { window.location.href = 'dashboard.html'; });
      }
      if (heroLoginBtn) {
        heroLoginBtn.innerHTML = 'Open Your Dashboard →';
        heroLoginBtn.addEventListener('click', () => { window.location.href = 'dashboard.html'; });
      }
      if (priceSubscribeBtn) {
        priceSubscribeBtn.textContent = 'Go to Dashboard';
        priceSubscribeBtn.addEventListener('click', () => { window.location.href = 'dashboard.html'; });
      }
    } else {
      // Wire up Discord OAuth for logged-out users
      navAuthBtn?.addEventListener('click', loginWithDiscord);
      heroLoginBtn?.addEventListener('click', loginWithDiscord);
      priceSubscribeBtn?.addEventListener('click', loginWithDiscord);
    }
  } catch (err) {
    console.error('Landing page auth check failed:', err);
    navAuthBtn?.addEventListener('click', loginWithDiscord);
    heroLoginBtn?.addEventListener('click', loginWithDiscord);
    priceSubscribeBtn?.addEventListener('click', loginWithDiscord);
  }

  // ── 2. Load public stats for animated counters ────────────────────────────
  try {
    const res = await fetch('/api/stats/public');
    if (res.ok) {
      const stats = await res.json();
      animateCounter(document.getElementById('counter-votes'), stats.total_votes || 0);
      animateCounter(document.getElementById('counter-users'), stats.active_users || 0);
      const uptimeEl = document.getElementById('counter-uptime');
      if (uptimeEl) uptimeEl.textContent = `${stats.uptime || '99.9'}%`;
    }
  } catch (err) {
    // Stats are optional — fail silently on landing page
    console.warn('Stats load failed (non-critical):', err.message);
  }

  // ── 3. FAQ accordion ──────────────────────────────────────────────────────
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = btn.getAttribute('aria-expanded') === 'true';

      // Close all other open items
      document.querySelectorAll('.faq-item.open').forEach(openItem => {
        if (openItem !== item) {
          openItem.classList.remove('open');
          openItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle current
      btn.setAttribute('aria-expanded', String(!isOpen));
      item.classList.toggle('open', !isOpen);
    });
  });
});

/**
 * Animate a number from 0 to target over ~1.5 seconds
 */
function animateCounter(el, target) {
  if (!el || target === 0) {
    if (el) el.textContent = target.toLocaleString();
    return;
  }
  const duration = 1500;
  const start = performance.now();
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const value = Math.round(easeOut(progress) * target);
    el.textContent = value.toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
