# 免费云部署方案评估

> 基于 tg-monitor-wallet 项目特性的免费云服务部署方案分析

## 项目资源需求概览

| 需求项 | 详情 |
|--------|------|
| **运行模式** | Worker 进程（无 HTTP 服务），Telegram Bot 长轮询 |
| **运行时** | Node.js 18+ (TypeScript 编译后) |
| **内存** | ~50-100 MB（最低 256 MB 推荐） |
| **CPU** | 极低（每 60 秒轮询一次区块链 API） |
| **存储** | SQLite 数据库，约 1-5 MB / 1000 用户 |
| **网络** | 出站 HTTPS（Telegram API + 区块链 API），无需入站端口 |
| **运行要求** | **必须 7x24 常驻运行**，不能休眠/冷启动 |
| **容器化** | 已有 Dockerfile（多阶段构建，alpine 镜像） |

---

## 方案对比总览

| 方案 | 费用 | 7x24 运行 | 持久存储 | 部署难度 | 推荐度 |
|------|------|-----------|----------|----------|--------|
| **Oracle Cloud 永久免费 ARM** | 完全免费 | ✅ | ✅ 200GB | 中等 | ⭐⭐⭐⭐⭐ |
| **Fly.io（旧版 Legacy 计划）** | 免费/低费 | ✅ | ✅ 卷存储 | 低 | ⭐⭐⭐⭐ |
| **Render（Web Service 免费层）** | 免费 | ⚠️ 需 keep-alive | ⚠️ 无持久磁盘 | 低 | ⭐⭐⭐ |
| **Koyeb** | 免费 | ⚠️ 可能休眠 | ❌ | 低 | ⭐⭐⭐ |
| **Railway（Hobby）** | ~$5/月 | ✅ | ✅ | 极低 | ⭐⭐⭐ |
| **Fly.io（新用户 Hobby）** | ~$5/月 | ✅ | ✅ | 低 | ⭐⭐⭐ |
| **Cloudflare Workers** | 免费 | N/A | N/A | 高 | ⭐⭐ |

---

## 方案详细分析

### 1. Oracle Cloud 永久免费 ARM 实例 —— 最佳免费方案 ⭐⭐⭐⭐⭐

**概述：** Oracle Cloud 的 Always Free Tier 提供真正永久免费的 ARM (Ampere A1) 虚拟机，资源远超本项目需求。

**免费资源：**
- **计算：** 最多 4 OCPU + 24 GB 内存（可拆分为 1-2 台 VM）
- **存储：** 200 GB 块存储
- **网络：** 10 TB/月出站流量，1 个保留公网 IP
- **数据库：** 2 个 Always Free Oracle 自治数据库（可选）

**部署方式：**
```bash
# 在 Oracle Cloud ARM 实例上 (Ubuntu 22.04)
# 1. 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 克隆项目并构建
git clone <repo-url> && cd tg-monitor-wallet
npm ci && npm run build

# 3. 使用 systemd 或 pm2 守护进程运行
npm install -g pm2
pm2 start dist/index.js --name wallet-bot
pm2 save && pm2 startup
```

或使用 Docker：
```bash
sudo apt-get install docker.io
docker build -t wallet-bot .
docker run -d --restart=always \
  -v wallet_data:/data \
  --env-file .env \
  wallet-bot
```

**优点：**
- 完全免费，永不过期
- 资源极其充裕（4核24G 远超需求）
- 全权控制服务器，可运行任何服务
- 支持 Docker，部署灵活

**缺点：**
- 注册需信用卡验证（不扣费）
- 热门区域可能遇到 "Out of Host Capacity" 需多次尝试
- 需自行管理服务器（系统更新、安全配置等）
- ARM 架构，需确保依赖兼容（Node.js 已完全支持 ARM64）

**适用场景：** 长期稳定运行，不想花一分钱的首选方案。

---

### 2. Fly.io —— 当前项目已配置 ⭐⭐⭐⭐

**概述：** 项目已有 `fly.toml` 配置文件，Fly.io 是容器化部署的优秀平台。

**费用情况（2026 年）：**
- **新用户：** 仅 7 天免费试用，之后需付费。Hobby 计划 ~$5/月起
- **Legacy 旧用户：** 保留免费额度（3 台共享 VM + 160GB 流量）
- **注意：** 2026 年 1 月起卷快照开始收费；IPv4 独立地址 $2/月

**部署方式：**
```bash
# 已有配置，直接部署
fly auth login
fly launch         # 首次
fly deploy         # 后续更新
fly volumes create wallet_data --region hkg --size 1  # 创建持久卷
```

**优点：**
- 项目已配置好，部署最快
- 容器化部署，一键更新
- 支持持久化卷存储（SQLite 可靠运行）
- 全球区域选择（已配置 hkg 香港节点）

**缺点：**
- 新用户不再有永久免费层
- 持久卷即使 VM 停止也会计费
- 需绑定信用卡

**适用场景：** 想要最简单部署体验，愿意支付少量费用。

---

