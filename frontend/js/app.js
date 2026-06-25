document.addEventListener('DOMContentLoaded', async () => {
  const navAuthBtn = document.getElementById('nav-auth-btn');
  const heroLoginBtn = document.getElementById('hero-login-btn');
  const priceSubscribeBtn = document.getElementById('price-subscribe-btn');

  // 1. Check if user is already authenticated
  try {
    const isAuthenticated = await checkAuth();
    
    if (isAuthenticated) {
      // User is logged in - change CTA buttons to redirect to Dashboard
      if (navAuthBtn) {
        navAuthBtn.textContent = 'Dashboard';
        navAuthBtn.className = 'btn btn-primary';
        navAuthBtn.addEventListener('click', () => {
          window.location.href = 'dashboard.html';
        });
      }

      if (heroLoginBtn) {
        heroLoginBtn.textContent = 'Open Dashboard';
        heroLoginBtn.addEventListener('click', () => {
          window.location.href = 'dashboard.html';
        });
      }

      if (priceSubscribeBtn) {
        priceSubscribeBtn.textContent = 'Manage Your Dashboard';
        priceSubscribeBtn.addEventListener('click', () => {
          window.location.href = 'dashboard.html';
        });
      }
    } else {
      // User is not logged in - wire up Discord login flow
      if (navAuthBtn) {
        navAuthBtn.addEventListener('click', loginWithDiscord);
      }
      if (heroLoginBtn) {
        heroLoginBtn.addEventListener('click', loginWithDiscord);
      }
      if (priceSubscribeBtn) {
        priceSubscribeBtn.addEventListener('click', loginWithDiscord);
      }
    }
  } catch (err) {
    console.error('Landing page initialization failed:', err);
  }
});
