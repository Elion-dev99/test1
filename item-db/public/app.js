const rarityLabel = {
  common: '一般',
  uncommon: '高級',
  rare: '希少',
  heroic: '英雄',
  legendary: '伝説',
};

const categoryLabel = {
  equipment: '装備',
  skillbook: 'スキルブック',
  collection: '収集品',
  material: '素材',
  consumable: '消費',
  other: 'その他',
};

const ARMOR_SLOTS = ['ヘルム', 'アーマー', 'グローブ', 'ブーツ'];
const ACCESSORY_SLOTS = ['イヤリング', 'ネックレス', 'ブレスレット', 'ベルト', 'リング'];
const BURIAL_SLOTS = ['セフィラ', '紋章', 'オルゴール', '懐中時計', 'ゴブレット', '日記帳', '万年筆', '仮面', '香水'];

const state = {
  view: 'home',
  stats: null,
  catalog: [],
  bosses: [],
  versions: [],
  currentVersion: null,
  openAcc: 'items',
  browse: { q: '', category: '', rarity: '', slot: '', version: '', label: '' },
  detailId: null,
};

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error || 'API error');
  return body.data;
}

function toast(message, type = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast ${type}`;
  setTimeout(() => el.classList.add('hidden'), 2800);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function monogram(name) {
  const t = String(name || '?').trim();
  return escapeHtml(t.slice(0, 1) || '?');
}

function countBy(pred) {
  return state.catalog.filter(pred).length;
}

function slotGroup(item) {
  const slot = item.slot || '';
  if (item.category !== 'equipment') return null;
  if (slot === '武器') return 'weapon';
  if (ARMOR_SLOTS.includes(slot)) return 'armor';
  if (ACCESSORY_SLOTS.includes(slot)) return 'accessory';
  if (BURIAL_SLOTS.includes(slot) || slot) return 'burial';
  return 'equipment_other';
}

function setTopNav(view) {
  const active = view === 'drops' ? 'drops' : 'home';
  document.querySelectorAll('.top-link[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === active);
  });
}

function showView(name) {
  state.view = name;
  document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));
  const target = document.getElementById(`view-${name}`);
  if (target) target.classList.add('active');
  setTopNav(name);
  renderBreadcrumb();
}

function crumb(label, action) {
  if (!action) return `<span class="current">${escapeHtml(label)}</span>`;
  return `<button type="button" data-crumb="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
}

function renderBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  const parts = [crumb('ホーム', 'home')];
  if (state.view === 'home') {
    parts.push('<span class="sep">›</span>', crumb('データベース'));
  } else if (state.view === 'results') {
    parts.push('<span class="sep">›</span>', crumb('データベース', 'home'));
    parts.push('<span class="sep">›</span>', crumb(state.browse.label || '検索結果'));
  } else if (state.view === 'detail') {
    parts.push('<span class="sep">›</span>', crumb('データベース', 'home'));
    if (state.browse.label) {
      parts.push('<span class="sep">›</span>', crumb(state.browse.label, 'results'));
    }
    parts.push('<span class="sep">›</span>', crumb('詳細'));
  } else if (state.view === 'drops') {
    parts.push('<span class="sep">›</span>', crumb('ドロップ'));
  }
  el.innerHTML = parts.join('');
  el.querySelectorAll('[data-crumb]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.crumb;
      if (a === 'home') goHome();
      else if (a === 'results') goResults(state.browse);
    });
  });
}

function versionLabel(key) {
  if (!key) return '—';
  const hit = state.versions.find((v) => v.version_key === key);
  return hit ? hit.version_key : key;
}

