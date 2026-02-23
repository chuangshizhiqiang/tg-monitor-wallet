# TG Wallet Monitor Bot - 商业化架构设计方案

## 一、项目概述

Telegram 钱包监控机器人，支持多链钱包地址监控与交易查询，采用 Free/Subscription 双层用户模型实现商业化。

## 二、技术栈

| 组件 | 技术选型 | 理由 |
|------|---------|------|
| 运行时 | Node.js 18+ | 异步 I/O 适合监控场景 |
| 语言 | TypeScript | 类型安全，适合中大型项目 |
| TG Bot 框架 | grammy | 轻量、现代、TypeScript 优先 |
| 数据库 | SQLite (better-sqlite3) | 零部署成本，单机足够 |
| 定时任务 | node-cron | 轮询链上数据 |
| HTTP 客户端 | axios | 调用区块链 API |

## 三、支持的链与代币

| 链 | 基础代币 | 稳定币 | API 来源 |
|----|---------|--------|---------|
| Ethereum | ETH | USDT, USDC | Etherscan (免费 tier) |
| BSC | BNB | USDT, USDC | BscScan (免费 tier) |
| Tron | TRX | USDT | TronGrid (免费) |
| Bitcoin | BTC | - | Blockchain.info / Blockstream |

> 说明：暂不支持小额山寨代币，仅监控上述主流代币的转入/转出。

## 四、用户分层模型

### Free 用户
| 功能 | 限制 |
|------|------|
| 地址查询（最近交易） | 每天 5 次，每次返回最近 5 条 |
| 地址监控（余额变动通知） | 最多监控 1 个地址 |
| 支持链 | 全部支持 |

### Subscription 订阅用户
| 功能 | 限制 |
|------|------|
| 地址查询（最近交易） | 不限次数，每次返回最近 20 条 |
| 地址监控（余额变动通知） | 最多监控 100 个地址 |
| 支持链 | 全部支持 |
| 优先通知 | 余额变动后优先推送 |

## 五、核心功能模块

### 5.1 Bot 命令设计

```
/start          - 启动机器人，注册用户
/help           - 帮助信息
/query <地址>   - 查询地址最近交易记录
/tx <地址> <hash> - 查询指定交易前后记录 (Free: 前后3笔, Sub: 前后10笔)
/watch <地址>   - 添加监控地址
/unwatch <地址> - 移除监控地址
/list           - 查看当前监控列表
/status         - 查看账户状态（等级、用量）
/subscribe      - 查看订阅方案 / 升级
```

### 5.1.1 Inline Keyboard 按钮操作

所有功能均可通过 Inline Keyboard 按钮操作：

```
┌─────────────────────────────────────────┐
│  🔍 查询地址  │  📋 查询交易(TX Hash)    │
│  👁 添加监控   │  ❌ 取消监控             │
│  📋 监控列表   │  👤 账户状态             │
│  👑 升级订阅   │  ❓ 帮助                 │
└─────────────────────────────────────────┘
```

按钮触发后进入会话模式，用户发送地址/hash即可完成操作，
同时支持链选择子菜单（Ethereum/BSC/Tron/Bitcoin）。

### 5.2 交易查询流程

```
用户发送地址 ──→ 自动识别链类型 ──→ 检查用户配额
                                        │
                               ┌────────┴────────┐
                               │ 配额充足         │ 配额用尽
                               ▼                  ▼
                          调用链上 API         返回限制提示
                               │              (引导订阅)
                               ▼
                          格式化交易记录
                               │
                               ▼
                          发送给用户
```

### 5.3 地址监控流程

```
用户 /watch <地址> ──→ 检查监控配额 ──→ 写入 DB
                                          │
        node-cron 每 60 秒轮询             │
              │                            │
              ▼                            │
    遍历所有监控地址 ◄─────────────────────┘
              │
              ▼
    调用链上 API 获取最新余额
              │
              ▼
    与 DB 中上次余额对比
              │
       ┌──────┴──────┐
       │ 有变动       │ 无变动
       ▼              ▼
  推送通知给用户    跳过
  更新 DB 余额
```

### 5.4 地址链类型自动识别

```
0x 开头 (42位)  ──→ 尝试 Ethereum，如无记录则尝试 BSC
T 开头 (34位)   ──→ Tron
1/3/bc1 开头    ──→ Bitcoin
```

## 六、数据库设计 (SQLite)

