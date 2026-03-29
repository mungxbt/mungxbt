/**
 * wallet.js — mungxbt.site
 * Shared Web3 wallet connect: MetaMask (EVM) + Phantom (Solana)
 * Inject ke semua page sebelum </body>
 */

(function () {
  const STORAGE_KEY = 'mungxbt_wallet';

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
    .w3-btn.connected .w3-dot { background: var(--green, #1D9E75); }

    /* Modal overlay */
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
      color: var(--text, #f0ede8); margin-bottom: 4px;
    }
    .w3-modal-sub {
      font-size: 0.78rem; color: var(--text2, #9a9690); margin-bottom: 8px; line-height: 1.5;
    }
    .w3-wallet-option {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px; border-radius: 8px; cursor: pointer;
      border: 1px solid var(--border, rgba(255,255,255,0.07));
      background: var(--card, #141414); transition: all 0.2s;
    }
    .w3-wallet-option:hover { border-color: var(--amber-border); }
    .w3-wallet-option img { width: 28px; height: 28px; border-radius: 6px; }
    .w3-wallet-name { font-size: 0.85rem; font-weight: 500; color: var(--text, #f0ede8); }
    .w3-wallet-chain { font-size: 0.7rem; color: var(--text2, #9a9690); font-family: 'DM Mono', monospace; }
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
    btn.innerHTML = '<span class="w3-dot"></span><span id="w3BtnLabel">Connect Wallet</span>';
    btn.addEventListener('click', onBtnClick);

    // Insert sebelum theme toggle
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
        <div class="w3-modal-title">Connect Wallet</div>
        <div class="w3-modal-sub">Pilih wallet untuk login & simpan progress belajar lo.</div>
        <div class="w3-wallet-option" id="w3OptMetaMask">
          <div style="width:28px;height:28px;border-radius:6px;background:#E88331;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">🦊</div>
          <div><div class="w3-wallet-name">MetaMask</div><div class="w3-wallet-chain">EVM · Ethereum, BSC, dll</div></div>
        </div>
        <div class="w3-wallet-option" id="w3OptPhantom">
          <div style="width:28px;height:28px;border-radius:6px;background:#AB9FF2;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">👻</div>
          <div><div class="w3-wallet-name">Phantom</div><div class="w3-wallet-chain">Solana</div></div>
        </div>
        <div class="w3-status-msg" id="w3StatusMsg"></div>
        <button class="w3-modal-close" id="w3CloseModal">Tutup</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('w3CloseModal').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
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
      const short = address.slice(0, 4) + '...' + address.slice(-4);
      label.textContent = short;
      btn.className = 'w3-btn connected';
      btn.title = `${chain}: ${address}\n\nKlik untuk disconnect`;
    } else {
      label.textContent = 'Connect Wallet';
      btn.className = 'w3-btn';
      btn.title = '';
    }
  }

  function onBtnClick() {
    const session = getSession();
    if (session?.address) {
      if (confirm('Disconnect wallet ' + session.address.slice(0, 6) + '...?')) {
        clearSession();
        updateUI(null, null);
        window.dispatchEvent(new CustomEvent('walletDisconnected'));
      }
    } else {
      openModal();
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

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    injectButton();
    createModal();
    const session = getSession();
    if (session?.address) updateUI(session.address, session.chain);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.WalletConnect = {
    getSession,
    clearSession,
  };
})();