function renderStats() {
  const s = state.stats || {};
  const cur = state.currentVersion || s.current_version;
  document.getElementById('top-stats').textContent =
    `Ver ${cur?.version_key ?? '—'} · items ${s.items ?? '—'} · bosses ${s.bosses ?? '—'}`;
  document.getElementById('home-version').textContent = cur
    ? `Version: ${cur.version_key}（${cur.label || cur.version_key}）`
    : 'Version: —';
  const latestLabel = document.getElementById('latest-version-label');
  if (latestLabel) {
    latestLabel.textContent = cur
      ? `${cur.label || cur.version_key} のアイテム（${s.latest_item_count ?? 0}件）`
      : '現行バージョンのアイテム';
  }
  const rail = document.getElementById('rail-stats');
  rail.innerHTML = `
    <dt>現行Ver</dt><dd>${escapeHtml(cur?.version_key ?? '—')}</dd>
    <dt>アイテム</dt><dd>${s.items ?? 0}</dd>
    <dt>最新追加</dt><dd>${s.latest_item_count ?? 0}</dd>
    <dt>強化段階</dt><dd>${s.variants ?? 0}</dd>
    <dt>ドロップ</dt><dd>${s.drops ?? 0}</dd>
    <dt>ボス</dt><dd>${s.bosses ?? 0}</dd>
  `;
}

function fillVersionSelects() {
  const opts = ['<option value="">全バージョン</option>']
    .concat(
      state.versions.map((v) => {
        const mark = v.is_current ? ' ★' : '';
        return `<option value="${escapeHtml(v.version_key)}">${escapeHtml(v.version_key)}${mark}</option>`;
      }),
    )
    .join('');
  const results = document.getElementById('results-version');
  if (results) {
    const keep = results.value;
    results.innerHTML = opts;
    results.value = keep;
  }
}

function renderAccordion() {
  const itemsTotal = state.catalog.length;
  const weapon = countBy((i) => slotGroup(i) === 'weapon');
  const armor = countBy((i) => slotGroup(i) === 'armor');
  const accessory = countBy((i) => slotGroup(i) === 'accessory');
  const burial = countBy((i) => slotGroup(i) === 'burial');
  const material = countBy((i) => i.category === 'material');
  const consumable = countBy((i) => i.category === 'consumable');
  const skillbook = countBy((i) => i.category === 'skillbook');
  const collection = countBy((i) => i.category === 'collection');
  const other = countBy((i) => i.category === 'other');

  const rarityLinks = Object.entries(rarityLabel)
    .map(([key, label]) => {
      const n = countBy((i) => i.rarity === key);
      return `<li><button type="button" data-browse='${JSON.stringify({ rarity: key, label })}'>${label} <span class="n">(${n})</span></button></li>`;
    })
    .join('');

  const bossLinks = state.bosses
    .map(
      (b) =>
        `<li><button type="button" data-boss="${escapeHtml(b.name)}">${escapeHtml(b.name)}</button></li>`,
    )
    .join('');

  const versionLinks = state.versions
    .map((v) => {
      const n = countBy((i) => i.game_version === v.version_key);
      const cur = v.is_current ? ' ★' : '';
      return `<li><button type="button" data-browse='${JSON.stringify({
        version: v.version_key,
        label: v.version_key + cur,
      })}'>${escapeHtml(v.version_key)} <span class="n">(${n})</span></button></li>`;
    })
    .join('');

  const root = document.getElementById('category-accordion');
  root.innerHTML = `
    <div class="acc-item ${state.openAcc === 'items' ? 'open' : ''}" data-acc="items">
      <button type="button" class="acc-head">
        <span>アイテム <span class="count">（${itemsTotal}件）</span></span>
        <span class="chev" aria-hidden="true"></span>
      </button>
      <div class="acc-body">
        <ul class="subcat-grid">
          <li><button type="button" data-browse='{"category":"equipment","slot":"武器","label":"武器"}'>武器 <span class="n">(${weapon})</span></button></li>
          <li><button type="button" data-browse='{"category":"equipment","slotGroup":"armor","label":"防具"}'>防具 <span class="n">(${armor})</span></button></li>
          <li><button type="button" data-browse='{"category":"equipment","slotGroup":"accessory","label":"アクセサリ"}'>アクセサリ <span class="n">(${accessory})</span></button></li>
          <li><button type="button" data-browse='{"category":"equipment","slotGroup":"burial","label":"副葬品・その他装備"}'>副葬品・その他 <span class="n">(${burial})</span></button></li>
          <li><button type="button" data-browse='{"category":"material","label":"素材"}'>素材 <span class="n">(${material})</span></button></li>
          <li><button type="button" data-browse='{"category":"consumable","label":"消費"}'>消費 <span class="n">(${consumable})</span></button></li>
          <li><button type="button" data-browse='{"category":"skillbook","label":"スキルブック"}'>スキルブック <span class="n">(${skillbook})</span></button></li>
          <li><button type="button" data-browse='{"category":"collection","label":"収集品"}'>収集品 <span class="n">(${collection})</span></button></li>
          <li><button type="button" data-browse='{"category":"other","label":"その他"}'>その他 <span class="n">(${other})</span></button></li>
        </ul>
      </div>
    </div>
    <div class="acc-item ${state.openAcc === 'rarity' ? 'open' : ''}" data-acc="rarity">
      <button type="button" class="acc-head">
        <span>レアリティから検索</span>
        <span class="chev" aria-hidden="true"></span>
      </button>
      <div class="acc-body"><ul class="subcat-grid">${rarityLinks}</ul></div>
    </div>
    <div class="acc-item ${state.openAcc === 'version' ? 'open' : ''}" data-acc="version">
      <button type="button" class="acc-head">
        <span>バージョンから検索 <span class="count">（${state.versions.length}）</span></span>
        <span class="chev" aria-hidden="true"></span>
      </button>
      <div class="acc-body"><ul class="subcat-grid">${versionLinks || '<li class="n">バージョン未登録</li>'}</ul></div>
    </div>
    <div class="acc-item ${state.openAcc === 'boss' ? 'open' : ''}" data-acc="boss">
      <button type="button" class="acc-head">
        <span>ボス <span class="count">（${state.bosses.length}件）</span></span>
        <span class="chev" aria-hidden="true"></span>
      </button>
      <div class="acc-body"><ul class="subcat-grid">${bossLinks || '<li class="n">ボス未登録</li>'}</ul></div>
    </div>
  `;

  root.querySelectorAll('.acc-head').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.acc-item');
      const key = item.dataset.acc;
      state.openAcc = state.openAcc === key ? '' : key;
      renderAccordion();
    });
  });
  bindBrowseButtons(root);
  root.querySelectorAll('[data-boss]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showView('drops');
      document.getElementById('drop-boss').value = btn.dataset.boss;
      document.getElementById('drop-search-form').requestSubmit();
    });
  });
}

