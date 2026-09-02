const API = '/api';

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'API Error');
  return data.data;
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  setTimeout(() => el.classList.add('hidden'), 3000);
}

function formatDate(iso) {
  if (!iso) return '未設定';
  return new Date(iso).toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function scheduleTypeBadge(type) {
  const labels = { daily: '毎日', weekly: '毎週', respawn: 'リスポン', fixed: '固定' };
  return `<span class="badge badge-${type}">${labels[type] || type}</span>`;
}

// Tab navigation
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    loadTab(btn.dataset.tab);
  });
});

function loadTab(tab) {
  switch (tab) {
    case 'dashboard': loadDashboard(); break;
    case 'bosses': loadBosses(); break;
    case 'schedules': loadSchedules(); break;
    case 'settings': loadSettings(); break;
    case 'logs': loadLogs(); break;
  }
}

// Dashboard
async function loadDashboard() {
  const stats = await api('/stats');
  document.getElementById('stat-bosses').textContent = stats.activeBosses;
  document.getElementById('stat-schedules').textContent = stats.activeSchedules;
  document.getElementById('stat-notifications').textContent = stats.notificationsToday;

  const schedules = await api('/schedules');
  const upcoming = schedules
    .filter((s) => s.enabled && s.next_spawn)
    .sort((a, b) => new Date(a.next_spawn) - new Date(b.next_spawn))
    .slice(0, 10);

  const list = document.getElementById('upcoming-list');
  if (upcoming.length === 0) {
    list.innerHTML = '<p class="hint">次の出現予定はありません</p>';
    return;
  }

  list.innerHTML = upcoming.map((s) => `
    <div class="upcoming-item">
      <span>${scheduleTypeBadge(s.schedule_type)} <strong>${s.boss_name}</strong> — ${s.schedule_label}</span>
      <span>${formatDate(s.next_spawn)}</span>
    </div>
  `).join('');
}

document.getElementById('btn-run-cron').addEventListener('click', async () => {
  try {
    const result = await api('/cron/run', { method: 'POST' });
    toast(`通知チェック完了: 送信 ${result.sent}件 / スキップ ${result.skipped}件`);
    loadDashboard();
  } catch (e) {
    toast(e.message, 'error');
  }
});

// Bosses
let bossesCache = [];

async function loadBosses() {
  bossesCache = await api('/bosses');
  const list = document.getElementById('bosses-list');

  if (bossesCache.length === 0) {
    list.innerHTML = '<p class="hint">ボスが登録されていません。「ボス追加」から登録してください。</p>';
    return;
  }

  list.innerHTML = bossesCache.map((b) => `
    <div class="boss-card ${b.enabled ? '' : 'disabled'}" style="border-left-color: ${b.color}">
      <h4>${b.name}</h4>
      <div class="location">📍 ${b.location || '場所未設定'}</div>
      ${b.description ? `<p style="font-size:0.85rem;color:var(--text-muted)">${b.description}</p>` : ''}
      <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.5rem">
        リスポン: ${b.respawn_minutes > 0 ? b.respawn_minutes + '分' : 'なし'}
      </div>
      <div class="actions">
        <button class="btn btn-sm btn-secondary" onclick="editBoss(${b.id})">編集</button>
        <button class="btn btn-sm btn-danger" onclick="deleteBoss(${b.id})">削除</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('btn-add-boss').addEventListener('click', () => openBossModal());

function openBossModal(boss = null) {
  const modal = document.getElementById('boss-modal');
  document.getElementById('boss-modal-title').textContent = boss ? 'ボス編集' : 'ボス追加';
  document.getElementById('boss-id').value = boss?.id || '';
  document.getElementById('boss-name').value = boss?.name || '';
  document.getElementById('boss-location').value = boss?.location || '';
  document.getElementById('boss-description').value = boss?.description || '';
  document.getElementById('boss-respawn').value = boss?.respawn_minutes || 0;
  document.getElementById('boss-color').value = boss?.color || '#E74C3C';
  document.getElementById('boss-image').value = boss?.image_url || '';
  document.getElementById('boss-enabled').checked = boss ? !!boss.enabled : true;
  modal.showModal();
}

window.editBoss = async (id) => {
  const boss = bossesCache.find((b) => b.id === id) || await api(`/bosses/${id}`);
  openBossModal(boss);
};

window.deleteBoss = async (id) => {
  if (!confirm('このボスを削除しますか？関連するスケジュールも削除されます。')) return;
  try {
    await api(`/bosses/${id}`, { method: 'DELETE' });
    toast('ボスを削除しました');
    loadBosses();
  } catch (e) {
    toast(e.message, 'error');
  }
};

document.getElementById('boss-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('boss-id').value;
  const body = {
    name: document.getElementById('boss-name').value,
    location: document.getElementById('boss-location').value || null,
    description: document.getElementById('boss-description').value || null,
    respawn_minutes: parseInt(document.getElementById('boss-respawn').value, 10) || 0,
    color: document.getElementById('boss-color').value,
    image_url: document.getElementById('boss-image').value || null,
    enabled: document.getElementById('boss-enabled').checked ? 1 : 0,
  };

  try {
    if (id) {
      await api(`/bosses/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      toast('ボスを更新しました');
    } else {
      await api('/bosses', { method: 'POST', body: JSON.stringify(body) });
      toast('ボスを追加しました');
    }
    document.getElementById('boss-modal').close();
    loadBosses();
  } catch (err) {
    toast(err.message, 'error');
  }
});

