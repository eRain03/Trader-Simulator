<template>
  <div class="trader-console">
    <div class="connection-bar">
      <div class="conn-status">
        <span class="indicator" :class="{ active: isConnected }"></span>
        <span class="text">{{ isConnected ? 'BINANCE LIVE' : 'DISCONNECTED' }}</span>
      </div>
      <div class="live-ticker" v-if="marketData.a">
        <span class="ticker-symbol">{{ form.symbol.toUpperCase() }}</span>
        <span class="ticker-price ask" @click="fillPrice(marketData.a)">
          ASK: {{ Number(marketData.a).toFixed(2) }}
        </span>
        <span class="ticker-price bid" @click="fillPrice(marketData.b)">
          BID: {{ Number(marketData.b).toFixed(2) }}
        </span>
      </div>
    </div>

    <div class="control-panel">
      <div class="input-group">
        <label>合约 (Symbol)</label>
        <input 
          v-model.lazy="form.symbol" 
          @change="reconnectWs"
          type="text" 
          class="mono-input symbol-input" 
        />
      </div>
      
      <div class="input-group">
        <label>时间 (Time)</label>
        <div class="input-with-action">
          <input v-model="form.time" type="datetime-local" class="mono-input" />
          <button @click="syncTime" class="mini-btn" title="同步当前时间">NOW</button>
        </div>
      </div>

      <div class="input-group">
        <label>价格 (Price)</label>
        <div class="price-control">
          <input v-model.number="form.price" type="number" step="0.1" class="mono-input price-input" />
          <div class="price-shortcuts" v-if="isConnected">
            <button class="shortcut-btn ask-btn" @click="fillPrice(marketData.a)" title="填入卖一价(做多对手价)">
              卖:{{ formatSmallPrice(marketData.a) }}
            </button>
            <button class="shortcut-btn bid-btn" @click="fillPrice(marketData.b)" title="填入买一价(做空对手价)">
              买:{{ formatSmallPrice(marketData.b) }}
            </button>
          </div>
        </div>
      </div>

      <div class="input-group">
        <label>手数 (Amt)</label>
        <input v-model.number="form.amount" type="number" min="1" class="mono-input amount-input" />
      </div>
      
      <div class="actions">
        <button @click="executeTrade('buy')" class="btn btn-buy">买入 (Long)</button>
        <button @click="executeTrade('sell')" class="btn btn-sell">卖出 (Short)</button>
      </div>
    </div>

    <div class="status-bar" :class="{ 'has-position': currentPosition.amount !== 0 }">
      <div class="status-item">
        <span class="label">POS:</span>
        <span class="value" :class="currentPosition.direction">
          {{ currentPosition.amount === 0 ? 'FLAT' : (currentPosition.direction === 'long' ? 'LONG' : 'SHORT') }} 
          {{ currentPosition.amount > 0 ? 'x' + currentPosition.amount : '' }}
        </span>
      </div>
      <div class="status-item" v-if="currentPosition.amount > 0">
        <span class="label">AVG:</span>
        <span class="value">{{ formatPrice(currentPosition.avgPrice) }}</span>
      </div>
      <div class="status-item" v-if="currentPosition.amount > 0 && marketData.a">
        <span class="label">UPNL:</span>
        <span class="value" :class="unrealizedPnl >= 0 ? 'red' : 'green'">
          {{ unrealizedPnl > 0 ? '+' : '' }}{{ unrealizedPnl }}
        </span>
      </div>
    </div>

    <div class="table-container">
      <div class="table-header-title">SETTLEMENT HISTORY</div>
      <table class="classic-table">
        <thead>
          <tr>
            <th>CODE</th>
            <th>DATE</th>
            <th>TIME</th>
            <th>SIDE</th>
            <th>OPEN</th>
            <th>CLOSE</th>
            <th>VOL</th>
            <th>TYPE</th>
            <th>P&L</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in history" :key="index">
            <td>{{ row.symbol.toUpperCase() }}</td>
            <td>{{ row.date }}</td>
            <td>{{ row.time }}</td>
            <td :class="row.side === 'buy' ? 'red' : 'green'">
              {{ row.side === 'buy' ? 'B' : 'S' }}
            </td>
            <td>{{ formatPrice(row.openPrice) }}</td>
            <td>{{ formatPrice(row.closePrice) }}</td>
            <td>{{ row.amount }}</td>
            <td>CLS</td>
            <td :class="row.pnl >= 0 ? 'red' : 'green'">{{ row.pnl.toFixed(2) }}</td>
            <td class="order-id">{{ row.id }}</td>
          </tr>
          <tr class="total-row" v-if="history.length > 0">
            <td colspan="8" style="text-align: right;">NET P&L:</td>
            <td :class="totalPnl >= 0 ? 'red' : 'green'" style="font-weight: bold;">{{ totalPnl }}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, watch } from 'vue';