function bindBrowseButtons(scope = document) {
  scope.querySelectorAll('[data-browse]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const payload = JSON.parse(btn.dataset.browse);
      goResults(payload);
    });
  });
}

function filterCatalog(browse) {
  let versionKey = browse.version || '';
  if (versionKey === 'latest' || versionKey === 'current') {
    versionKey = state.currentVersion?.version_key || '';
  }
  return state.catalog.filter((item) => {
    if (browse.q) {
      const q = browse.q.toLowerCase();
      if (!String(item.name).toLowerCase().includes(q)) return false;
    }
    if (browse.category && item.category !== browse.category) return false;
    if (browse.rarity && item.rarity !== browse.rarity) return false;
    if (browse.slot && item.slot !== browse.slot) return false;
    if (browse.slotGroup) {
      if (slotGroup(item) !== browse.slotGroup) return false;
    }
    if (versionKey && item.game_version !== versionKey) return false;
    return true;
  });
}

function browseLabel(browse) {
  if (browse.label) return browse.label;
  if (browse.version === 'latest' || browse.version === 'current') {
    return `最新アップデート（${state.currentVersion?.version_key || '—'}）`;
  }
  if (browse.version) return `Version ${browse.version}`;
  if (browse.q) return `「${browse.q}」の検索結果`;
  if (browse.slot) return browse.slot;
  if (browse.category) return categoryLabel[browse.category] || browse.category;
  if (browse.rarity) return rarityLabel[browse.rarity] || browse.rarity;
  return '検索結果';
}

