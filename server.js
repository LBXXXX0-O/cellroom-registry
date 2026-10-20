const path = require('path');
const fs = require('fs');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const MAX_OCCUPANCY = 2; // 细胞间最多同时 2 人使用

// ---------- 状态持久化 ----------
function defaultState() {
  return {
    occupied: 0,        // 当前使用人数
    max: MAX_OCCUPANCY, // 上限
    updatedAt: null     // 最近一次变动时间
  };
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const data = JSON.parse(raw);
    // 兼容旧数据结构，缺字段时补默认
    return {
      occupied: Number.isInteger(data.occupied) ? clamp(data.occupied) : 0,
      max: MAX_OCCUPANCY,
      updatedAt: data.updatedAt || null
    };
  } catch {
    return defaultState();
  }
}

function clamp(n) {
  return Math.max(0, Math.min(MAX_OCCUPANCY, n));
}

function saveState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

let state = loadState();

// ---------- 状态变更 + 广播 ----------
function setState(occupied, updatedAt = new Date().toISOString()) {
  state.occupied = clamp(occupied);
  state.updatedAt = updatedAt;
  saveState();
  broadcast();
  return state;
}

// 广播给所有已连接的客户端
function broadcast() {
  const payload = JSON.stringify({ type: 'state', data: state });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- REST API（供页面初次加载，以及非 WebSocket 客户端）----------
app.get('/api/state', (_req, res) => {
  res.json(state);
});

// 进入：人数 +1
app.post('/api/enter', (_req, res) => {
  if (state.occupied >= MAX_OCCUPANCY) {
    return res.status(409).json({ ok: false, error: '已满员，不能再进入', state });
  }
  setState(state.occupied + 1);
  res.json({ ok: true, state });
});

// 离开：人数 -1
app.post('/api/exit', (_req, res) => {
  if (state.occupied <= 0) {
    return res.status(409).json({ ok: false, error: '当前没人使用，无需离开', state });
  }
  setState(state.occupied - 1);
  res.json({ ok: true, state });
});

// 全部清空为 0
app.post('/api/reset', (_req, res) => {
  setState(0);
  res.json({ ok: true, state });
});

const server = app.listen(PORT, () => {
  console.log(`细胞间登记系统已启动: http://localhost:${PORT}`);
  console.log(`当前状态: ${state.occupied}/${MAX_OCCUPANCY}`);
});

// ---------- WebSocket 实时同步 ----------
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  // 新客户端连接时立即推送一次当前状态
  ws.send(JSON.stringify({ type: 'state', data: state }));
});
