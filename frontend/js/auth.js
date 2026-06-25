let supabaseClient = null;

/**
 * Fetch config from backend and initialize Supabase client
 */
async function initSupabase() {
  if (supabaseClient) return supabaseClient;
  
  try {
    const response = await fetch('/api/auth/config');
    if (!response.ok) {
      throw new Error(`Failed to load config: HTTP ${response.status}`);
    }
    const config = await response.json();
    
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('Supabase configuration values missing on server.');
    }

    supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    return supabaseClient;
  } catch (err) {
    console.error('Supabase initialization failed:', err);
    showToast('Failed to initialize authentication. Check backend environment variables.', 'error');
    return null;
  }
}

/**
 * Perform login using Discord OAuth provider via Supabase
 */
async function loginWithDiscord() {
  const client = await initSupabase();
  if (!client) return;

  const redirectTo = `${window.location.origin}/dashboard.html`;
  console.log(`Initiating Discord login redirecting to: ${redirectTo}`);

  const { error } = await client.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: redirectTo
    }
  });

  if (error) {
    console.error('Discord OAuth sign-in error:', error.message);
    showToast(`OAuth Error: ${error.message}`, 'error');
  }
}

/**
 * Log the user out of both client and server sessions
 */
async function logoutUser() {
  const client = await initSupabase();
  if (client) {
    await client.auth.signOut();
  }
  
  // Call backend logout endpoint
  try {
    const token = await getSessionToken();
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  } catch (e) {
    console.warn('Backend logout call failed', e);
  }

  // Clear local storage and redirect to index
  localStorage.clear();
  window.location.href = 'index.html';
}

/**
 * Get active session JWT token for API Authorization headers
 */
async function getSessionToken() {
  const client = await initSupabase();
  if (!client) return null;

  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session) return null;

  return session.access_token;
}

/**
 * Get current user object
 */
async function getCurrentUser() {
  const client = await initSupabase();
  if (!client) return null;

  const { data: { user } } = await client.auth.getUser();
  return user;
}

/**
 * Check if session is active; otherwise optionally redirect
 */
async function checkAuth(redirectIfUnauth = false) {
  const client = await initSupabase();
  if (!client) return false;

  const { data: { session } } = await client.auth.getSession();
  const isAuthenticated = !!session;

  if (!isAuthenticated && redirectIfUnauth) {
    window.location.href = 'index.html';
  }

  return isAuthenticated;
}

/**
 * Display a premium visual toast notification
 */
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  toast.className = `toast toast-${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}