function renderResultsSide(active) {
  const el = document.getElementById('results-side');
  const links = [
    { label: 'すべて', browse: { label: 'すべて' } },
    { label: '武器', browse: { category: 'equipment', slot: '武器', label: '武器' } },
    { label: '防具', browse: { category: 'equipment', slotGroup: 'armor', label: '防具' } },
    { label: 'アクセサリ', browse: { category: 'equipment', slotGroup: 'accessory', label: 'アクセサリ' } },
    { label: '素材', browse: { category: 'material', label: '素材' } },
    { label: '消費', browse: { category: 'consumable', label: '消費' } },
    { label: 'スキルブック', browse: { category: 'skillbook', label: 'スキルブック' } },
    { label: '収集品', browse: { category: 'collection', label: '収集品' } },
    { label: '伝説', browse: { rarity: 'legendary', label: '伝説' } },
    { label: '英雄', browse: { rarity: 'heroic', label: '英雄' } },
    {
      label: '最新Ver',
      browse: {
        version: 'latest',
        label: `最新アップデート（${state.currentVersion?.version_key || '—'}）`,
      },
    },
  ];
  const activeKey = JSON.stringify({
    category: active.category || '',
    rarity: active.rarity || '',
    slot: active.slot || '',
    slotGroup: active.slotGroup || '',
    version: active.version === 'latest' || active.version === 'current'
      ? 'latest'
      : active.version || '',
  });
  el.innerHTML = `
    <div class="side-group">
      <span class="side-label">カテゴリ</span>
      ${links
        .map((l) => {
          const key = JSON.stringify({
            category: l.browse.category || '',
            rarity: l.browse.rarity || '',
            slot: l.browse.slot || '',
            slotGroup: l.browse.slotGroup || '',
            version: l.browse.version === 'latest' || l.browse.version === 'current'
              ? 'latest'
              : l.browse.version || '',
          });
          return `<button type="button" class="${key === activeKey ? 'active' : ''}" data-browse='${JSON.stringify(l.browse)}'>${l.label}</button>`;
        })
        .join('')}
    </div>
  `;
  bindBrowseButtons(el);
}

