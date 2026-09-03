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

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${name}"]`).classList.add('active');
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

async function loadStats() {
  const s = await api('/stats');
  document.getElementById('stats').innerHTML =
    `items ${s.items}<br>variants ${s.variants}<br>snapshots ${s.snapshots}<br>drops ${s.drops}<br>bosses ${s.bosses}`;
}

async function searchItems() {
  const q = document.getElementById('search-q').value.trim();
  const category = document.getElementById('search-category').value;
  const rarity = document.getElementById('search-rarity').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (rarity) params.set('rarity', rarity);
  const items = await api(`/items?${params}`);
  const list = document.getElementById('item-list');
  document.getElementById('item-detail').classList.add('hidden');

  if (!items.length) {
    list.innerHTML = '<p class="meta">該当なし</p>';
    return;
  }

  list.innerHTML = items
    .map(
      (i) => `
    <div class="item-row" data-id="${i.id}">
      <div>
        <h3>${i.name}</h3>
        <div class="meta">#${i.id} · ${categoryLabel[i.category] || i.category} · ${rarityLabel[i.rarity] || i.rarity}</div>
      </div>
      <span class="badge">${i.tradeable ? '取引可' : '帰属'}</span>
    </div>`,
    )
    .join('');

  list.querySelectorAll('.item-row').forEach((row) => {
    row.addEventListener('click', () => showDetail(Number(row.dataset.id)));
  });
}

async function showDetail(id) {
  const detail = await api(`/items/${id}`);
  const el = document.getElementById('item-detail');
  el.classList.remove('hidden');
  const extra = detail.extra || (detail.stats?.extra_json ? JSON.parse(detail.stats.extra_json) : null) || {};
  const table = extra.enhance_table || [];
  const enhanceHtml = table.length
    ? `<h3>強化段階ステータス</h3>
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
                <td>${r.weapon_min_atk}</td>
                <td>${r.weapon_max_atk}</td>
                <td>+${r.weapon_add_atk}</td>
                <td>${r.accuracy ? '+' + r.accuracy : '—'}</td>
                <td>${r.skill_damage}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
      ${
        extra.scaling_notes
          ? `<p class="meta">${[].concat(extra.scaling_notes).join('<br>')}</p>`
          : ''
      }`
    : '';

  el.innerHTML = `
    <h2>${detail.item.name}</h2>
    <div class="meta">ID ${detail.item.id} / ${detail.item.slot || ''} / ${rarityLabel[detail.item.rarity] || detail.item.rarity}</div>
    ${detail.item.description ? `<p class="desc">${detail.item.description}</p>` : ''}
    ${enhanceHtml}
    <pre>${JSON.stringify(detail, null, 2)}</pre>
  `;
}

document.getElementById('btn-search').addEventListener('click', () => {
  searchItems().catch((e) => toast(e.message, 'error'));
});
document.getElementById('search-q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchItems().catch((err) => toast(err.message, 'error'));
});

document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const aliases = String(fd.get('aliases') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const item = await api('/items', {
      method: 'POST',
      body: JSON.stringify({
        name: fd.get('name'),
        aliases,
        category: fd.get('category'),
        rarity: fd.get('rarity'),
        slot: fd.get('slot') || null,
        description: fd.get('description') || null,
        source_url: fd.get('source_url') || null,
        tradeable: fd.get('tradeable') ? 1 : 0,
        verified: fd.get('verified') ? 1 : 0,
      }),
    });
    toast(`登録しました #${item.id}`);
    e.target.reset();
    loadStats();
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('btn-drop-search').addEventListener('click', async () => {
  const boss = document.getElementById('drop-boss').value.trim();
  if (!boss) return toast('ボス名を入力', 'error');
  try {
    const drops = await api(`/drops?boss=${encodeURIComponent(boss)}`);
    const list = document.getElementById('drop-list');
    if (!drops.length) {
      list.innerHTML = '<p class="meta">ドロップ未登録</p>';
      return;
    }
    list.innerHTML = drops
      .map(
        (d) => `
      <div class="item-row">
        <div>
          <h3>${d.item_name}</h3>
          <div class="meta">item #${d.item_id} · ${d.drop_note || 'メモなし'}</div>
        </div>
        <span class="badge">${d.boss_name}</span>
      </div>`,
      )
      .join('');
  } catch (e) {
    toast(e.message, 'error');
  }
});

document.getElementById('drop-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/drops', {
      method: 'POST',
      body: JSON.stringify({
        item_id: Number(fd.get('item_id')),
        boss_name: fd.get('boss_name'),
        drop_note: fd.get('drop_note') || null,
      }),
    });
    toast('ドロップを追加しました');
    e.target.reset();
    loadStats();
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('price-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const itemId = Number(fd.get('item_id'));
  try {
    await api(`/items/${itemId}/price`, {
      method: 'POST',
      body: JSON.stringify({
        enhance_level: Number(fd.get('enhance_level') || 0),
        blessed: fd.get('blessed') ? 1 : 0,
        min_price: fd.get('min_price') ? Number(fd.get('min_price')) : null,
        listing_count: Number(fd.get('listing_count') || 0),
        stock_qty: Number(fd.get('stock_qty') || 0),
        traded_28d: Number(fd.get('traded_28d') || 0),
        note: fd.get('note') || null,
      }),
    });
    toast('相場を記録しました');
    loadStats();
  } catch (err) {
    toast(err.message, 'error');
  }
});

loadStats().catch((e) => toast(e.message, 'error'));
searchItems().catch(() => {});
