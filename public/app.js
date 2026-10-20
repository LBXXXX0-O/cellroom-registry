// 细胞间使用登记 - 前端逻辑
const MAX = 2;
let current = 0; // 当前本地已知人数
let optimisticLock = false; // 防止乐观更新与服务器广播冲突

const card = document.getElementById('statusCard');
const icon = document.getElementById('statusIcon');
const label = document.getElementById('statusLabel');
const sub = document.getElementById('statusSub');
const occupiedNum = document.getElementById('occupiedNum');
const lastUpd = document.getElementById('lastUpd');
const connBadge = document.getElementById('conn');
const btnEnter = document.getElementById('btnEnter');
const btnExit = document.getElementById('btnExit');
const btnReset = document.getElementById('btnReset');

// ---------- 渲染状态 ----------
function render(s) {
  current = s.occupied;
  occupiedNum.textContent = s.occupied;

  if (s.occupied >= MAX) {
    card.className = 'card status--full';
    icon.textContent = '🔴';
    label.textContent = '满员 · 暂时不可进入';
  } else if (s.occupied >= 1) {
    card.className = 'card status--busy';
    icon.textContent = '🟠';
    label.textContent = s.occupied === 1 ? '1 人在使用中' : `${s.occupied} 人在使用中`;
  } else {
    card.className = 'card status--idle';
    icon.textContent = '🟢';
    label.textContent = '空闲 · 可进入';
  }

  sub.textContent = `当前 ${s.occupied} 人使用（上限 ${MAX} 人）`;

  // 按钮可用性：有人才能离开；没满才能进入
  btnEnter.disabled = s.occupied >= MAX;
  btnExit.disabled = s.occupied <= 0;
  btnReset.disabled = s.occupied <= 0;

  lastUpd.textContent = s.updatedAt ? `最近更新：${new Date(s.updatedAt).toLocaleTimeString()}` : '—';
}

// ---------- 网络请求封装 ----------
async function api(path) {
  const resp = await fetch(path, { method: 'POST' });
  const data = await resp.json();
  if (!resp.ok) {
    // 服务端返回的冲突信息（如已满员）直接提示
    alert(data.error || '操作失败，请重试');
    return null;
  }
  return data.state;
}

// 点击后乐观更新，让界面立即反馈
function optimistic(delta) {
  const next = Math.max(0, Math.min(MAX, current + delta));
  optimisticLock = true;
  render({ occupied: next, updatedAt: new Date().toISOString() });
}

btnEnter.addEventListener('click', async () => {
  if (current >= MAX) return;
  optimistic(1);
  await api('/api/enter');
});

btnExit.addEventListener('click', async () => {
  if (current <= 0) return;
  optimistic(-1);
  await api('/api/exit');
});

btnReset.addEventListener('click', async () => {
  optimistic(-current); // 归零
  await api('/api/reset');
});

// ---------- WebSocket 实时同步 ----------
let ws = null;
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    connBadge.textContent = '实时在线';
    connBadge.className = 'conn on';
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') {
      if (!optimisticLock) {
        render(msg.data); // 服务端权威状态
      }
      optimisticLock = false;
    }
  };

  ws.onclose = () => {
    connBadge.textContent = '已断开，重连中…';
    connBadge.className = 'conn off';
    setTimeout(connect, 2000); // 自动重连
  };

  ws.onerror = () => ws.close();
}

// ---------- 初始化：先拉一次权威状态 ----------
(async function init() {
  try {
    const resp = await fetch('/api/state');
    const state = await resp.json();
    render(state);
  } catch {
    lastUpd.textContent = '无法加载状态，请检查网络';
  }
  connect();
})();
