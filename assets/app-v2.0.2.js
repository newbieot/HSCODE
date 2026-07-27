(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const STORAGE = {
    sessionKey: 'hs_posnew_groq_session',
    localKey: 'hs_posnew_groq_key',
    legacyKey: 'pos_batam_groq_key',
    history: 'hs_posnew_history_v2'
  };

  const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbysYOk1lUTLpMFViAJPXh_hAtmEuX5UmfwQzz1OHqvbfQD-lfDH-vEGhuMeQ5oXv2Gz4Q/exec';
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const OFFLINE_DB = {
    PAKAIAN: '6109.10.00', BAJU: '6109.10.00', CELANA: '6103.42.00', KEMEJA: '6205.20.00',
    TV: '8528.72.92', TELEVISI: '8528.72.92', MEJA: '9403.20.90', TAS: '4202.22.10',
    BUKU: '4901.99.90', BANTAL: '9404.90.00', PAMPERS: '9619.00.10', TIMBANGAN: '8423.10.10',
    SAJADAH: '5705.00.00', MUKENA: '6211.11.90', TRIPOD: '9006.91.00', KULKAS: '8418.10.11'
  };

  const DEMO_RESULT = {
    product_summary: 'Filter udara untuk mesin kendaraan bermotor, berbahan media kertas berlipat dengan rangka plastik, digunakan untuk menyaring partikel dari udara sebelum masuk ke mesin bensin.',
    recommended_hs_code: '8421.31.10',
    confidence: 'high',
    chapter: '84 — Mesin dan peralatan mekanis',
    heading: '8421 — Mesin dan aparatus penyaring atau pemurni',
    subheading: '8421.31 — Filter udara masuk untuk mesin pembakaran dalam',
    reasoning_summary: 'Karakter utama barang adalah alat penyaring udara masuk yang dirancang khusus untuk mesin pembakaran dalam. Fungsi penyaringan dan penggunaan spesifiknya lebih menentukan klasifikasi dibanding bahan kertas atau plastik pembentuknya.',
    alternative_codes: [
      { code: '8421.39.90', description: 'Mesin/aparatus penyaring gas lainnya', reason: 'Perlu dipertimbangkan bila barang bukan khusus untuk udara masuk mesin pembakaran dalam.' },
      { code: '8421.99.99', description: 'Bagian lainnya dari alat penyaring', reason: 'Relevan bila yang diimpor hanya elemen/bagian dan bukan unit filter lengkap.' }
    ],
    missing_information: [
      'Pastikan barang merupakan unit filter lengkap atau hanya elemen pengganti.',
      'Konfirmasi jenis kendaraan dan mesin yang menjadi tujuan penggunaan.'
    ],
    verification_notes: [
      'Bandingkan uraian lengkap pada BTKI yang berlaku.',
      'Periksa catatan Bagian XVI dan catatan Bab 84.',
      'Cocokkan brosur, foto, bahan, dan fungsi dengan dokumen impor.',
      'Mintakan penetapan resmi bila nilai atau risikonya material.'
    ],
    warning: ''
  };

  const state = {
    mode: 'quick',
    serverKeyActive: null,
    apiStatus: 'checking',
    selectedFile: null,
    finalWorkbook: null,
    currentResult: null,
    currentController: null,
    cloudDB: {},
    previousFocus: null,
    confirmAction: null,
    progressTimer: null,
    xlsxPromise: null
  };

  const els = {
    form: $('#analysisForm'),
    modeTabs: $$('.mode-tab'),
    quickDescription: $('#quickDescription'),
    quickCounter: $('#quickCounter'),
    qualityHint: $('#qualityHint'),
    productName: $('#productName'),
    formError: $('#formError'),
    analyzeButton: $('#analyzeButton'),
    analyzeButtonLabel: $('#analyzeButtonLabel'),
    cancelButton: $('#cancelButton'),
    progressPanel: $('#progressPanel'),
    progressTitle: $('#progressTitle'),
    progressDetail: $('#progressDetail'),
    progressPercent: $('#progressPercent'),
    progressBar: $('#progressBar'),
    dropZone: $('#dropZone'),
    fileInput: $('#fileInput'),
    selectedFileCard: $('#selectedFileCard'),
    fileNameDisplay: $('#fileNameDisplay'),
    fileSizeDisplay: $('#fileSizeDisplay'),
    resultSection: $('#resultSection'),
    bulkResultSection: $('#bulkResultSection'),
    historyList: $('#historyList'),
    historyEmpty: $('#historyEmpty'),
    historyToolbar: $('#historyToolbar'),
    clearHistoryButton: $('#clearHistoryButton'),
    historySearch: $('#historySearch'),
    apiModal: $('#apiModal'),
    confirmModal: $('#confirmModal'),
    apiStatusDot: $('#apiStatusDot'),
    apiStatusLabel: $('#apiStatusLabel'),
    groqInput: $('#groqInput'),
    rememberKey: $('#rememberKey'),
    apiFeedback: $('#apiFeedback'),
    removeKeyButton: $('#removeKeyButton'),
    serverKeyNotice: $('#serverKeyNotice'),
    apiKeyFormArea: $('#apiKeyFormArea')
  };

  function migrateLegacyKey() {
    const legacy = localStorage.getItem(STORAGE.legacyKey);
    if (legacy && !localStorage.getItem(STORAGE.localKey)) {
      localStorage.setItem(STORAGE.localKey, legacy);
    }
    if (legacy) localStorage.removeItem(STORAGE.legacyKey);
  }

  function getStoredKey() {
    return sessionStorage.getItem(STORAGE.sessionKey) || localStorage.getItem(STORAGE.localKey) || '';
  }

  function maskKey(key) {
    if (!key) return '';
    return `••••${key.slice(-4)}`;
  }

  function setApiStatus(type, label) {
    state.apiStatus = type;
    els.apiStatusDot.className = `status-dot ${type === 'connected' ? 'success' : type === 'error' ? 'error' : 'loading'}`;
    els.apiStatusLabel.textContent = label;
  }

  function showInline(element, message, type = '') {
    element.textContent = message;
    element.className = `inline-alert${type ? ` ${type}` : ''}`;
    element.hidden = false;
  }

  function hideInline(element) {
    element.hidden = true;
    element.textContent = '';
  }

  function toast(title, message = '', type = 'success') {
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    item.innerHTML = `<div><strong></strong><p></p></div>`;
    $('strong', item).textContent = title;
    $('p', item).textContent = message;
    $('#toastRegion').appendChild(item);
    window.setTimeout(() => item.remove(), 4200);
  }

  function openModal(modal) {
    state.previousFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    window.requestAnimationFrame(() => {
      const target = $('.modal-card', modal);
      if (target) target.focus();
    });
  }

  function closeModal(modal) {
    modal.hidden = true;
    if (!$$('.modal:not([hidden])').length) document.body.classList.remove('modal-open');
    if (state.previousFocus && typeof state.previousFocus.focus === 'function') state.previousFocus.focus();
  }

  function trapFocus(event, modal) {
    if (event.key !== 'Tab') return;
    const focusable = $$('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])', modal).filter(el => !el.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateApiModalUI() {
    const key = getStoredKey();
    els.removeKeyButton.hidden = !key;
    els.rememberKey.checked = Boolean(localStorage.getItem(STORAGE.localKey));
    els.groqInput.value = '';
    els.groqInput.placeholder = key ? `Key tersimpan (${maskKey(key)}) — tempel key baru untuk mengganti` : 'gsk_••••••••••••••••';
    els.serverKeyNotice.hidden = !state.serverKeyActive;
    els.apiKeyFormArea.hidden = Boolean(state.serverKeyActive);
  }

  async function apiRequest(payload, { keyOverride, signal } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const key = keyOverride !== undefined ? keyOverride : getStoredKey();
    if (key) headers['X-Groq-API-Key'] = key;

    let response;
    try {
      response = await fetch('/api/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('Gangguan jaringan. Periksa koneksi internet lalu coba kembali.');
    }

    let body = {};
    try { body = await response.json(); } catch (_) { /* handled below */ }
    if (!response.ok) {
      const error = new Error(body.message || mapStatusMessage(response.status));
      error.code = body.code || `http_${response.status}`;
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function mapStatusMessage(status) {
    if (status === 401) return 'Groq API key tidak valid atau belum dikonfigurasi.';
    if (status === 403) return 'Akses model ditolak. Periksa izin project Groq.';
    if (status === 413) return 'Permintaan terlalu besar. Kurangi jumlah data dan coba lagi.';
    if (status === 429) return 'Batas penggunaan Groq sementara tercapai. Silakan tunggu dan coba kembali.';
    if (status >= 500) return 'Groq sedang tidak dapat diakses. Silakan coba kembali beberapa saat lagi.';
    return 'Permintaan tidak dapat diproses.';
  }

  async function checkConnection({ keyOverride, silent = false } = {}) {
    if (!silent) {
      showInline(els.apiFeedback, 'Menguji koneksi ke Groq…');
      $('#testKeyButton').disabled = true;
    }
    setApiStatus('checking', 'Menguji koneksi AI');

    try {
      const data = await apiRequest({ mode: 'test' }, { keyOverride });
      state.serverKeyActive = data.auth_source === 'server';
      const label = state.serverKeyActive ? 'Groq server terhubung' : `Groq terhubung ${maskKey(keyOverride || getStoredKey())}`;
      setApiStatus('connected', label);
      if (!silent) showInline(els.apiFeedback, 'Koneksi berhasil. Model Groq siap digunakan.', 'success');
      updateApiModalUI();
      return true;
    } catch (error) {
      if (error.code === 'missing_api_key') {
        state.serverKeyActive = false;
        setApiStatus('error', getStoredKey() ? 'Periksa Groq API key' : 'Groq API key belum dikonfigurasi');
      } else if (error.code === 'invalid_api_key') {
        state.serverKeyActive = false;
        setApiStatus('error', 'Groq API key tidak valid');
      } else {
        setApiStatus('error', 'Koneksi Groq bermasalah');
      }
      if (!silent) showInline(els.apiFeedback, error.message, 'error');
      updateApiModalUI();
      return false;
    } finally {
      if (!silent) $('#testKeyButton').disabled = false;
    }
  }

  function switchMode(mode) {
    state.mode = mode;
    els.modeTabs.forEach(tab => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      const panel = $(`#${tab.getAttribute('aria-controls')}`);
      if (panel) panel.hidden = !active;
    });
    els.analyzeButtonLabel.textContent = mode === 'bulk' ? 'Proses dokumen Excel' : 'Analisis dengan AI';
    hideInline(els.formError);
  }

  function updateDescriptionQuality() {
    const text = els.quickDescription.value.trim();
    els.quickCounter.textContent = `${els.quickDescription.value.length}/2000`;
    els.qualityHint.classList.remove('good', 'warn');
    if (!text) {
      els.qualityHint.innerHTML = '<span class="quality-icon" aria-hidden="true">i</span><span>Deskripsi yang rinci membantu AI membedakan heading dan subheading yang mirip.</span>';
    } else if (text.length < 30) {
      els.qualityHint.classList.add('warn');
      els.qualityHint.innerHTML = '<span class="quality-icon" aria-hidden="true">!</span><span>Deskripsi masih terlalu umum. Tambahkan bahan, fungsi, dan cara kerja.</span>';
    } else {
      const signals = ['bahan', 'untuk', 'digunakan', 'motor', 'mesin', 'berfungsi', 'terbuat', 'daya', 'kapasitas', 'komposisi'];
      const score = signals.filter(word => text.toLowerCase().includes(word)).length;
      if (score >= 2 || text.length >= 90) {
        els.qualityHint.classList.add('good');
        els.qualityHint.innerHTML = '<span class="quality-icon" aria-hidden="true">✓</span><span>Deskripsi cukup informatif untuk dianalisis. Tetap tinjau informasi yang masih kurang pada hasil.</span>';
      } else {
        els.qualityHint.classList.add('warn');
        els.qualityHint.innerHTML = '<span class="quality-icon" aria-hidden="true">!</span><span>Tambahkan bahan, fungsi, cara kerja, atau apakah barang merupakan bagian/produk lengkap.</span>';
      }
    }
  }

  function fillExample() {
    if (state.mode === 'bulk') switchMode('quick');
    if (state.mode === 'quick') {
      els.quickDescription.value = 'Filter udara mesin kendaraan bermotor berbahan kertas berlipat dan plastik, digunakan untuk menyaring partikel dari udara yang masuk ke mesin bensin. Barang dijual sebagai unit filter pengganti lengkap.';
      updateDescriptionQuality();
      els.quickDescription.focus();
    } else {
      const values = {
        productName: 'Filter udara mesin kendaraan bermotor',
        productDescription: 'Elemen filter berlipat dengan rangka plastik, dijual sebagai unit pengganti lengkap.',
        material: 'Kertas filter dan plastik',
        mainFunction: 'Menyaring debu dan partikel dari udara sebelum masuk ke mesin',
        workingMethod: 'Udara melewati media kertas berlipat yang menangkap partikel',
        usage: 'Mesin bensin kendaraan bermotor',
        condition: 'Barang lengkap',
        packaging: 'Satu unit dalam kotak',
        composition: 'Media filter kertas dominan dengan rangka plastik',
        originCountry: 'Indonesia',
        additionalNotes: 'Produk aftermarket untuk kendaraan penumpang'
      };
      Object.entries(values).forEach(([id, value]) => { const el = $(`#${id}`); if (el) el.value = value; });
      els.productName.focus();
    }
  }

  function collectManualPayload() {
    if (state.mode === 'quick') {
      const description = els.quickDescription.value.trim();
      if (!description) {
        els.quickDescription.classList.add('invalid');
        throw new Error('Deskripsi barang tidak boleh kosong.');
      }
      if (description.length < 12) throw new Error('Deskripsi barang masih terlalu pendek. Tambahkan bahan, fungsi, dan cara kerja.');
      return { mode: 'manual', input_mode: 'quick', product: { description } };
    }

    const fields = ['productName', 'productDescription', 'material', 'mainFunction', 'workingMethod', 'usage', 'condition', 'packaging', 'composition', 'originCountry', 'additionalNotes'];
    const product = Object.fromEntries(fields.map(id => [id, $(`#${id}`).value.trim()]));
    if (!product.productName) {
      els.productName.classList.add('invalid');
      throw new Error('Nama barang wajib diisi pada Detailed Analysis.');
    }
    return { mode: 'manual', input_mode: 'detail', product };
  }

  function startProgress(title, detail, initial = 8) {
    stopProgressTimer();
    els.progressPanel.hidden = false;
    els.progressTitle.textContent = title;
    els.progressDetail.textContent = detail;
    let value = initial;
    setProgress(value);
    state.progressTimer = window.setInterval(() => {
      value = Math.min(88, value + Math.max(1, Math.round((88 - value) / 9)));
      setProgress(value);
    }, 650);
  }

  function setProgress(value, detail) {
    const safe = Math.max(0, Math.min(100, Math.round(value)));
    els.progressBar.style.width = `${safe}%`;
    els.progressPercent.textContent = `${safe}%`;
    if (detail) els.progressDetail.textContent = detail;
  }

  function stopProgressTimer() {
    if (state.progressTimer) window.clearInterval(state.progressTimer);
    state.progressTimer = null;
  }

  function setBusy(busy) {
    els.analyzeButton.disabled = busy;
    els.cancelButton.hidden = !busy;
    els.modeTabs.forEach(tab => { tab.disabled = busy; });
  }

  async function runManualAnalysis() {
    let payload;
    try {
      payload = collectManualPayload();
    } catch (error) {
      showInline(els.formError, error.message, 'error');
      return;
    }

    hideInline(els.formError);
    setBusy(true);
    state.currentController = new AbortController();
    startProgress('AI sedang menganalisis…', 'Menyusun kandidat HS Code dan langkah verifikasi');

    try {
      const response = await apiRequest(payload, { signal: state.currentController.signal });
      setProgress(100, 'Analisis selesai');
      const result = normalizeResult(response.data);
      renderResult(result, true);
      window.setTimeout(() => { els.progressPanel.hidden = true; }, 450);
    } catch (error) {
      els.progressPanel.hidden = true;
      if (error.name === 'AbortError') {
        toast('Permintaan dibatalkan', 'Tidak ada data hasil yang disimpan.', 'error');
      } else {
        handleAnalysisError(error);
      }
    } finally {
      stopProgressTimer();
      setBusy(false);
      state.currentController = null;
    }
  }

  function handleAnalysisError(error) {
    showInline(els.formError, error.message, 'error');
    if (['missing_api_key', 'invalid_api_key'].includes(error.code)) {
      setApiStatus('error', error.code === 'invalid_api_key' ? 'Groq API key tidak valid' : 'Groq API key belum dikonfigurasi');
      updateApiModalUI();
      openModal(els.apiModal);
    }
  }

  function normalizeResult(raw = {}) {
    const alternatives = Array.isArray(raw.alternative_codes) ? raw.alternative_codes : [];
    const missing = Array.isArray(raw.missing_information) ? raw.missing_information : [];
    const verification = Array.isArray(raw.verification_notes) ? raw.verification_notes : [];
    const confidenceRaw = String(raw.confidence || 'medium').toLowerCase().replace(/\s+/g, '_');
    const confidence = ['high', 'medium', 'low', 'insufficient_information'].includes(confidenceRaw) ? confidenceRaw : 'medium';
    return {
      product_summary: String(raw.product_summary || 'Ringkasan produk tidak tersedia.'),
      recommended_hs_code: formatHSCode(raw.recommended_hs_code || raw.hs_code || '—'),
      confidence,
      chapter: String(raw.chapter || 'Perlu verifikasi'),
      heading: String(raw.heading || 'Perlu verifikasi'),
      subheading: String(raw.subheading || 'Perlu verifikasi'),
      reasoning_summary: String(raw.reasoning_summary || raw.classification_rationale || 'Alasan klasifikasi tidak tersedia.'),
      alternative_codes: alternatives.map(item => typeof item === 'string' ? { code: formatHSCode(item), description: '', reason: '' } : {
        code: formatHSCode(item.code || item.hs_code || ''),
        description: String(item.description || item.title || ''),
        reason: String(item.reason || item.note || '')
      }).filter(item => item.code),
      missing_information: missing.map(String).filter(Boolean),
      verification_notes: verification.map(String).filter(Boolean),
      warning: String(raw.warning || '')
    };
  }

  function formatHSCode(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const digits = text.replace(/\D/g, '');
    if (digits.length === 8) return `${digits.slice(0,4)}.${digits.slice(4,6)}.${digits.slice(6,8)}`;
    if (digits.length === 10) return `${digits.slice(0,4)}.${digits.slice(4,6)}.${digits.slice(6,8)}.${digits.slice(8,10)}`;
    return text;
  }

  function confidenceLabel(confidence) {
    const labels = {
      high: 'High confidence',
      medium: 'Medium confidence',
      low: 'Low confidence',
      insufficient_information: 'Insufficient information'
    };
    return labels[confidence] || labels.medium;
  }

  function renderResult(result, saveHistory = false) {
    state.currentResult = result;
    $('#hsCodeValue').textContent = result.recommended_hs_code;
    $('#productSummary').textContent = result.product_summary;
    $('#chapterValue').textContent = result.chapter;
    $('#headingValue').textContent = result.heading;
    $('#subheadingValue').textContent = result.subheading;
    $('#rationaleValue').textContent = result.reasoning_summary;

    const badge = $('#confidenceBadge');
    const confidenceClass = result.confidence === 'insufficient_information' ? 'insufficient' : result.confidence;
    badge.className = `confidence ${confidenceClass}`;
    badge.innerHTML = `<span aria-hidden="true">●</span><strong>${confidenceLabel(result.confidence)}</strong>`;

    const alternatives = $('#alternativeCodes');
    alternatives.innerHTML = '';
    if (!result.alternative_codes.length) {
      alternatives.innerHTML = '<p class="empty-mini">Tidak ada alternatif yang disarankan.</p>';
    } else {
      result.alternative_codes.forEach(item => {
        const node = document.createElement('div');
        node.className = 'stack-item';
        const strong = document.createElement('strong');
        strong.textContent = item.code || 'Kode belum pasti';
        const span = document.createElement('span');
        span.textContent = [item.description, item.reason].filter(Boolean).join(' — ');
        node.append(strong, span);
        alternatives.appendChild(node);
      });
    }

    renderList($('#missingInformation'), result.missing_information, 'Tidak ada informasi penting yang ditandai kurang.');
    renderList($('#verificationNotes'), result.verification_notes, 'Verifikasi melalui BTKI dan sumber resmi yang berlaku.');

    const warning = $('#resultWarning');
    const lowMessage = result.confidence === 'low' || result.confidence === 'insufficient_information'
      ? 'Deskripsi barang belum cukup untuk menentukan HS Code secara meyakinkan. Tambahkan informasi yang ditandai sebelum menggunakan hasil.'
      : '';
    const warningText = result.warning || lowMessage;
    if (warningText) showInline(warning, warningText, 'warning'); else hideInline(warning);

    els.bulkResultSection.hidden = true;
    els.resultSection.hidden = false;
    if (saveHistory) addHistory(result);
    els.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderList(container, items, emptyText) {
    container.innerHTML = '';
    const values = items.length ? items : [emptyText];
    values.forEach(value => {
      const li = document.createElement('li');
      li.textContent = value;
      container.appendChild(li);
    });
  }

  function resultToText(result = state.currentResult) {
    if (!result) return '';
    const alternativeText = result.alternative_codes.length
      ? result.alternative_codes.map(item => `- ${item.code}: ${[item.description, item.reason].filter(Boolean).join(' — ')}`).join('\n')
      : '- Tidak ada';
    const missingText = result.missing_information.length ? result.missing_information.map(item => `- ${item}`).join('\n') : '- Tidak ada';
    const verificationText = result.verification_notes.length ? result.verification_notes.map(item => `- ${item}`).join('\n') : '- Verifikasi dengan BTKI/INSW';
    return `HASIL ANALISIS HS CODE\n\nRecommended HS Code: ${result.recommended_hs_code}\nConfidence: ${confidenceLabel(result.confidence)}\nChapter: ${result.chapter}\nHeading: ${result.heading}\nSubheading: ${result.subheading}\n\nProduct Summary\n${result.product_summary}\n\nClassification Rationale\n${result.reasoning_summary}\n\nAlternative Codes\n${alternativeText}\n\nMissing Information\n${missingText}\n\nVerification Checklist\n${verificationText}\n\nDisclaimer: Hasil AI merupakan rekomendasi awal dan bukan penetapan resmi kepabeanan.`;
  }

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      toast(successMessage, 'Teks telah disalin ke clipboard.');
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      toast(successMessage, 'Teks telah disalin ke clipboard.');
    }
  }

  function downloadJson() {
    if (!state.currentResult) return;
    const blob = new Blob([JSON.stringify(state.currentResult, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `hasil-hs-code-${state.currentResult.recommended_hs_code.replace(/\W/g, '') || 'analisis'}.json`);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE.history) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  function addHistory(result) {
    const history = getHistory();
    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      name: result.product_summary.slice(0, 100),
      code: result.recommended_hs_code,
      confidence: result.confidence,
      result
    };
    localStorage.setItem(STORAGE.history, JSON.stringify([item, ...history].slice(0, 30)));
    renderHistory();
  }

  function renderHistory(query = '') {
    const normalized = query.trim().toLowerCase();
    const history = getHistory();
    const filtered = history.filter(item => `${item.name} ${item.code}`.toLowerCase().includes(normalized));
    els.historyList.innerHTML = '';
    els.historyEmpty.hidden = history.length > 0;
    els.historyToolbar.hidden = history.length === 0;
    els.clearHistoryButton.hidden = history.length === 0;

    filtered.forEach(item => {
      const card = document.createElement('article');
      card.className = 'history-card';
      card.innerHTML = `
        <div class="history-card-head"><h3></h3><time></time></div>
        <div class="history-code"></div>
        <div class="history-card-foot">
          <span class="history-confidence"></span>
          <div class="history-actions">
            <button type="button" data-action="open" aria-label="Buka hasil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M10 14 21 3M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/></svg></button>
            <button type="button" data-action="copy" aria-label="Salin HS Code"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h11v13H8zM5 16H3V3h11v2"/></svg></button>
            <button type="button" data-action="delete" aria-label="Hapus histori"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
          </div>
        </div>`;
      $('h3', card).textContent = item.name;
      $('time', card).textContent = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt));
      $('.history-code', card).textContent = item.code;
      $('.history-confidence', card).textContent = confidenceLabel(item.confidence);
      $('[data-action="open"]', card).addEventListener('click', () => renderResult(normalizeResult(item.result), false));
      $('[data-action="copy"]', card).addEventListener('click', () => copyText(item.code, 'HS Code disalin'));
      $('[data-action="delete"]', card).addEventListener('click', () => deleteHistoryItem(item.id));
      els.historyList.appendChild(card);
    });
  }

  function deleteHistoryItem(id) {
    const history = getHistory().filter(item => item.id !== id);
    localStorage.setItem(STORAGE.history, JSON.stringify(history));
    renderHistory(els.historySearch.value);
    toast('Histori dihapus');
  }

  function openConfirm(title, message, action) {
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    state.confirmAction = action;
    openModal(els.confirmModal);
  }

  function clearAllHistory() {
    localStorage.removeItem(STORAGE.history);
    renderHistory();
    toast('Histori telah dihapus');
  }

  function clearLocalData() {
    localStorage.removeItem(STORAGE.history);
    sessionStorage.removeItem(STORAGE.sessionKey);
    localStorage.removeItem(STORAGE.localKey);
    state.currentResult = null;
    els.resultSection.hidden = true;
    renderHistory();
    updateApiModalUI();
    checkConnection({ silent: true });
    toast('Data lokal dihapus', 'Histori dan API key tersimpan telah dibersihkan.');
  }

  function handleSelectedFile(file) {
    hideInline(els.formError);
    if (!file) return;
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(extension)) {
      showInline(els.formError, 'Harap pilih file Excel yang valid (.xlsx atau .xls).', 'error');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showInline(els.formError, 'Ukuran file melebihi 10 MB. Kurangi ukuran file lalu coba kembali.', 'error');
      return;
    }
    state.selectedFile = file;
    els.selectedFileCard.hidden = false;
    els.fileNameDisplay.textContent = file.name;
    els.fileSizeDisplay.textContent = `${formatBytes(file.size)} · Siap diproses`;
    $('#dropZoneTitle').textContent = 'Ganti file Excel';
  }

  function removeSelectedFile() {
    state.selectedFile = null;
    els.fileInput.value = '';
    els.selectedFileCard.hidden = true;
    $('#dropZoneTitle').textContent = 'Pilih atau tarik file Excel ke sini';
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    const units = ['B', 'KB', 'MB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  async function waitForXLSX() {
    if (window.XLSX) return;
    if (!state.xlsxPromise) {
      state.xlsxPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
        script.async = true;
        script.onload = () => window.XLSX ? resolve() : reject(new Error('Library pembaca Excel tidak tersedia.'));
        script.onerror = () => reject(new Error('Library pembaca Excel gagal dimuat. Periksa koneksi internet lalu coba kembali.'));
        document.head.appendChild(script);
      }).catch(error => {
        state.xlsxPromise = null;
        throw error;
      });
    }
    await state.xlsxPromise;
  }

  async function runBulkAnalysis() {
    if (!state.selectedFile) {
      showInline(els.formError, 'Pilih file Excel CIPL terlebih dahulu.', 'error');
      return;
    }
    hideInline(els.formError);
    setBusy(true);
    state.currentController = new AbortController();
    startProgress('Membaca dokumen Excel…', 'Mendeteksi header dan kolom barang', 4);

    try {
      await waitForXLSX();
      const buffer = await state.selectedFile.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellStyles: true });
      const stats = await processWorkbook(workbook, state.currentController.signal);
      state.finalWorkbook = workbook;
      setProgress(100, 'Dokumen siap diunduh');
      stopProgressTimer();
      window.setTimeout(() => { els.progressPanel.hidden = true; }, 450);
      renderBulkResult(stats);
    } catch (error) {
      els.progressPanel.hidden = true;
      stopProgressTimer();
      if (error.name === 'AbortError') {
        toast('Pemrosesan dibatalkan', 'File asli tidak berubah.', 'error');
      } else {
        handleAnalysisError(error);
      }
    } finally {
      setBusy(false);
      state.currentController = null;
    }
  }

  async function processWorkbook(workbook, signal) {
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Workbook tidak memiliki worksheet.');
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    const detection = detectColumns(rows);
    if (detection.headerIdx < 0 || detection.nameCol < 0) {
      throw new Error('Kolom nama barang tidak ditemukan. Gunakan header yang memuat kata “Barang” atau “Uraian Barang”.');
    }

    let hsCol = detection.hsCol;
    if (hsCol < 0) {
      hsCol = Math.max(...rows[detection.headerIdx].map((_, index) => index), 0) + 1;
      rows[detection.headerIdx][hsCol] = 'HS CODE';
      setCell(sheet, detection.headerIdx, hsCol, 'HS CODE');
    }

    const combined = { ...OFFLINE_DB, ...state.cloudDB };
    const keys = Object.keys(combined).sort((a, b) => b.length - a.length);
    const unresolvedMap = new Map();
    let totalItems = 0;
    let existingItems = 0;
    let databaseMatches = 0;

    for (let rowIndex = detection.headerIdx + 1; rowIndex < rows.length; rowIndex += 1) {
      const name = String(rows[rowIndex][detection.nameCol] || '').trim().toUpperCase();
      if (!name) continue;
      totalItems += 1;
      const existing = String(rows[rowIndex][hsCol] || '').trim();
      if (existing) {
        existingItems += 1;
        continue;
      }
      const key = keys.find(candidate => name.includes(candidate));
      if (key) {
        setCell(sheet, rowIndex, hsCol, combined[key]);
        databaseMatches += 1;
      } else {
        if (!unresolvedMap.has(name)) unresolvedMap.set(name, []);
        unresolvedMap.get(name).push(rowIndex);
      }
    }

    const unresolved = Array.from(unresolvedMap.keys());
    const aiMapping = {};
    if (unresolved.length) {
      const chunks = chunkArray(unresolved, 35);
      for (let index = 0; index < chunks.length; index += 1) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const start = 25 + (index / chunks.length) * 55;
        setProgress(start, `Mengklasifikasikan batch ${index + 1} dari ${chunks.length}`);
        const response = await apiRequest({ mode: 'batch', items: chunks[index] }, { signal });
        Object.assign(aiMapping, normalizeBatchMapping(response.data));
      }
    }

    const newData = {};
    let aiMatches = 0;
    unresolvedMap.forEach((rowIndexes, productName) => {
      const code = aiMapping[productName] || aiMapping[productName.toUpperCase()];
      if (!code) return;
      rowIndexes.forEach(rowIndex => setCell(sheet, rowIndex, hsCol, code));
      aiMatches += rowIndexes.length;
      if (!state.cloudDB[productName] && !OFFLINE_DB[productName]) newData[productName] = code;
    });

    if (Object.keys(newData).length) {
      setProgress(88, 'Memperbarui basis pengetahuan Google Sheets');
      await saveToGoogleSheets(newData, signal);
    }

    return {
      totalItems,
      existingItems,
      databaseMatches,
      aiMatches,
      unresolvedItems: Math.max(0, totalItems - existingItems - databaseMatches - aiMatches),
      sheetName
    };
  }

  function detectColumns(rows) {
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 60); rowIndex += 1) {
      const normalized = rows[rowIndex].map(value => String(value || '').trim().toUpperCase());
      const nameCol = normalized.findIndex(value => value.includes('BARANG') || value.includes('URAIAN') || value.includes('DESCRIPTION'));
      const hsCol = normalized.findIndex(value => /(^|\s)HS(\s|$)|HS\s*CODE|KODE\s*HS/.test(value));
      if (nameCol >= 0) return { headerIdx: rowIndex, nameCol, hsCol };
    }
    return { headerIdx: -1, nameCol: -1, hsCol: -1 };
  }

  function setCell(sheet, rowIndex, colIndex, value) {
    const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
    const previous = sheet[address] || {};
    sheet[address] = { ...previous, t: 's', v: String(value) };
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    range.e.r = Math.max(range.e.r, rowIndex);
    range.e.c = Math.max(range.e.c, colIndex);
    sheet['!ref'] = XLSX.utils.encode_range(range);
  }

  function chunkArray(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks;
  }

  function normalizeBatchMapping(raw) {
    const source = raw && typeof raw === 'object' && raw.mapping && typeof raw.mapping === 'object' ? raw.mapping : raw;
    const result = {};
    if (!source || typeof source !== 'object') return result;
    Object.entries(source).forEach(([name, value]) => {
      const code = typeof value === 'string' ? value : value && (value.hs_code || value.code);
      if (code) result[String(name).trim().toUpperCase()] = formatHSCode(code);
    });
    return result;
  }

  async function saveToGoogleSheets(data, signal) {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 9000);
      if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
      await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
        signal: controller.signal
      });
      window.clearTimeout(timeout);
      Object.assign(state.cloudDB, data);
      updateDatabaseStatus('Terhubung');
    } catch (_) {
      toast('Hasil tetap berhasil', 'Database Google Sheets tidak dapat diperbarui saat ini.', 'error');
    }
  }

  function renderBulkResult(stats) {
    els.resultSection.hidden = true;
    els.bulkResultSection.hidden = false;
    $('#bulkResultSummary').textContent = `${stats.totalItems} baris barang diperiksa: ${stats.existingItems} sudah memiliki kode, ${stats.databaseMatches} ditemukan dari database, ${stats.aiMatches} dianalisis AI, dan ${stats.unresolvedItems} masih perlu ditinjau.`;
    els.bulkResultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function downloadExcel() {
    if (!state.finalWorkbook || !window.XLSX) return;
    XLSX.writeFile(state.finalWorkbook, 'HASIL_CIPL_KCU_BATAM.xlsx', { compression: true });
    toast('File Excel diunduh', 'Hasil tetap mempertahankan worksheet utama dari file sumber.');
  }

  async function loadCloudDatabase() {
    updateDatabaseStatus('Menghubungkan…');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(GOOGLE_APPS_SCRIPT_URL, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      state.cloudDB = Object.fromEntries(Object.entries(data).map(([key, value]) => [String(key).toUpperCase(), String(value)]));
      updateDatabaseStatus('Terhubung');
    } catch (_) {
      state.cloudDB = {};
      updateDatabaseStatus('Mode offline');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function updateDatabaseStatus(status) {
    $('#offlineCount').textContent = String(Object.keys(OFFLINE_DB).length);
    $('#cloudCount').textContent = String(Object.keys(state.cloudDB).length || 0);
    $('#databaseStatusText').textContent = status;
  }

  function resetSearch() {
    els.form.reset();
    removeSelectedFile();
    updateDescriptionQuality();
    els.resultSection.hidden = true;
    els.bulkResultSection.hidden = true;
    hideInline(els.formError);
    switchMode('quick');
    window.scrollTo({ top: $('.workspace').offsetTop - 80, behavior: 'smooth' });
    window.setTimeout(() => els.quickDescription.focus(), 450);
  }

  function bindEvents() {
    els.modeTabs.forEach(tab => tab.addEventListener('click', () => switchMode(tab.dataset.mode)));
    els.quickDescription.addEventListener('input', () => {
      els.quickDescription.classList.remove('invalid');
      updateDescriptionQuality();
    });
    $$('input, textarea, select', $('#detailPanel')).forEach(input => input.addEventListener('input', () => input.classList.remove('invalid')));
    $('#fillExampleButton').addEventListener('click', fillExample);
    els.form.addEventListener('submit', event => {
      event.preventDefault();
      if (state.mode === 'bulk') runBulkAnalysis(); else runManualAnalysis();
    });
    els.cancelButton.addEventListener('click', () => state.currentController?.abort());

    els.dropZone.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', event => handleSelectedFile(event.target.files[0]));
    ['dragenter', 'dragover'].forEach(eventName => els.dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      els.dropZone.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach(eventName => els.dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      els.dropZone.classList.remove('dragover');
    }));
    els.dropZone.addEventListener('drop', event => handleSelectedFile(event.dataTransfer.files[0]));
    $('#removeFileButton').addEventListener('click', removeSelectedFile);

    $('#toggleGuideButton').addEventListener('click', event => {
      const button = event.currentTarget;
      const content = $('#guideContent');
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      button.setAttribute('aria-label', expanded ? 'Buka panduan' : 'Tutup panduan');
      content.hidden = expanded;
    });

    [$('#apiStatusButton'), $('#openApiGuideButton'), $('#helpButton')].forEach(button => button.addEventListener('click', () => {
      updateApiModalUI();
      hideInline(els.apiFeedback);
      openModal(els.apiModal);
    }));
    $$('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(els.apiModal)));
    $$('[data-close-confirm]').forEach(button => button.addEventListener('click', () => closeModal(els.confirmModal)));
    $('#confirmActionButton').addEventListener('click', () => {
      const action = state.confirmAction;
      closeModal(els.confirmModal);
      state.confirmAction = null;
      if (typeof action === 'function') action();
    });

    $('#toggleKeyVisibility').addEventListener('click', event => {
      const visible = els.groqInput.type === 'text';
      els.groqInput.type = visible ? 'password' : 'text';
      event.currentTarget.setAttribute('aria-label', visible ? 'Tampilkan API key' : 'Sembunyikan API key');
    });
    $('#testKeyButton').addEventListener('click', () => {
      const key = els.groqInput.value.trim() || getStoredKey();
      if (!key && !state.serverKeyActive) {
        showInline(els.apiFeedback, 'Tempel Groq API key terlebih dahulu.', 'error');
        return;
      }
      checkConnection({ keyOverride: key });
    });
    $('#saveKeyButton').addEventListener('click', async () => {
      const key = els.groqInput.value.trim();
      if (!key) {
        showInline(els.apiFeedback, 'Tempel Groq API key yang ingin disimpan.', 'error');
        return;
      }
      if (!/^gsk_[A-Za-z0-9_-]{12,}$/.test(key)) {
        showInline(els.apiFeedback, 'Format API key tampaknya tidak valid. Key Groq biasanya diawali “gsk_”.', 'error');
        return;
      }
      $('#saveKeyButton').disabled = true;
      const valid = await checkConnection({ keyOverride: key });
      if (valid) {
        if (els.rememberKey.checked) {
          localStorage.setItem(STORAGE.localKey, key);
          sessionStorage.removeItem(STORAGE.sessionKey);
        } else {
          sessionStorage.setItem(STORAGE.sessionKey, key);
          localStorage.removeItem(STORAGE.localKey);
        }
        updateApiModalUI();
        toast('Groq API key tersimpan', els.rememberKey.checked ? 'Tersimpan secara opt-in di perangkat ini.' : 'Tersimpan hanya untuk sesi browser ini.');
        window.setTimeout(() => closeModal(els.apiModal), 500);
      }
      $('#saveKeyButton').disabled = false;
    });
    els.removeKeyButton.addEventListener('click', () => openConfirm('Hapus Groq API key?', 'Key akan dihapus dari penyimpanan sesi dan perangkat ini.', () => {
      sessionStorage.removeItem(STORAGE.sessionKey);
      localStorage.removeItem(STORAGE.localKey);
      updateApiModalUI();
      checkConnection({ silent: true });
      toast('Groq API key dihapus');
    }));

    $('#copyCodeButton').addEventListener('click', () => state.currentResult && copyText(state.currentResult.recommended_hs_code, 'HS Code disalin'));
    $('#copyFullButton').addEventListener('click', () => copyText(resultToText(), 'Analisis lengkap disalin'));
    $('#downloadJsonButton').addEventListener('click', downloadJson);
    $('#printButton').addEventListener('click', () => window.print());
    $('#shareButton').addEventListener('click', async () => {
      const text = resultToText();
      if (navigator.share) {
        try { await navigator.share({ title: 'Hasil Analisis HS Code', text }); } catch (_) { /* user cancelled */ }
      } else {
        copyText(text, 'Ringkasan disalin');
      }
    });
    $('#refineButton').addEventListener('click', () => $('.workspace').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    $('#newSearchButton').addEventListener('click', resetSearch);
    $('#downloadExcelButton').addEventListener('click', downloadExcel);

    els.historySearch.addEventListener('input', () => renderHistory(els.historySearch.value));
    els.clearHistoryButton.addEventListener('click', () => openConfirm('Hapus semua histori?', 'Seluruh hasil analisis lokal di perangkat ini akan dihapus permanen.', clearAllHistory));
    $('#removeLocalDataButton').addEventListener('click', () => openConfirm('Hapus seluruh data lokal?', 'Histori pencarian dan Groq API key yang tersimpan di browser akan dihapus.', clearLocalData));

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!els.confirmModal.hidden) closeModal(els.confirmModal);
        else if (!els.apiModal.hidden) closeModal(els.apiModal);
      }
      if (!els.apiModal.hidden) trapFocus(event, els.apiModal);
      if (!els.confirmModal.hidden) trapFocus(event, els.confirmModal);
    });
  }

  function applyPreviewMode() {
    const preview = new URLSearchParams(location.search).get('preview');
    if (preview === 'result') {
      renderResult(DEMO_RESULT, false);
      window.scrollTo({ top: els.resultSection.offsetTop - 82, behavior: 'auto' });
    } else if (preview === 'api') {
      state.serverKeyActive = false;
      updateApiModalUI();
      openModal(els.apiModal);
    } else if (preview === 'error') {
      state.serverKeyActive = false;
      updateApiModalUI();
      openModal(els.apiModal);
      showInline(els.apiFeedback, 'Groq API key tidak valid. Periksa kembali key atau buat key baru melalui Groq Console.', 'error');
      setApiStatus('error', 'Groq API key tidak valid');
    }
  }

  async function init() {
    migrateLegacyKey();
    bindEvents();
    updateDescriptionQuality();
    renderHistory();
    updateApiModalUI();
    updateDatabaseStatus('Menghubungkan…');
    loadCloudDatabase();
    await checkConnection({ silent: true });
    applyPreviewMode();
  }

  init();
})();