// Schedules
let schedulesCache = [];

async function loadSchedules() {
  schedulesCache = await api('/schedules');
  const list = document.getElementById('schedules-list');

  if (schedulesCache.length === 0) {
    list.innerHTML = '<p class="hint">スケジュールが登録されていません。</p>';
    return;
  }

  list.innerHTML = schedulesCache.map((s) => `
    <div class="schedule-item">
      <div class="schedule-info">
        <h4>${scheduleTypeBadge(s.schedule_type)} ${s.boss_name}</h4>
        <div class="meta">${s.schedule_label}</div>
        ${s.next_spawn ? `<div class="next">次の出現: ${formatDate(s.next_spawn)}</div>` : ''}
        ${s.notes ? `<div class="meta">💬 ${s.notes}</div>` : ''}
      </div>
      <div class="schedule-actions">
        <button class="btn btn-sm btn-success" onclick="killBoss(${s.id})">💀 討伐</button>
        <button class="btn btn-sm btn-warning" onclick="notifyBoss(${s.id})">🔔 通知</button>
        <button class="btn btn-sm btn-secondary" onclick="editSchedule(${s.id})">編集</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSchedule(${s.id})">削除</button>
      </div>
    </div>
  `).join('');
}

window.killBoss = async (id) => {
  try {
    await api(`/schedules/${id}/kill`, { method: 'POST' });
    toast('討伐を記録しました');
    loadSchedules();
  } catch (e) {
    toast(e.message, 'error');
  }
};

window.notifyBoss = async (id) => {
  const message = prompt('カスタムメッセージ（空欄でデフォルト）:');
  try {
    await api(`/schedules/${id}/notify`, {
      method: 'POST',
      body: JSON.stringify({ message: message || undefined }),
    });
    toast('通知を送信しました');
  } catch (e) {
    toast(e.message, 'error');
  }
};

window.editSchedule = async (id) => {
  const s = schedulesCache.find((x) => x.id === id) || await api(`/schedules/${id}`);
  openScheduleModal(s);
};

window.deleteSchedule = async (id) => {
  if (!confirm('このスケジュールを削除しますか？')) return;
  try {
    await api(`/schedules/${id}`, { method: 'DELETE' });
    toast('スケジュールを削除しました');
    loadSchedules();
  } catch (e) {
    toast(e.message, 'error');
  }
};

document.getElementById('btn-add-schedule').addEventListener('click', () => openScheduleModal());

async function openScheduleModal(schedule = null) {
  const modal = document.getElementById('schedule-modal');
  const bosses = bossesCache.length ? bossesCache : await api('/bosses');

  const bossSelect = document.getElementById('schedule-boss');
  bossSelect.innerHTML = bosses.map((b) =>
    `<option value="${b.id}">${b.name}</option>`
  ).join('');

  document.getElementById('schedule-modal-title').textContent = schedule ? 'スケジュール編集' : 'スケジュール追加';
  document.getElementById('schedule-id').value = schedule?.id || '';
  document.getElementById('schedule-boss').value = schedule?.boss_id || bosses[0]?.id || '';
  document.getElementById('schedule-type').value = schedule?.schedule_type || 'daily';
  document.getElementById('schedule-time').value = schedule?.daily_time || '12:00';
  document.getElementById('schedule-datetime').value = schedule?.spawn_at
    ? schedule.spawn_at.slice(0, 16) : '';
  document.getElementById('schedule-notify').value = schedule?.notify_minutes || '';
  document.getElementById('schedule-notes').value = schedule?.notes || '';
  document.getElementById('schedule-enabled').checked = schedule ? !!schedule.enabled : true;

  document.querySelectorAll('.weekday-cb').forEach((cb) => {
    const days = (schedule?.weekly_days || '').split(',').map((d) => d.trim());
    cb.checked = days.includes(cb.value);
  });

  updateScheduleFields();
  modal.showModal();
}