async function goResults(browse = {}) {
  const next = {
    q: browse.q || '',
    category: browse.category || '',
    rarity: browse.rarity || '',
    slot: browse.slot || '',
    slotGroup: browse.slotGroup || '',
    version: browse.version || '',
    label: browseLabel(browse),
  };
  state.browse = next;
  document.getElementById('results-q').value = next.q;
  document.getElementById('results-rarity').value = next.rarity;
  const verSelect = document.getElementById('results-version');
  if (verSelect) {
    const v =
      next.version === 'latest' || next.version === 'current'
        ? state.currentVersion?.version_key || ''
        : next.version;
    verSelect.value = v;
  }
  document.getElementById('results-heading').textContent = next.label;

  // Prefer local catalog (full snapshot). Fall back to API when empty/stale.
  let items = filterCatalog(next);
  if (!state.catalog.length) {
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.category) params.set('category', next.category);
    if (next.rarity) params.set('rarity', next.rarity);
    if (next.slot) params.set('slot', next.slot);
    if (next.version) params.set('version', next.version);
    params.set('limit', '500');
    items = await api(`/items?${params}`);
  }

  renderResultsSide(next);
  const body = document.getElementById('results-body');
  const empty = document.getElementById('results-empty');
  document.getElementById('results-meta').textContent = `全 ${items.length} 件`;

  if (!items.length) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    body.innerHTML = items
      .map((item) => {
        const cat = categoryLabel[item.category] || item.category;
        const rarity = rarityLabel[item.rarity] || item.rarity;
        const slot = item.slot || '—';
        return `
          <tr data-id="${item.id}">
            <td>
              <div class="item-cell">
                <div class="item-icon r-${escapeHtml(item.rarity)}">${monogram(item.name)}</div>
                <div>
                  <span class="item-sub">${escapeHtml(cat)}${item.slot ? ' / ' + escapeHtml(item.slot) : ''}</span>
                  <span class="item-name">${escapeHtml(item.name)}</span>
                </div>
              </div>
            </td>
            <td class="rarity-text r-${escapeHtml(item.rarity)}">${escapeHtml(rarity)}</td>
            <td>${escapeHtml(slot)}</td>
            <td>${escapeHtml(versionLabel(item.game_version))}</td>
            <td>${item.tradeable ? '取引可' : '帰属'}</td>
          </tr>`;
      })
      .join('');
    body.querySelectorAll('tr[data-id]').forEach((row) => {
      row.addEventListener('click', () => showDetail(Number(row.dataset.id)));
    });
  }

  showView('results');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function showDetail(id) {
  const detail = await api(`/items/${id}`);
  state.detailId = id;
  const item = detail.item;
  const extra =
    detail.extra ||
    (detail.stats?.extra_json ? JSON.parse(detail.stats.extra_json) : null) ||
    {};
  const table = extra.enhance_table || [];
  const chips = [
    extra.tier ? `Tier ${extra.tier}` : null,
    extra.class ? extra.class : null,
    extra.weapon_type || null,
    extra.weight != null ? `重量 ${extra.weight}` : null,
    extra.skill_damage != null ? `スキルダメージ ${extra.skill_damage}` : null,
    extra.normal_monster_damage != null ? `通常モンスターダメージ ${extra.normal_monster_damage}` : null,
    extra.magic_attack != null ? `魔法攻撃力 ${extra.magic_attack}` : null,
    extra.crit_damage != null ? `クリティカルダメージ ${extra.crit_damage}` : null,
    extra.pvp_attack != null ? `PvP攻撃力 ${extra.pvp_attack}` : null,
    detail.stats?.attack != null ? `攻撃 ${detail.stats.attack}` : null,
  ].filter(Boolean);

  const enhanceHtml = table.length
    ? `
      <h3><span class="diamond" aria-hidden="true"></span>強化段階ステータス</h3>
      <div class="result-table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>強化</th>
              <th>最低攻撃</th>
              <th>最大攻撃</th>
              <th>追加攻撃</th>
              <th>命中</th>
              <th>スキルダメ</th>
            </tr>
          </thead>
          <tbody>
            ${table
              .map((r) => {
                const cls = r.enhance_level === 7 || r.enhance_level === 10 ? 'breakpoint' : '';
                return `<tr class="${cls}">
                  <td>+${r.enhance_level}</td>
                  <td>${r.weapon_min_atk ?? '—'}</td>
                  <td>${r.weapon_max_atk ?? '—'}</td>
                  <td>+${r.weapon_add_atk ?? 0}</td>
                  <td>${r.accuracy ? '+' + r.accuracy : '—'}</td>
                  <td>${r.skill_damage != null && r.skill_damage !== '' ? r.skill_damage : '—'}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
      ${
        extra.scaling_notes
          ? `<p class="scaling-note">${[].concat(extra.scaling_notes).map(escapeHtml).join('<br>')}</p>`
          : ''
      }`
    : '';

  const sources = (detail.sources || [])
    .map((s) => `<li>${escapeHtml(s.label)}${s.ref_note ? ` — ${escapeHtml(s.ref_note)}` : ''}</li>`)
    .join('');
  const drops = (detail.drops || [])
    .map((d) => `<li>${escapeHtml(d.boss_name)}${d.drop_note ? ` — ${escapeHtml(d.drop_note)}` : ''}</li>`)
    .join('');
  const variants = (detail.variants || [])
    .slice()
    .sort((a, b) => a.enhance_level - b.enhance_level)
    .map((v) => `<li>+${v.enhance_level}${v.blessed ? ' 祝福' : ''}${v.option_summary ? ` · ${escapeHtml(v.option_summary)}` : ''}</li>`)
    .join('');

  document.getElementById('detail-sheet').innerHTML = `
    <div class="detail-head">
      <div class="item-icon r-${escapeHtml(item.rarity)}">${monogram(item.name)}</div>
      <div>
        <h2 class="rarity-text r-${escapeHtml(item.rarity)}">${escapeHtml(item.name)}</h2>
        <div class="detail-meta">
          <span>ID ${item.id}</span>
          <span>${escapeHtml(categoryLabel[item.category] || item.category)}</span>
          <span class="rarity-text r-${escapeHtml(item.rarity)}">${escapeHtml(rarityLabel[item.rarity] || item.rarity)}</span>
          ${item.slot ? `<span>${escapeHtml(item.slot)}</span>` : ''}
          ${item.game_version ? `<span>Ver ${escapeHtml(item.game_version)}</span>` : ''}
          <span>${item.tradeable ? '取引可' : '帰属'}</span>
          ${item.verified ? '<span>検証済</span>' : ''}
        </div>
      </div>
    </div>
    ${item.description ? `<p class="detail-desc">${escapeHtml(item.description)}</p>` : ''}
    ${chips.length ? `<div class="stat-chips">${chips.map((c) => `<span class="stat-chip">${escapeHtml(c)}</span>`).join('')}</div>` : ''}
    ${enhanceHtml}
    <div class="detail-blocks">
      ${
        sources
          ? `<div class="detail-block"><h4>入手先</h4><ul>${sources}</ul></div>`
          : ''
      }
      ${
        drops
          ? `<div class="detail-block"><h4>ボストロップ</h4><ul>${drops}</ul></div>`
          : ''
      }
      ${
        variants
          ? `<div class="detail-block"><h4>登録バリアント</h4><ul>${variants}</ul></div>`
          : ''
      }
      ${
        detail.aliases?.length
          ? `<div class="detail-block"><h4>別名</h4><ul>${detail.aliases.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul></div>`
          : ''
      }
    </div>
    <button type="button" class="raw-toggle" id="raw-toggle">生データ表示</button>
    <pre class="raw-json hidden" id="raw-json">${escapeHtml(JSON.stringify(detail, null, 2))}</pre>
  `;
  document.getElementById('raw-toggle').addEventListener('click', () => {
    document.getElementById('raw-json').classList.toggle('hidden');
  });
  showView('detail');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goHome() {
  showView('home');
  renderAccordion();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function bootstrap() {
  const [stats, items, bosses, versionData] = await Promise.all([
    api('/stats'),
    api('/items?limit=500'),
    api('/bosses').catch(() => []),
    api('/versions').catch(() => ({ current: null, versions: [] })),
  ]);
  state.stats = stats;
  state.catalog = items;
  state.bosses = bosses;
  state.versions = versionData.versions || [];
  state.currentVersion = versionData.current || stats.current_version || null;
  fillVersionSelects();
  renderStats();
  renderAccordion();

  const list = document.getElementById('boss-list');
  list.innerHTML = bosses.map((b) => `<option value="${escapeHtml(b.name)}"></option>`).join('');
}

document.querySelectorAll('[data-nav]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const nav = el.dataset.nav;
    if (nav === 'home') goHome();
    else showView(nav);
  });
});

document.getElementById('home-search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = document.getElementById('home-q').value.trim();
  goResults({ q, label: q ? `「${q}」の検索結果` : '検索結果' }).catch((err) => toast(err.message, 'error'));
});

document.getElementById('btn-latest-version').addEventListener('click', () => {
  goResults({
    version: 'latest',
    label: `最新アップデート（${state.currentVersion?.version_key || '—'}）`,
  }).catch((err) => toast(err.message, 'error'));
});

document.getElementById('results-search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  goResults({
    ...state.browse,
    q: document.getElementById('results-q').value.trim(),
    rarity: document.getElementById('results-rarity').value,
    version: document.getElementById('results-version').value,
  }).catch((err) => toast(err.message, 'error'));
});

bindBrowseButtons(document);

document.getElementById('drop-search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boss = document.getElementById('drop-boss').value.trim();
  if (!boss) return toast('ボス名を入力', 'error');
  try {
    const drops = await api(`/drops?boss=${encodeURIComponent(boss)}`);
    const list = document.getElementById('drop-list');
    if (!drops.length) {
      list.innerHTML = '<p class="empty">ドロップ未登録</p>';
      return;
    }
    list.innerHTML = drops
      .map(
        (d) => `
      <div class="drop-row">
        <div>
          <strong>${escapeHtml(d.item_name)}</strong>
          <div class="meta">item #${d.item_id} · ${escapeHtml(d.drop_note || 'メモなし')}</div>
        </div>
        <span class="meta">${escapeHtml(d.boss_name)}</span>
      </div>`,
      )
      .join('');
  } catch (err) {
    toast(err.message, 'error');
  }
});

bootstrap()
  .then(() => showView('home'))
  .catch((e) => toast(e.message, 'error'));
