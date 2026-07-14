/**
 * AI Tip — Interactive Demo JS
 * Simulates: Home View → Field Click → Chat View → AI Suggestion → Fill Form
 */

// ── Field definitions ──
const FIELDS = [
  { name:'Company Name',       type:'text',     section:'Company Information', required:true },
  { name:'Industry',           type:'select',   section:'Company Information', required:false },
  { name:'Registered Address', type:'text',     section:'Company Information', required:false },
  { name:'First Name',         type:'text',     section:'Primary Contact',     required:true },
  { name:'Last Name',          type:'text',     section:'Primary Contact',     required:true },
  { name:'Email Address',      type:'email',    section:'Primary Contact',     required:true },
  { name:'Phone Number',       type:'tel',      section:'Primary Contact',     required:false },
  { name:'Job Title',          type:'text',     section:'Primary Contact',     required:false },
  { name:'Department',         type:'select',   section:'Primary Contact',     required:false },
  { name:'Policy Number',      type:'text',     section:'Policy Details',      required:true },
  { name:'Sum Insured',        type:'text',     section:'Policy Details',      required:false },
  { name:'Coverage Start',     type:'date',     section:'Policy Details',      required:false },
  { name:'Coverage End',       type:'date',     section:'Policy Details',      required:false },
  { name:'Special Conditions', type:'textarea', section:'Policy Details',      required:false },
  { name:'Priority',           type:'select',   section:'Processing',          required:false },
  { name:'Correspondence Language', type:'select', section:'Processing',       required:false },
  { name:'GDPR Consent',       type:'checkbox', section:'Processing',          required:false },
];

// ── Demo suggestions (simulated LLM output) ──
const SUGGEST = {
  'Company Name':              { v:'Zurich Insurance Group Ltd',           s:'contract_zurich_2025.pdf §2.1',     c:'high',   r:'Legal entity from Master Service Agreement, March 2025.' },
  'Industry':                  { v:'Insurance',                           s:'company_profile.xlsx Row 12',        c:'high',   r:'Classified "Insurance & Reinsurance" in vendor database.' },
  'Registered Address':        { v:'Mythenquai 2, 8002 Zurich, Switzerland', s:'contract_zurich_2025.pdf §1.2',  c:'high',   r:'Registered office from contract header.' },
  'First Name':                { v:'Thomas',                              s:'email_thread_2025-06.md',            c:'high',   r:'Primary contact: "Thomas Müller, CRO".' },
  'Last Name':                 { v:'Müller',                              s:'email_thread_2025-06.md',            c:'high',   r:'Surname from email correspondence.' },
  'Email Address':             { v:'thomas.mueller@zurich.com',           s:'email_thread_2025-06.md',            c:'high',   r:'Email from message header and signature.' },
  'Phone Number':              { v:'+41 44 628 20 20',                    s:'contact_directory.xlsx Row 8',       c:'medium', r:'Direct line from contact directory.' },
  'Job Title':                 { v:'Chief Risk Officer',                  s:'email_thread_2025-06.md',            c:'high',   r:'Title from email signature + LinkedIn.' },
  'Department':                { v:'Risk Management',                     s:'company_profile.xlsx Row 12',        c:'medium', r:'Inferred from CRO title → "risk" in select.' },
  'Policy Number':             { v:'ZUR-2025-00421',                      s:'policy_register_2025.xlsx Row 42',   c:'high',   r:'Policy from underwriting register.' },
  'Sum Insured':               { v:'1,500,000',                           s:'policy_register_2025.xlsx Row 42',   c:'high',   r:'Sum insured CHF 1,500,000 from schedule.' },
  'Coverage Start':            { v:'2026-01-01',                          s:'policy_register_2025.xlsx Row 42',   c:'high',   r:'Coverage start from inception record.' },
  'Coverage End':              { v:'2026-12-31',                          s:'policy_register_2025.xlsx Row 42',   c:'high',   r:'12-month term from inception.' },
  'Special Conditions':        { v:'Flood exclusion FLD-2024 applies. Earthquake sub-limit CHF 500,000.', s:'policy_wording_zurich_2025.pdf §4.3', c:'medium', r:'From policy wording. Review for completeness.' },
  'Priority':                  { v:'High',                                s:'internal_sla_policy.md',             c:'medium', r:'Sum insured > CHF 1M → High priority.' },
  'Correspondence Language':   { v:'Deutsch',                             s:'contract_zurich_2025.pdf header',    c:'high',   r:'Contract language is German → "de".' },
  'GDPR Consent':              { v:'✓',                                   s:'contract_zurich_2025.pdf §7.1',      c:'high',   r:'GDPR consent form signed and filed.' },
};