// --- 配置与状态 ---
const form = reactive({
  symbol: 'btcusdt', // 默认币对，注意 Binance WS 需要小写
  time: '',
  price: 0,
  amount: 1
});

// 行情数据 (BookTicker)
const marketData = reactive({
  u: 0, // updateId
  s: '', // symbol
  b: 0, // best bid price
  B: 0, // best bid qty
  a: 0, // best ask price
  A: 0  // best ask qty
});

const isConnected = ref(false);
let ws = null;

// --- WebSocket 逻辑 ---
const initWS = () => {
  if (ws) ws.close();
  
  const symbol = form.symbol.toLowerCase();
  // 使用 Binance BookTicker Stream (轻量，推送最优买卖价)
  const url = `wss://stream.binance.com:9443/ws/${symbol}@bookTicker`;
  
  ws = new WebSocket(url);

  ws.onopen = () => { isConnected.value = true; };
  ws.onclose = () => { isConnected.value = false; };
  ws.onerror = (err) => { console.error('WS Error:', err); isConnected.value = false; };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // 更新响应式对象
    marketData.s = data.s;
    marketData.b = parseFloat(data.b);
    marketData.a = parseFloat(data.a);
  };
};

const reconnectWs = () => {
  // 重置数据
  marketData.b = 0;
  marketData.a = 0;
  initWS();
};

const fillPrice = (price) => {
  if (!price) return;
  form.price = parseFloat(price);
  syncTime(); // 填价格的同时同步时间，提高效率
};

const syncTime = () => {
  // 格式化为 input type="datetime-local" 需要的格式: YYYY-MM-DDTHH:mm
  const now = new Date();
  // 注意：这里简单处理时区偏移，使其符合本地时间
  const offset = now.getTimezoneOffset() * 60000;
  const localIso = new Date(now - offset).toISOString().slice(0, 16);
  form.time = localIso;
};

// 生命周期
onMounted(() => {
  syncTime();
  initWS();
});

onUnmounted(() => {
  if (ws) ws.close();
});

// --- 交易核心逻辑 (保持不变，略作变量适配) ---

const currentPosition = reactive({
  direction: 'none', 
  amount: 0,
  avgPrice: 0,
  queue: [] 
});

const history = ref([]);

// 浮动盈亏计算 (Unrealized PnL)
const unrealizedPnl = computed(() => {
  if (currentPosition.amount === 0 || !marketData.b) return 0;
  const currentPrice = currentPosition.direction === 'long' ? marketData.b : marketData.a; // 多单看买价平，空单看卖价平
  let pnl = 0;
  if (currentPosition.direction === 'long') {
    pnl = (currentPrice - currentPosition.avgPrice) * currentPosition.amount;
  } else {
    pnl = (currentPosition.avgPrice - currentPrice) * currentPosition.amount;
  }
  return pnl.toFixed(2);
});

const executeTrade = (actionSide) => {
  if(!form.price) { alert("请输入价格"); return; }
  
  const tradePrice = form.price;
  const tradeAmount = form.amount;
  // 解析时间显示
  const displayTime = form.time.replace('T', ' ').slice(5); // 只取 MM-DD HH:mm
  const displayDate = form.time.slice(0, 10);
  
  const genId = () => 'SIM' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');

  if (currentPosition.direction === 'none') {
    openPosition(actionSide, tradePrice, tradeAmount, displayDate, displayTime);
  } else if (currentPosition.direction === (actionSide === 'buy' ? 'long' : 'short')) {
    openPosition(actionSide, tradePrice, tradeAmount, displayDate, displayTime);
  } else {
    closePosition(actionSide, tradePrice, tradeAmount, displayDate, displayTime, genId);
  }
};

const openPosition = (side, price, amount, date, time) => {
  const direction = side === 'buy' ? 'long' : 'short';
  for(let i=0; i<amount; i++) {
    currentPosition.queue.push({ price, date, time, symbol: form.symbol });
  }
  updatePositionSummary(direction);
};

const closePosition = (side, price, amount, date, time, genId) => {
  let remaining = amount;
  while (remaining > 0 && currentPosition.queue.length > 0) {
    const openOrder = currentPosition.queue.shift();
    let pnl = 0;
    if (currentPosition.direction === 'long') pnl = price - openOrder.price;
    else pnl = openOrder.price - price;

    history.value.push({
      symbol: openOrder.symbol,
      date: date,
      time: time,
      side: side,
      openPrice: openOrder.price,
      closePrice: price,
      amount: 1,
      pnl: pnl,
      id: genId()
    });
    remaining--;
  }
  updatePositionSummary(currentPosition.direction);
  if (remaining > 0) openPosition(side, price, remaining, date, time);
};

const updatePositionSummary = (oldDirection) => {
  const totalAmount = currentPosition.queue.length;
  if (totalAmount === 0) {
    currentPosition.direction = 'none';
    currentPosition.amount = 0;
    currentPosition.avgPrice = 0;
  } else {
    currentPosition.direction = oldDirection;
    currentPosition.amount = totalAmount;
    const totalCost = currentPosition.queue.reduce((sum, item) => sum + item.price, 0);
    currentPosition.avgPrice = totalCost / totalAmount;
  }
};

