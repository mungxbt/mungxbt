/**
 * bitcoin-progress.js — mungxbt.site
 * Supabase progress tracker untuk bitcoin.html
 * Depends on: wallet.js (harus di-load duluan)
 */

(function () {
  const SUPABASE_URL = 'https://ceuklfkhzdhsotfikhyo.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_bp1H9QF0a5S-UtBVm7-AZg_-j2NhQGz';

  // ── CSS tambahan ──────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .progress-toast {
      position: fixed; bottom: 24px; right: 24px; z-index: 9998;
      background: var(--bg2, #161616); border: 1px solid var(--amber-border);
      border-radius: 10px; padding: 12px 16px; display: flex;
      align-items: center; gap: 10px; font-size: 0.8rem;
      color: var(--text2, #9a9690); box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      transform: translateY(80px); opacity: 0;
      transition: transform 0.3s ease, opacity 0.3s ease;
      max-width: 280px; pointer-events: none;
    }
    .progress-toast.show { transform: translateY(0); opacity: 1; }
    .progress-toast .pt-icon { font-size: 1.1rem; flex-shrink: 0; }
    .progress-toast .pt-text strong { color: var(--amber); display: block; font-size: 0.78rem; margin-bottom: 1px; }

    .wallet-banner {
      background: var(--amber-glow); border: 1px solid var(--amber-border);
      border-radius: 8px; padding: 10px 14px; margin-bottom: 1.5rem;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap;
    }
    .wallet-banner-text { font-size: 0.8rem; color: var(--text2); line-height: 1.5; }
    .wallet-banner-text strong { color: var(--amber); }
    .wallet-banner-btn {
      font-family: 'DM Mono', monospace; font-size: 0.7rem; letter-spacing: 0.04em;
      text-transform: uppercase; padding: 6px 12px; border-radius: 6px;
      border: 1px solid var(--amber-border); background: var(--amber);
      color: #0e0e0e; cursor: pointer; white-space: nowrap; transition: opacity 0.2s;
      font-weight: 600;
    }
    .wallet-banner-btn:hover { opacity: 0.85; }
    #walletBanner { display: none; }
  `;
  document.head.appendChild(style);

  // ── Supabase helpers ──────────────────────────────────────────────────────
  async function fetchProgress(address) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/progress?wallet_address=eq.${encodeURIComponent(address)}&select=done_lessons,last_lesson`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await res.json();
    return {
      doneLessons: data?.[0]?.done_lessons || [],
      lastLesson: data?.[0]?.last_lesson ?? null,
    };
  }

  async function saveProgress(address, doneLessons, lastLesson) {
    await fetch(`${SUPABASE_URL}/rest/v1/progress`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        wallet_address: address,
        done_lessons: doneLessons,
        last_lesson: lastLesson,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  // ── Toast notification ────────────────────────────────────────────────────
  let toastTimer = null;
  function showToast(icon, title, msg) {
    let toast = document.getElementById('progressToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'progressToast';
      toast.className = 'progress-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span class="pt-icon">${icon}</span><div class="pt-text"><strong>${title}</strong>${msg}</div>`;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ── Banner (kalau belum connect) ──────────────────────────────────────────
  function injectBanner() {
    const contentArea = document.querySelector('.content-area');
    if (!contentArea || document.getElementById('walletBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'walletBanner';
    banner.className = 'wallet-banner';
    banner.innerHTML = `
      <div class="wallet-banner-text">
        <strong>💾 Simpan Progress Belajar Lo</strong>
        Connect wallet untuk nyimpen progress biar gak ilang kalau refresh atau ganti device.
      </div>
      <button class="wallet-banner-btn" id="bannerConnectBtn">Connect Wallet</button>
    `;
    contentArea.insertBefore(banner, contentArea.firstChild);
    document.getElementById('bannerConnectBtn').addEventListener('click', () => {
      document.getElementById('w3ConnectBtn')?.click();
    });
  }

  function updateBanner() {
    const session = window.WalletConnect?.getSession();
    const banner = document.getElementById('walletBanner');
    if (!banner) return;
    banner.style.display = session?.address ? 'none' : 'flex';
  }

  // ── Core: load + patch goTo ───────────────────────────────────────────────
  let saveTimeout = null;

  async function loadProgressFromDB() {
    const session = window.WalletConnect?.getSession();
    if (!session?.address) return;

    try {
      const { doneLessons, lastLesson } = await fetchProgress(session.address);
      if (doneLessons.length === 0) return;

      // Load done lessons ke Set
      doneLessons.forEach(l => done.add(l));
      updateSidebar();

      // Resume ke lesson terakhir yang dibuka
      if (lastLesson !== null && lastLesson !== current) {
        // Pakai originalGoTo biar gak trigger scheduleSave saat resume
        _originalGoTo(lastLesson);
        showToast('▶️', 'Melanjutkan', `Bab ${lastLesson + 1} — lanjut dari terakhir lo baca.`);
      } else {
        showToast('✅', 'Progress Dimuat', `${doneLessons.length} materi udah selesai.`);
      }
    } catch (e) {
      console.warn('[bitcoin-progress] Gagal load progress:', e);
    }
  }

  let _originalGoTo = null;

  function patchGoTo() {
    _originalGoTo = window.goTo;
    window.goTo = function (n) {
      _originalGoTo(n);
      scheduleSave();
    };
  }

  function scheduleSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const session = window.WalletConnect?.getSession();
      if (!session?.address) return;
      try {
        const doneLessons = Array.from(done);
        await saveProgress(session.address, doneLessons, current);
        showToast('💾', 'Progress Tersimpan', `${doneLessons.length}/${total} materi selesai.`);
      } catch (e) {
        console.warn('[bitcoin-progress] Gagal save:', e);
      }
    }, 800);
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  window.addEventListener('walletConnected', async () => {
    updateBanner();
    await loadProgressFromDB();
    showToast('🔗', 'Wallet Terhubung', 'Progress lo akan otomatis tersimpan.');
  });

  window.addEventListener('walletDisconnected', () => {
    updateBanner();
    done.clear();
    _originalGoTo(0);
    updateSidebar();
    showToast('👋', 'Wallet Disconnected', 'Progress lokal dihapus.');
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    injectBanner();
    patchGoTo();
    updateBanner();

    const session = window.WalletConnect?.getSession();
    if (session?.address) {
      loadProgressFromDB();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 50);
  }
})();