// ── Form field ID mapping ──
const FIELD_ID = {
  'Company Name':'company_name','Industry':'industry','Registered Address':'company_address',
  'First Name':'first_name','Last Name':'last_name','Email Address':'email',
  'Phone Number':'phone','Job Title':'job_title','Department':'department',
  'Policy Number':'policy_number','Sum Insured':'sum_insured',
  'Coverage Start':'start_date','Coverage End':'end_date',
  'Special Conditions':'notes','Priority':'priority',
  'Correspondence Language':'language','GDPR Consent':'gdpr_consent',
};

// ── State ──
const S = {
  view: 'home',          // 'home' | 'chat'
  activeField: null,     // field name or 'overview'
  filled: {},            // { 'Company Name': true, ... }
  chatMsgs: [],          // current chat messages
};

// ═══════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════

function init() {
  renderFieldRows();
  // Listen for field-click messages from the iframe
  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'field-focused') {
      openFieldChat(e.data.fieldName);
    }
  });
}

// ── Render field rows in the Home view page card ──
function renderFieldRows() {
  const container = document.getElementById('fieldRows');
  // Show first 6 fields in the card
  const visible = FIELDS.slice(0, 6);
  let html = '';
  visible.forEach(f => {
    const filled = S.filled[f.name];
    html += `
      <div class="page-card-row" onclick="openFieldChat('${esc(f.name)}')">
        <span class="pcr-icon">${filled ? '✅' : '✨'}</span>
        <span class="pcr-label">${esc(f.name)}</span>
        <span class="pcr-type">${f.type}</span>
        ${filled
          ? '<span class="pcr-badge filled">done</span>'
          : '<span class="pcr-badge">—</span>'}
      </div>`;
  });
  container.innerHTML = html;

  // Update overview badge
  const filledCount = Object.keys(S.filled).length;
  const badge = document.getElementById('overviewBadge');
  if (filledCount > 0) {
    badge.textContent = filledCount + ' filled';
    badge.classList.add('filled');
  } else {
    badge.textContent = '—';
    badge.classList.remove('filled');
  }
}

// ═══════════════════════════════════════════════════════════
// Navigation: Home ↔ Chat
// ═══════════════════════════════════════════════════════════

function openOverviewChat() {
  S.view = 'chat';
  S.activeField = 'overview';
  S.chatMsgs = [
    { role:'assistant', html:'I\'ve analyzed the <strong>Customer Registration</strong> form and detected <strong>15 fields</strong> across 4 sections. I can help with individual fields or <strong>Batch Fill</strong> all at once.' },
    { role:'assistant', html:'My knowledge base has data for most fields from your Zurich Insurance contract, policy register, and email correspondence. Click any field from the Home page to get started!' },
  ];
  switchView('chat');
  updateChatHeader('💬', 'Overview', null);
  renderChat();
}

function openFieldChat(fieldName) {
  S.view = 'chat';
  S.activeField = fieldName;
  const sug = SUGGEST[fieldName];
  const filled = S.filled[fieldName];

  if (filled) {
    S.chatMsgs = [
      { role:'assistant', html:`<strong>"${esc(fieldName)}"</strong> is already filled. You can reset and try again, or pick another field.` },
    ];
  } else if (sug) {
    S.chatMsgs = [
      { role:'user', html:`Suggest a value for <strong>${esc(fieldName)}</strong>` },
      { role:'assistant', html:renderSuggestionCard(fieldName, sug) },
    ];
  } else {
    S.chatMsgs = [
      { role:'assistant', html:`I don't have data for <strong>"${esc(fieldName)}"</strong> yet. Try uploading more documents or type a value manually.` },
    ];
  }

  const type = (FIELDS.find(f => f.name === fieldName) || {}).type || 'text';
  switchView('chat');
  updateChatHeader('✨', fieldName, type);

  // Show tip banner
  const banner = document.getElementById('tipBanner');
  const tipText = document.getElementById('tipText');
  if (filled) {
    banner.style.display = 'none';
  } else if (sug) {
    banner.style.display = 'flex';
    tipText.textContent = `💡 AI suggestion ready for "${fieldName}" — review below`;
  } else {
    banner.style.display = 'flex';
    tipText.textContent = `Ask AI to suggest a value for "${fieldName}"`;
  }

  renderChat();
}

