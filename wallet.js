/**
 * wallet.js — mungxbt.site
 * Login: Google (Supabase Auth) + MetaMask (EVM) + Phantom (Solana)
 */

(function () {
  const STORAGE_KEY = 'mungxbt_wallet';
  const SUPABASE_URL = 'https://ceuklfkhzdhsotfikhyo.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_bp1H9QF0a5S-UtBVm7-AZg_-j2NhQGz';

  // ── CSS ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .w3-btn {
      display: inline-flex; align-items: center; gap: 8px;
      font-family: 'DM Mono', monospace; font-size: 0.72rem;
      letter-spacing: 0.04em; text-transform: uppercase;
      padding: 7px 14px; border-radius: 6px; cursor: pointer;
      border: 1px solid var(--border2); background: transparent;
      color: var(--text2); transition: all 0.2s; white-space: nowrap;
    }
    .w3-btn:hover { border-color: var(--amber-border); color: var(--amber); }
    .w3-btn.connected {
      border-color: var(--amber-border); color: var(--amber);
      background: var(--amber-glow);
    }
    .w3-btn .w3-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--text3); flex-shrink: 0; transition: background 0.2s;
    }
    .w3-btn.connected .w3-dot { background: #1D9E75; }

    .w3-modal-overlay {
      display: none; position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
      align-items: center; justify-content: center;
    }
    .w3-modal-overlay.open { display: flex; }
    .w3-modal {
      background: var(--bg2, #161616); border: 1px solid var(--border2);
      border-radius: 12px; padding: 1.5rem; width: 320px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .w3-modal-title {
      font-family: 'Syne', sans-serif; font-size: 0.95rem; font-weight: 700;
      color: var(--text, #f0ede8); margin-bottom: 2px;
    }
    .w3-modal-sub {
      font-size: 0.78rem; color: var(--text2, #9a9690); margin-bottom: 4px; line-height: 1.5;
    }
    .w3-divider {
      display: flex; align-items: center; gap: 8px; margin: 2px 0;
    }
    .w3-divider::before, .w3-divider::after {
      content: ''; flex: 1; height: 1px; background: var(--border, rgba(255,255,255,0.07));
    }
    .w3-divider span {
      font-family: 'DM Mono', monospace; font-size: 0.6rem;
      color: var(--text3, #5a5754); letter-spacing: 0.08em; text-transform: uppercase;
    }
    .w3-wallet-option {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px; border-radius: 8px; cursor: pointer;
      border: 1px solid var(--border, rgba(255,255,255,0.07));
      background: var(--card, #141414); transition: all 0.2s;
    }
    .w3-wallet-option:hover { border-color: var(--amber-border); }
    .w3-wallet-icon {
      width: 28px; height: 28px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.1rem; flex-shrink: 0;
    }
    .w3-wallet-name { font-size: 0.85rem; font-weight: 500; color: var(--text, #f0ede8); }
    .w3-wallet-chain { font-size: 0.7rem; color: var(--text2, #9a9690); font-family: 'DM Mono', monospace; }

    /* Google button — full width, beda style */
    .w3-google-btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      padding: 11px 14px; border-radius: 8px; cursor: pointer;
      border: 1px solid var(--border2, rgba(255,255,255,0.12));
      background: #fff; transition: all 0.2s; width: 100%;
    }
    .w3-google-btn:hover { opacity: 0.9; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .w3-google-btn svg { width: 18px; height: 18px; flex-shrink: 0; }
    .w3-google-btn span {
      font-size: 0.85rem; font-weight: 600; color: #3c4043;
      font-family: 'DM Sans', sans-serif;
    }

    .w3-modal-close {
      margin-top: 4px; background: transparent; border: none;
      color: var(--text3, #5a5754); font-size: 0.78rem; cursor: pointer;
      align-self: center; padding: 4px 8px; transition: color 0.2s;
    }
    .w3-modal-close:hover { color: var(--text2, #9a9690); }
    .w3-status-msg {
      font-size: 0.72rem; color: var(--text3, #5a5754);
      font-family: 'DM Mono', monospace; text-align: center; min-height: 16px;
    }
    .w3-status-msg.error { color: #E24B4A; }
  `;
  document.head.appendChild(style);

  // ── Inject tombol ke navbar ───────────────────────────────────────────────
  function injectButton() {
    const navRight = document.querySelector('.nav-right');
    if (!navRight || document.getElementById('w3ConnectBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'w3ConnectBtn';
    btn.className = 'w3-btn';
    btn.innerHTML = '<span class="w3-dot"></span><span id="w3BtnLabel">Login</span>';
    btn.addEventListener('click', onBtnClick);

    const themeBtn = navRight.querySelector('.theme-btn');
    themeBtn ? navRight.insertBefore(btn, themeBtn) : navRight.appendChild(btn);
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function createModal() {
    if (document.getElementById('w3Modal')) return;
    const overlay = document.createElement('div');
    overlay.className = 'w3-modal-overlay';
    overlay.id = 'w3Modal';
    overlay.innerHTML = `
      <div class="w3-modal">
        <div class="w3-modal-title">Login</div>
        <div class="w3-modal-sub">Pilih metode login untuk simpan progress belajar lo.</div>

        <button class="w3-google-btn" id="w3OptGoogle">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span>Lanjutkan dengan Google</span>
        </button>

        <div class="w3-divider"><span>atau pakai wallet</span></div>

        <div class="w3-wallet-option" id="w3OptMetaMask">
          <div class="w3-wallet-icon" style="background:#E88331;">🦊</div>
          <div><div class="w3-wallet-name">MetaMask</div><div class="w3-wallet-chain">EVM · Ethereum, BSC, dll</div></div>
        </div>
        <div class="w3-wallet-option" id="w3OptPhantom">
          <div class="w3-wallet-icon" style="background:#AB9FF2;">👻</div>
          <div><div class="w3-wallet-name">Phantom</div><div class="w3-wallet-chain">Solana</div></div>
        </div>

        <div class="w3-status-msg" id="w3StatusMsg"></div>
        <button class="w3-modal-close" id="w3CloseModal">Tutup</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('w3CloseModal').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.getElementById('w3OptGoogle').addEventListener('click', connectGoogle);
    document.getElementById('w3OptMetaMask').addEventListener('click', connectMetaMask);
    document.getElementById('w3OptPhantom').addEventListener('click', connectPhantom);
  }

  function openModal() { document.getElementById('w3Modal')?.classList.add('open'); }
  function closeModal() { document.getElementById('w3Modal')?.classList.remove('open'); }
  function setStatus(msg, isError = false) {
    const el = document.getElementById('w3StatusMsg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'w3-status-msg' + (isError ? ' error' : '');
  }

  // ── State ─────────────────────────────────────────────────────────────────
  function getSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
  }
  function saveSession(address, chain) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ address, chain }));
  }
  function clearSession() { localStorage.removeItem(STORAGE_KEY); }

  function updateUI(address, chain) {
    const btn = document.getElementById('w3ConnectBtn');
    const label = document.getElementById('w3BtnLabel');
    if (!btn || !label) return;
    if (address) {
      let display;
      if (chain === 'Google') {
        // Tampilkan nama/email singkat
        display = address.length > 20 ? address.slice(0, 18) + '…' : address;
      } else {
        display = address.slice(0, 4) + '...' + address.slice(-4);
      }
      label.textContent = display;
      btn.className = 'w3-btn connected';
      btn.title = `${chain}: ${address}\n\nKlik untuk logout`;
    } else {
      label.textContent = 'Login';
      btn.className = 'w3-btn';
      btn.title = '';
    }
  }

  function onBtnClick() {
    const session = getSession();
    if (session?.address) {
      if (confirm('Logout dari ' + session.address.slice(0, 20) + '...?')) {
        clearSession();
        // Kalau Google, logout dari Supabase juga
        if (session.chain === 'Google') {
          fetch(`${SUPABASE_URL}/auth/v1/logout`, {
            method: 'POST',
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.accessToken || ''}` }
          }).catch(() => {});
        }
        updateUI(null, null);
        window.dispatchEvent(new CustomEvent('walletDisconnected'));
      }
    } else {
      openModal();
    }
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────
  async function connectGoogle() {
    setStatus('Membuka Google login...');
    try {
      // Simpan current page untuk redirect balik
      localStorage.setItem('mungxbt_auth_redirect', window.location.href);

      const res = await fetch(`${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(window.location.origin + '/auth-callback.html')}`, {
        headers: { apikey: SUPABASE_KEY }
      });
      // Supabase redirect langsung, ambil URL dari response
      window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(window.location.origin + '/auth-callback.html')}`;
    } catch (err) {
      setStatus('Gagal membuka Google login.', true);
    }
  }

  // ── MetaMask ──────────────────────────────────────────────────────────────
  async function connectMetaMask() {
    if (!window.ethereum) {
      setStatus('MetaMask tidak terdeteksi. Install dulu!', true);
      return;
    }
    setStatus('Menunggu konfirmasi MetaMask...');
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];
      saveSession(address, 'EVM');
      updateUI(address, 'EVM');
      closeModal();
      window.dispatchEvent(new CustomEvent('walletConnected', { detail: { address, chain: 'EVM' } }));
    } catch (err) {
      setStatus(err.code === 4001 ? 'Ditolak user.' : 'Gagal connect.', true);
    }
  }

  // ── Phantom ───────────────────────────────────────────────────────────────
  async function connectPhantom() {
    const phantom = window.phantom?.solana || window.solana;
    if (!phantom?.isPhantom) {
      setStatus('Phantom tidak terdeteksi. Install dulu!', true);
      return;
    }
    setStatus('Menunggu konfirmasi Phantom...');
    try {
      const resp = await phantom.connect();
      const address = resp.publicKey.toString();
      saveSession(address, 'Solana');
      updateUI(address, 'Solana');
      closeModal();
      window.dispatchEvent(new CustomEvent('walletConnected', { detail: { address, chain: 'Solana' } }));
    } catch (err) {
      setStatus('Gagal connect Phantom.', true);
    }
  }

  // ── Cek Google callback (hash fragment dari Supabase) ─────────────────────
  function checkGoogleCallback() {
    // Supabase mengembalikan token di hash: #access_token=...&token_type=bearer
    const hash = window.location.hash;
    if (!hash.includes('access_token')) return false;

    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get('access_token');
    if (!accessToken) return false;

    // Ambil user info dari Supabase
    fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` }
    })
    .then(r => r.json())
    .then(user => {
      const identifier = user.email || user.id;
      saveSession(identifier, 'Google', accessToken);
      updateUI(identifier, 'Google');
      // Bersihkan hash dari URL
      window.history.replaceState({}, '', window.location.pathname);
      window.dispatchEvent(new CustomEvent('walletConnected', { detail: { address: identifier, chain: 'Google' } }));
    })
    .catch(err => console.warn('[wallet] Gagal ambil user Google:', err));

    return true;
  }

  // Override saveSession untuk support accessToken
  function saveSession(address, chain, accessToken = null) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ address, chain, accessToken }));
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    injectButton();
    createModal();

    // Cek kalau baru balik dari Google OAuth
    if (!checkGoogleCallback()) {
      const session = getSession();
      if (session?.address) updateUI(session.address, session.chain);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.WalletConnect = { getSession, clearSession };
})();