### users 表
```sql
CREATE TABLE users (
    telegram_id   INTEGER PRIMARY KEY,
    username      TEXT,
    tier          TEXT DEFAULT 'free',  -- 'free' | 'subscription'
    sub_expires   DATETIME,             -- 订阅到期时间
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### query_logs 表（用于 Free 用户限额统计）
```sql
CREATE TABLE query_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id   INTEGER,
    address       TEXT,
    chain         TEXT,
    queried_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);
```

### watch_addresses 表
```sql
CREATE TABLE watch_addresses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id   INTEGER,
    address       TEXT,
    chain         TEXT,
    label         TEXT,              -- 用户自定义标签
    last_balance  TEXT,              -- 上次已知余额 (字符串存储大数)
    last_tx_hash  TEXT,              -- 上次已知最新交易哈希
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id),
    UNIQUE(telegram_id, address)
);
```

## 七、项目目录结构

```
tg-monitor-wallet/
├── src/
│   ├── index.ts              # 入口：启动 Bot + 定时任务
│   ├── bot/
│   │   ├── commands.ts       # 命令处理器
│   │   ├── middleware.ts     # 用户注册 + 权限中间件
│   │   └── formatters.ts    # 消息格式化
│   ├── chains/
│   │   ├── types.ts          # 链通用接口定义
│   │   ├── ethereum.ts       # ETH + ERC20 查询
│   │   ├── bsc.ts            # BSC + BEP20 查询
│   │   ├── tron.ts           # TRX + TRC20 查询
│   │   ├── bitcoin.ts        # BTC 查询
│   │   └── detector.ts       # 地址链类型自动识别
│   ├── monitor/
│   │   └── watcher.ts        # 定时轮询 + 变动检测 + 通知
│   ├── db/
│   │   ├── index.ts          # 数据库初始化
│   │   └── queries.ts        # 数据库操作封装
│   └── config.ts             # 配置常量（限额、轮询间隔等）
├── package.json
├── tsconfig.json
└── .env.example
```

## 八、配置常量

```typescript
export const CONFIG = {
    // 用户限额
    FREE_DAILY_QUERIES: 5,        // Free 用户每日查询次数
    FREE_TX_LIMIT: 5,             // Free 用户每次返回交易条数
    FREE_WATCH_LIMIT: 1,          // Free 用户监控地址上限
    SUB_TX_LIMIT: 20,             // 订阅用户每次返回交易条数
    SUB_WATCH_LIMIT: 100,         // 订阅用户监控地址上限

    // 监控轮询
    POLL_INTERVAL_SECONDS: 60,    // 轮询间隔（秒）

    // 订阅价格（预留）
    SUB_MONTHLY_PRICE: 9.99,      // 月订阅价格 (USD)
};
```

## 九、通知消息模板示例

### 余额变动通知
```
🔔 余额变动提醒

📍 链: Ethereum
📬 地址: 0x1234...abcd
💰 变动: +1,500.00 USDT
📊 当前余额: 12,500.00 USDT
🕐 时间: 2026-02-23 14:30:00 UTC
🔗 交易: https://etherscan.io/tx/0x...

━━━━━━━━━━━━━━━━━━
```

### 交易查询结果
```
📋 最近交易记录

📍 链: Ethereum
📬 地址: 0x1234...abcd

1️⃣ 转入 +500.00 USDT
   从: 0xaaaa...bbbb
   时间: 2026-02-23 12:00

2️⃣ 转出 -200.00 ETH
   至: 0xcccc...dddd
   时间: 2026-02-22 18:30

... (共 5 条)

━━━━━━━━━━━━━━━━━━
剩余今日查询次数: 3/5
```

## 十、关键设计决策说明

1. **为什么用 SQLite？** 单机部署成本为零，对于初期商业化验证阶段足够，后续可平滑迁移到 PostgreSQL。

2. **为什么轮询而不是 WebSocket？** 免费 API 大多不支持 WebSocket 推送，且轮询实现简单可靠。60 秒间隔在免费 API 限额内可支撑大量地址。

3. **地址自动识别链类型** 减少用户操作步骤，提升体验。对于 0x 地址同时属于 ETH/BSC 的情况，默认按 Ethereum 查询，用户可通过命令指定链。

4. **订阅付费（预留）** 当前版本先通过 `/subscribe` 命令展示方案，实际开通由管理员手动操作。后续可接入 Stripe/TON Pay 等支付网关。

## 十一、后续扩展方向（不在本期实现）

- [ ] 接入支付网关（Stripe / TON Pay）自动开通订阅
- [ ] 支持 Solana 链
- [ ] 支持自定义代币监控
- [ ] 多语言支持 (i18n)
- [ ] Web Dashboard 管理后台
- [ ] 群组推送模式

---

**请审批以上方案，确认后我将开始实现。**