### 3. Render（Web Service 免费层）⭐⭐⭐

**概述：** Render 提供免费 Web Service，但 Background Worker 需付费。需要将 Bot 包装为 Web Service。

**免费资源：**
- 750 小时/月实例时间（够全月运行）
- 100 GB/月出站带宽
- 无持久磁盘存储

**关键限制：**
- ⚠️ **15 分钟无 HTTP 请求后休眠**，需 keep-alive 机制
- ⚠️ **Background Worker 不在免费计划内**
- ⚠️ **无持久磁盘**，SQLite 数据在重新部署时丢失

**改造要点：**
```typescript
// 需要添加一个最小 HTTP 服务器以使用 Web Service 类型
import http from 'http';
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
}).listen(process.env.PORT || 10000);

// 然后用外部 cron 服务每 5 分钟 ping 一次保持活跃
```

同时需要将 SQLite 替换为外部数据库（如 Render 免费 PostgreSQL 或 Supabase）。

**优点：**
- 有免费层，部署简单
- GitHub 集成，自动部署
- 提供免费 PostgreSQL（90 天）

**缺点：**
- 需要改造代码（添加 HTTP 服务 + keep-alive）
- 必须替换 SQLite 为外部数据库
- 休眠机制可能导致监控漏报
- PostgreSQL 免费只有 90 天

**适用场景：** 短期测试/演示，不追求 100% 可靠的监控。

---

### 4. Koyeb ⭐⭐⭐

**概述：** Koyeb 提供永久免费层（2 个 nano 服务），支持 Docker 部署。

**免费资源：**
- 2 个 nano 实例
- 无需信用卡
- 支持 Git 部署

**关键限制：**
- ⚠️ 空闲时可能休眠（scale-to-zero）
- 无持久磁盘存储
- nano 实例资源有限

**改造要点：** 与 Render 类似，需要添加 HTTP endpoint + keep-alive，以及替换 SQLite。

**优点：**
- 永久免费，无需信用卡
- 支持 Docker/GitHub 部署
- 全球边缘网络

**缺点：**
- 可能休眠，影响监控及时性
- 无持久存储，需外部数据库
- nano 实例资源较少

**适用场景：** 轻量级测试，低频监控场景。

---

### 5. Railway（Hobby $5/月）⭐⭐⭐

**概述：** Railway 部署体验极佳，但已无真正免费层。Hobby 计划 $5/月含 $5 额度。

**费用：**
- 试用：$5 一次性额度，30 天有效
- Hobby：$5/月（含 $5 使用额度，本项目一般不会超）

**优点：**
- 零配置部署，推送即上线
- 内置数据库支持
- 实时用量仪表盘
- 本项目 ~$2-3/月实际消耗，不会超出 $5 额度

**缺点：**
- 无永久免费层
- 试用仅 30 天

**适用场景：** 愿意花 $5/月换取极简部署体验。

---

### 6. Cloudflare Workers（需大幅改造）⭐⭐

**概述：** Cloudflare Workers 是 Serverless 平台，免费额度充裕，但需要将 Bot 从长轮询改为 Webhook 模式。

**免费资源：**
- 100,000 请求/天
- 10ms CPU 时间/请求
- Workers KV 存储

**改造要点（较大）：**
1. 将 grammy 从长轮询改为 Webhook 模式
2. 将 SQLite 替换为 Workers KV 或 D1
3. 将 node-cron 定时任务改为 Cron Triggers
4. 改造所有同步的 better-sqlite3 调用

**优点：**
- 免费额度充裕
- 全球边缘网络，延迟低
- 无冷启动问题

**缺点：**
- 需要大幅改造代码架构
- 运行时限制（CPU 时间、内存）
- 不适合长时间运行的任务
- Workers KV 最终一致性，不如 SQLite 可靠

**适用场景：** 如果未来想全面 Serverless 化可以考虑，但改造成本高。

---

## 最终推荐

### 不花钱方案

| 优先级 | 方案 | 理由 |
|--------|------|------|
| **首选** | Oracle Cloud ARM | 完全免费、资源充裕、全控制、永不过期 |
| **次选** | Fly.io Legacy | 如已有旧账号，零改造直接部署 |
| **备选** | Render/Koyeb | 需改造代码，存在休眠风险 |

### 低费用方案（$5/月以内）

| 优先级 | 方案 | 理由 |
|--------|------|------|
| **首选** | Fly.io Hobby | 项目已适配、一键部署、持久卷 |
| **次选** | Railway Hobby | 零配置、开发体验最佳 |

### 综合建议

**如果追求零成本：** 选择 **Oracle Cloud ARM**。注册后创建一台 1 OCPU / 1GB 的 ARM 实例即可，配合 Docker 或 pm2 部署，稳定运行无忧。

**如果追求部署便捷：** 继续使用 **Fly.io**，当前配置无需改动，每月费用预计 $3-5。

**不建议：** 在 Render/Koyeb 免费层部署生产环境的监控 Bot——休眠机制会导致余额变动通知严重延迟，违背了项目"实时监控"的核心价值。