function updateScheduleFields() {
  const type = document.getElementById('schedule-type').value;
  document.getElementById('schedule-daily-fields').classList.toggle('hidden', type === 'fixed' || type === 'respawn');
  document.getElementById('schedule-weekly-fields').classList.toggle('hidden', type !== 'weekly');
  document.getElementById('schedule-fixed-fields').classList.toggle('hidden', type !== 'fixed');
  document.getElementById('schedule-respawn-fields').classList.toggle('hidden', type !== 'respawn');
}

document.getElementById('schedule-type').addEventListener('change', updateScheduleFields);

document.getElementById('schedule-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('schedule-id').value;
  const type = document.getElementById('schedule-type').value;

  const weeklyDays = [...document.querySelectorAll('.weekday-cb:checked')]
    .map((cb) => cb.value)
    .join(',');

  const body = {
    boss_id: parseInt(document.getElementById('schedule-boss').value, 10),
    schedule_type: type,
    daily_time: type !== 'fixed' && type !== 'respawn'
      ? document.getElementById('schedule-time').value : null,
    weekly_days: type === 'weekly' ? weeklyDays : null,
    spawn_at: type === 'fixed'
      ? new Date(document.getElementById('schedule-datetime').value).toISOString() : null,
    notify_minutes: document.getElementById('schedule-notify').value || null,
    notes: document.getElementById('schedule-notes').value || null,
    enabled: document.getElementById('schedule-enabled').checked ? 1 : 0,
  };

  try {
    if (id) {
      await api(`/schedules/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      toast('スケジュールを更新しました');
    } else {
      await api('/schedules', { method: 'POST', body: JSON.stringify(body) });
      toast('スケジュールを追加しました');
    }
    document.getElementById('schedule-modal').close();
    loadSchedules();
  } catch (err) {
    toast(err.message, 'error');
  }
});

// Settings
async function loadSettings() {
  const s = await api('/settings');
  document.getElementById('webhook-url').value = s.discord_webhook_url || '';
  document.getElementById('timezone').value = s.timezone || 'Asia/Tokyo';
  document.getElementById('notify-minutes').value = s.default_notify_minutes || '5,15,30';
  document.getElementById('mention-role').value = s.mention_role_id || '';
  document.getElementById('embed-color').value = s.embed_color || '#E74C3C';
  document.getElementById('mention-everyone').checked = !!s.mention_everyone;
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    discord_webhook_url: document.getElementById('webhook-url').value || null,
    timezone: document.getElementById('timezone').value,
    default_notify_minutes: document.getElementById('notify-minutes').value,
    mention_role_id: document.getElementById('mention-role').value || null,
    embed_color: document.getElementById('embed-color').value,
    mention_everyone: document.getElementById('mention-everyone').checked ? 1 : 0,
  };

  try {
    await api('/settings', { method: 'PUT', body: JSON.stringify(body) });
    toast('設定を保存しました');
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('btn-test-webhook').addEventListener('click', async () => {
  try {
    await api('/settings/test', { method: 'POST' });
    toast('テスト通知を送信しました');
  } catch (e) {
    toast(e.message, 'error');
  }
});

// Logs
async function loadLogs() {
  const logs = await api('/logs');
  const list = document.getElementById('logs-list');

  if (logs.length === 0) {
    list.innerHTML = '<p class="hint">通知履歴はありません</p>';
    return;
  }

  list.innerHTML = logs.map((l) => `
    <div class="log-item">
      <span>
        <span class="type-${l.notification_type}">[${l.notification_type}]</span>
        <strong>${l.boss_name}</strong> — ${l.message || ''}
      </span>
      <span>${formatDate(l.sent_at)}</span>
    </div>
  `).join('');
}

// Modal close buttons
document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => btn.closest('dialog').close());
});

// Init
loadDashboard();