function goHome() {
  S.view = 'home';
  S.activeField = null;
  S.chatMsgs = [];
  switchView('home');
  document.getElementById('tipBanner').style.display = 'none';
  renderFieldRows();
}

function switchView(view) {
  document.getElementById('homeView').classList.toggle('active', view === 'home');
  document.getElementById('chatView').classList.toggle('active', view === 'chat');
}

function updateChatHeader(icon, title, badge) {
  document.getElementById('chatIcon').textContent = icon;
  document.getElementById('chatTitle').textContent = title;
  const badgeEl = document.getElementById('chatBadge');
  if (badge) {
    badgeEl.textContent = badge;
    badgeEl.style.display = 'inline';
  } else {
    badgeEl.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════
// Chat Rendering
// ═══════════════════════════════════════════════════════════

function renderChat() {
  const container = document.getElementById('chatMessages');
  container.innerHTML = S.chatMsgs.map(m => {
    const cls = m.role === 'user' ? 'user' : 'assistant';
    return `<div class="chat-msg ${cls}"><div class="bubble">${m.html}</div></div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

function renderSuggestionCard(fieldName, sug) {
  const confClass = sug.c === 'high' ? 'conf-high' : 'conf-medium';
  const confLabel = sug.c === 'high' ? '🟢 High confidence' : '🟡 Medium confidence';

  return `
    Here's what I found from your knowledge base:
    <div class="suggest-box">
      <div class="sug-label">Suggested Value</div>
      <div class="sug-value">${esc(sug.v)}</div>
      <div class="sug-source">📄 Source: ${esc(sug.s)}</div>
      <span class="sug-conf ${confClass}">${confLabel}</span>
      <div style="font-size:11px;color:var(--gray-500);margin-bottom:6px">${esc(sug.r)}</div>
      <div class="sug-actions">
        <button class="btn-sm primary" onclick="acceptSuggestion('${esc(fieldName)}')">✓ Accept & Fill</button>
        <button class="btn-sm outline" onclick="showToast('✏️ Edit mode — modify before filling (real app feature)')">✏️ Edit</button>
        <button class="btn-sm ghost" onclick="skipSuggestion('${esc(fieldName)}')">✕ Skip</button>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════
// Actions
// ═══════════════════════════════════════════════════════════

function acceptSuggestion(fieldName) {
  const sug = SUGGEST[fieldName];
  if (!sug) return;

  // Fill the actual form
  fillFormField(fieldName, sug.v);
  S.filled[fieldName] = true;

  // Update chat
  S.chatMsgs.push({
    role:'assistant',
    html:`✅ <strong>"${esc(sug.v)}"</strong> has been filled into the <strong>${esc(fieldName)}</strong> field.`
  });
  renderChat();

  // Update banner
  const tipText = document.getElementById('tipText');
  tipText.textContent = `✅ "${fieldName}" filled!`;
  document.getElementById('tipBanner').querySelector('.tb-dot').classList.remove('pulse');

  // Update home view
  renderFieldRows();

  showToast(`✅ "${fieldName}" filled with: ${sug.v}`);
}

function skipSuggestion(fieldName) {
  S.chatMsgs.push({
    role:'assistant',
    html:`Suggestion skipped for <strong>"${esc(fieldName)}"</strong>. Ask again or type a value manually.`
  });
  renderChat();
  document.getElementById('tipBanner').style.display = 'none';
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  // Add user message
  S.chatMsgs.push({ role:'user', html: esc(text) });
  renderChat();

  // Simulate AI response
  const lower = text.toLowerCase();

  setTimeout(() => {
    // Try to match a field
    const matched = FIELDS.find(f => lower.includes(f.name.toLowerCase()));
    if (matched && SUGGEST[matched.name] && !S.filled[matched.name]) {
      // Update active field and show suggestion
      S.activeField = matched.name;
      updateChatHeader('✨', matched.name, matched.type);
      S.chatMsgs.push({
        role:'assistant',
        html: renderSuggestionCard(matched.name, SUGGEST[matched.name])
      });
      document.getElementById('tipBanner').style.display = 'flex';
      document.getElementById('tipText').textContent = `💡 AI suggestion ready for "${matched.name}"`;
      document.getElementById('tipBanner').querySelector('.tb-dot').classList.add('pulse');
    } else if (lower.includes('batch') || lower.includes('all') || lower.includes('fill all')) {
      runBatchFill();
    } else {
      S.chatMsgs.push({
        role:'assistant',
        html:'Try mentioning a field name like <strong>"Company Name"</strong> or <strong>"Policy Number"</strong>, or ask for <strong>"Batch Fill"</strong>. You can also click any field from the Home page.'
      });
    }
    renderChat();
  }, 600);
}

// ═══════════════════════════════════════════════════════════
// Batch Fill
// ═══════════════════════════════════════════════════════════

function runBatchFill() {
  S.activeField = 'overview';

  let rows = '';
  FIELDS.forEach(f => {
    const sug = SUGGEST[f.name];
    if (!sug) return;
    const confClass = sug.c === 'high' ? 'conf-high' : 'conf-medium';
    const filled = S.filled[f.name];
    rows += `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--gray-100);font-size:12px">
        <span style="flex:1;font-weight:500">${esc(f.name)}</span>
        <span style="color:var(--blue);font-weight:500;font-size:11px">${esc(sug.v)}</span>
        <span class="sug-conf ${confClass}" style="font-size:10px">${sug.c === 'high' ? 'Hi' : 'Med'}</span>
        ${filled
          ? '<span style="font-size:10px;color:var(--green)">✅</span>'
          : `<button class="btn-sm primary" style="font-size:10px;padding:2px 8px" onclick="acceptSuggestion('${esc(f.name)}')">Fill</button>`}
      </div>`;
  });

  S.chatMsgs.push({ role:'user', html:'⚡ Batch fill all fields' });
  S.chatMsgs.push({
    role:'assistant',
    html:`
      <strong>Batch Fill Results</strong> — analyzed from 3 documents
      <div style="margin-top:8px;background:var(--white);border:1px solid var(--gray-200);border-radius:6px;padding:8px 10px">${rows}</div>
      <div style="margin-top:8px">
        <button class="btn-sm primary" onclick="fillAllRemaining()">Fill All Remaining</button>
        <button class="btn-sm outline" style="margin-left:4px" onclick="showToast('📋 Copied all suggestions (real app feature)')">Copy All</button>
      </div>`
  });

  switchView('chat');
  updateChatHeader('⚡', 'Batch Fill', null);
  document.getElementById('tipBanner').style.display = 'none';
  renderChat();
}

function fillAllRemaining() {
  let count = 0;
  FIELDS.forEach(f => {
    if (!S.filled[f.name] && SUGGEST[f.name]) {
      fillFormField(f.name, SUGGEST[f.name].v);
      S.filled[f.name] = true;
      count++;
    }
  });
  renderFieldRows();
  showToast(count > 0 ? `✅ Filled ${count} remaining fields` : '✅ All fields already filled!');
  runBatchFill(); // refresh view
}

// ═══════════════════════════════════════════════════════════
// Fill actual form in the iframe
// ═══════════════════════════════════════════════════════════

function fillFormField(fieldName, value) {
  // Try direct DOM access first
  try {
    const iframe = document.getElementById('demoForm');
    if (!iframe || !iframe.contentWindow) return;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return;

    const elId = FIELD_ID[fieldName];
    if (!elId) return;
    const el = doc.getElementById(elId);
    if (!el) return;

    if (el.tagName === 'SELECT') {
      const opts = el.options;
      const s = value.toLowerCase();
      for (let i = 0; i < opts.length; i++) {
        const t = opts[i].textContent.toLowerCase();
        const v = opts[i].value.toLowerCase();
        if (t.includes(s) || s.includes(t) || v === s) {
          el.value = opts[i].value;
          break;
        }
      }
    } else if (el.type === 'checkbox') {
      el.checked = true;
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (e) {
    console.warn('Direct fill failed, trying postMessage:', e);
  }

  // Also try postMessage
  try {
    const iframe = document.getElementById('demoForm');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type:'fill-field', fieldName, value }, '*');
    }
  } catch (e) { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════
// Reset
// ═══════════════════════════════════════════════════════════

function resetDemo() {
  S.view = 'home';
  S.activeField = null;
  S.filled = {};
  S.chatMsgs = [];
  switchView('home');
  document.getElementById('tipBanner').style.display = 'none';
  renderFieldRows();

  try {
    const iframe = document.getElementById('demoForm');
    if (iframe) iframe.src = iframe.src;
  } catch (e) { /* ignore */ }

  showToast('🔄 Demo reset — try again!');
}

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function showToast(msg) {
  const c = document.getElementById('toastContainer');
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = msg;
  c.appendChild(d);
  setTimeout(() => d.remove(), 2500);
}

document.addEventListener('DOMContentLoaded', init);