const totalPnl = computed(() => {
  return history.value.reduce((acc, cur) => acc + cur.pnl, 0).toFixed(2);
});

const formatPrice = (p) => Number(p).toFixed(2);
const formatSmallPrice = (p) => Number(p).toFixed(1); // 按钮上显示短一点

</script>

<style scoped>
/* 延续复古/专业风格 */
.trader-console {
  font-family: 'Courier New', Courier, monospace;
  max-width: 900px;
  margin: 20px auto;
  color: #111;
  background-color: #fcfcfc;
  border: 1px solid #aaa;
}

/* 顶部连接条 */
.connection-bar {
  background: #222;
  color: #fff;
  padding: 5px 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}
.conn-status { display: flex; align-items: center; gap: 8px; }
.indicator { width: 8px; height: 8px; border-radius: 50%; background: #555; }
.indicator.active { background: #0f0; box-shadow: 0 0 5px #0f0; }

.live-ticker { display: flex; gap: 15px; }
.ticker-symbol { font-weight: bold; color: #feeb7a; }
.ticker-price { cursor: pointer; padding: 2px 5px; border-radius: 2px; }
.ticker-price:hover { background: #444; }
.ticker-price.ask { color: #ff6666; } /* 卖单价格通常显示为红色 */
.ticker-price.bid { color: #66ff66; } /* 买单价格通常显示为绿色 */

/* 控制台 */
.control-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  padding: 20px;
  background: #eee;
  border-bottom: 2px solid #333;
  align-items: flex-end;
}
.input-group { display: flex; flex-direction: column; }
.input-group label { font-size: 11px; font-weight: bold; margin-bottom: 4px; letter-spacing: 1px; }

.mono-input { font-family: inherit; padding: 6px; border: 1px solid #888; background: #fff; font-size: 14px; outline: none; }
.mono-input:focus { border-color: #000; background: #ffffee; }

.symbol-input { width: 80px; text-transform: uppercase; font-weight: bold; }
.price-input { width: 120px; font-weight: bold; font-size: 16px; }
.amount-input { width: 60px; text-align: center; }

/* 价格控制区：包含输入框和快捷按钮 */
.price-control { display: flex; flex-direction: column; gap: 4px; }
.price-shortcuts { display: flex; gap: 5px; }
.shortcut-btn {
  font-family: inherit; font-size: 10px; padding: 2px 6px; cursor: pointer; border: 1px solid #999; background: #fff;
  flex: 1; text-align: center; white-space: nowrap;
}
.shortcut-btn:hover { background: #ddd; }
.ask-btn { color: #c00; border-color: #c00; }
.bid-btn { color: #060; border-color: #060; }

.input-with-action { display: flex; gap: 5px; }
.mini-btn { font-size: 10px; padding: 0 5px; cursor: pointer; background: #ddd; border: 1px solid #999; font-family: inherit;}

.actions { margin-left: auto; display: flex; gap: 10px; }
.btn { padding: 8px 20px; font-family: inherit; font-weight: bold; cursor: pointer; border: 2px solid #000; box-shadow: 2px 2px 0 #000; transition: transform 0.1s; }
.btn:active { transform: translate(2px, 2px); box-shadow: none; }
.btn-buy { background: #ffebeb; color: #a00; }
.btn-sell { background: #ebffeb; color: #006400; }

/* 状态栏 */
.status-bar {
  padding: 8px 15px;
  background: #333;
  color: #bbb;
  display: flex;
  gap: 20px;
  font-size: 13px;
  border-bottom: 1px solid #000;
}
.status-bar.has-position { background: #222; color: #fff; }
.status-bar .value { font-weight: bold; margin-left: 5px; color: #fff; }
.status-bar .value.long { color: #ff6666; }
.status-bar .value.short { color: #66ff66; }
.status-bar .red { color: #ff6666; }
.status-bar .green { color: #66ff66; }

/* 表格 */
.table-container { background: #fff; min-height: 300px; }
.table-header-title { background: #000; color: #fff; padding: 5px; font-size: 12px; font-weight: bold; letter-spacing: 2px; text-align: center; }

.classic-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.classic-table th { border-bottom: 2px solid #000; padding: 6px; text-align: right; font-weight: bold; color: #000; }
.classic-table td { border-right: 1px dotted #ccc; padding: 6px; text-align: right; color: #333; }
.classic-table td:first-child { text-align: left; font-weight: bold; }
.classic-table tr:nth-child(even) { background-color: #f5f5f5; }

.red { color: #d00000; font-weight: bold; }
.green { color: #008000; font-weight: bold; }
.order-id { color: #999; font-size: 10px; font-family: sans-serif; }
.total-row { border-top: 2px solid #000; background: #fff !important; font-size: 14px; }
</style>