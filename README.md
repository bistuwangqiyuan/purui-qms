# 普瑞 QMS · 换流阀质量管理系统

面向**中电普瑞电力工程有限公司**（南瑞集团全资子公司，主营高压/特高压直流换流阀及水冷系统）换流阀产品的**全流程质量管理系统（QMS）**，按《生产制造企业质量管理系统（QMS）规划方案 V1.0》开发。

- 线上系统：https://purui-qms.netlify.app
- 覆盖：主数据与检验标准电子化 → 来料/过程/出货检验（IQC/IPQC/OQC）→ 预警通知 → 不合格品 MRB → 客诉 → CAPA/8D → 评审（LPA）→ 周期试验 → 量具 → 质量成本 → 任务/消息 → 全景追溯 → 质量驾驶舱与 SPC 报表
- 流程符合 GB/T 19001-2016（ISO 9001:2015）8.4/8.7/7.5 条要求

## 演示账号

| 账号类型 | 用户名 | 密码 | 可见范围 |
| ---- | ---- | ---- | ---- |
| 检验员 | `inspector` | `Insp@123` | 报检登记、检验录入、全部台账 |
| 质量工程师 | `qe` | `Qe@123456` | 审核处置、NCR/客诉/CAPA/评审等全部质量业务 |
| 管理员 | `admin` | `Admin@123` | 全部功能 + 用户管理 |
| 供应商用户 | `supplier1` | `Sup@12345` | 仅本供应商批次、共享的不合格品通报、被指派的整改 |
| 客户用户 | `customer1` | `Cus@12345` | 仅本客户的投诉登记与跟踪 |

> 首次启动自动播种演示账号与带"演示"标记的示例数据（固定随机种子，`netlify/functions/seed-data.ts`）。**正式使用前请重置全部演示账号密码。**

## 规划方案功能对照表（实事求是逐条声明）

| # | 方案模块 | 实现状态 | 说明 |
| - | ---- | ---- | ---- |
| 1 | 报表版（报表订阅） | ✅ 已实现 | 工作台"订阅报表"自选卡片（浏览器本地保存偏好） |
| 2 | 工作台（我的任务） | ✅ 已实现 | 待检/待审/整改/评审/试验/校准/客诉/不合格品动态聚合 |
| 3 | 系统管理 | ✅ 部分 | 用户管理（内部/供应商/客户三类）；组织架构、可视化审批流设计器未实现（以"合格批免审批"开关替代） |
| 4 | 主数据 | ✅ 已实现 | 计量单位/物料/供应商/客户/缺陷严重度评分，CSV 导入导出；域（多车间隔离）未实现，当前单域 |
| 5 | 检验规则 | ✅ 已实现 | 检验方法/条目/缺陷库/特殊特性/检验类型/跳检规则/三种抽样（AQL GB/T 2828.1、固定、百分比）/物料检验标准电子化（公差+预警值） |
| 6 | 来料管控 IQC | ✅ 已实现 | 报检单四色状态、自动关联标准、合格批免审批设置、超预警/超公差站内通知、检验报表；ERP 集成以 CSV+REST API 预留 |
| 7 | 过程管控 IPQC | ✅ 已实现 | 首检/巡检/末检/自检类型、巡检计划（到期自动生成任务+通知）；MES 集成未实现 |
| 8 | 出货管控 OQC | ✅ 已实现 | 关联客户与发货单号，流程同 IQC |
| 9 | 不合格品处理 | ✅ 已实现 | 拒收批自动登记、手动登记、5 种处置方式、质量成本联动、供应商可见共享、发起 CAPA |
| 10 | 客户投诉 | ✅ 已实现 | 客户用户可自助登记；处理、关联 NCR/CAPA(SCAR)、成本、关闭 |
| 11 | 问题发现 | ✅ 已实现 | 手动/评审/LPA 来源，处理并转 CAR |
| 12 | 评审管理 | ✅ 已实现 | 清单（权重/必过项）、计划、0-10 评分、加权总分、雷达图、发现自动登记问题、直接发起 CAR |
| 13 | 纠正预防 CAPA | ✅ 已实现 | CAR/SCAR、D1-D8 结构化字段、状态机（关闭前强制 D4/D5）、8D 报告打印、供应商在线填写 |
| 14 | 质量成本 | ✅ 已实现 | 费用类型树、登记（自动关联 NCR/客诉）、构成分析 |
| 15 | 项目管理 | ⛔ 未实现 | 与质量业务耦合弱，建议使用专业项目管理工具；接口层可扩展 |
| 16 | 量具管理 | ✅ 部分 | 台账、校准周期、到期提醒、校准履历；三坐标等测量硬件对接不实现（需现场网关，Web 端无法直连仪器） |
| 17 | 任务管理 | ✅ 已实现 | 全局任务聚合、逾期标记；自定义任务模板未实现 |
| 18 | 移动 APP | 🔁 等效替代 | 响应式 PWA（manifest + 可安装 + 移动端导航 + 拍照上传），替代 Android 原生 APP |
| 19 | 全景追溯 | ✅ 已实现 | 按批次号/物料/供应商/PO/发货单一键穿透：批次→NCR→客诉→CAPA→成本 |

技术要求差异声明：方案第六章要求 CentOS/MongoDB/Docker 本地部署，与用户确定的 Netlify 云端部署目标冲突，实际采用 Netlify Functions + Netlify Blobs（强一致读写）。邮件/企业微信通知以站内消息中心等效替代。

## 技术架构

```
React 19 + TypeScript + Vite + ECharts（PWA，中文界面）
        │  REST /api/*（Bearer JWT，bcrypt 密码哈希）
Netlify Functions v2（netlify/functions/，按域拆分路由：masterdata/inspection/quality/system/collab）
        │
Netlify Blobs（qms-users / qms-batches / qms-attachments / qms-data，强一致）
```

- 抽样与 SPC 计算（`shared/sampling.ts`、`shared/spc.ts`）前后端共用，保证预览与落库一致
- 适用规模说明（如实告知）：Netlify Blobs 无查询索引，列表为全量拉取后内存过滤，适合演示与中小数据量（数千条级）；数据层已薄封装（`netlify/functions/lib.ts`），可平滑迁移数据库

## 本地开发

```bash
npm install
npx netlify dev --offline --port 7777
```

注意：若执行过 `npm run build`，请删除 `dist/_redirects` 后再启动本地开发（该文件仅用于生产 SPA 回退，本地会干扰 Vite 模块请求）。本地 Blobs 数据在 `.netlify/blobs-serve/`，删除即重置。

## 测试与可复现性验证（数据可证）

```bash
# 1) GB/T 2828.1-2012 抽样方案独立复现（零依赖，9 个标准已知点断言 + OC 曲线）
python scripts/verify_sampling.py

# 2) SPC 统计独立复现（零依赖）：与 shared/spc.ts 完全相同的固定数据集，
#    Python 独立计算 Xbar-R 控制限（GB/T 4091 表2 系数）、Cp/Cpk/Pp/Ppk、PPM、柏拉图，
#    输出与系统 GET /api/spc/selftest 逐项一致
python scripts/verify_spc.py

# 3) 端到端全模块测试（100 项断言，本地与线上均可跑）
node scripts/e2e-test.mjs http://localhost:7777
node scripts/e2e-test.mjs https://purui-qms.netlify.app
```

## 部署

```bash
npm run build
npx netlify deploy --prod --no-build
```

Netlify 环境变量：`JWT_SECRET`（强随机字符串，必须设置）。

## 标准与数据依据（可查证）

| 依据 | 用途 |
| ---- | ---- |
| GB/T 19001-2016 / ISO 9001:2015 | 流程设计（8.4 外部提供控制、8.7 不合格输出控制、7.5 成文信息） |
| GB/T 2828.1-2012 / ISO 2859-1:1999 | AQL 抽样：表 1 字码（水平 II）、表 2-A 正常检验一次抽样（含箭头规则）；跳检规则借鉴其转移规则思想（企业简化实现，已在页面明示） |
| GB/T 4091-2001 / ISO 8258 | Xbar-R 控制图系数 A2/D3/D4/d2（表 2） |
| GB/T 20990.1-2020（MOD IEC 60700-1:2015） | 换流阀电气类检验项目上位依据 |
| T/CAPEC 18-2020 | 换流阀组部件清单（5.2/5.3 条）：预置 11 类物料与检验标准 |
| GB/T 15291、GB/T 17702、GB/T 30425、GB/T 5585.1、GB/T 1303、GB/T 1408.1 | 各组部件具体检验方法 |

- 国家标准原文见国家标准全文公开系统（openstd.samr.gov.cn）
- 公司背景来源：中电普瑞公开招聘简章（北理工/北大就业网存档）与中商情报网企业档案
- 检验模板限值为按公开标准编制的示例默认值，正式使用应按供货技术协议修订（系统内已声明，且支持在线修订）
- Cpk ≥ 1.33 判定阈值为行业通用要求（AIAG SPC 手册惯例）

## 图片来源与许可

| 文件 | 用途 | 来源 |
| ---- | ---- | ---- |
| `public/images/hero-transmission.jpg` | 登录页背景（高压输电铁塔） | [Unsplash photo-1473341304170-971dccb5ac1e](https://images.unsplash.com/photo-1473341304170-971dccb5ac1e)，Unsplash License 免费商用 |
| `public/images/standards-lab.jpg` | 标准页横幅（变电站变压器） | [Unsplash photo-1509390144018-eeaf65052242](https://images.unsplash.com/photo-1509390144018-eeaf65052242)，Unsplash License 免费商用 |

## 目录结构

```
├── netlify/functions/
│   ├── api.ts               # 入口路由（/api/*）+ 登录 + 用户管理
│   ├── lib.ts               # 存储/鉴权/消息/路由公共库
│   ├── seed-data.ts         # 演示数据播种（固定种子，可复核）
│   └── routes/              # masterdata / inspection / quality / system / collab
├── shared/                  # types / sampling(GB2828.1) / spc(GB4091) / masterdata
├── src/pages/               # 22 个业务页面（驾驶舱/SPC/追溯/检验/NCR/客诉/CAPA/评审/试验/量具/成本/任务/消息/主数据/标准…）
├── scripts/
│   ├── verify_sampling.py   # 抽样方案独立复现（零依赖）
│   ├── verify_spc.py        # SPC 统计独立复现（零依赖）
│   └── e2e-test.mjs         # 100 项端到端断言
└── public/                  # PWA manifest / 图标 / Unsplash 图片 / _redirects
```

## 免责声明

本系统为业务信息化工具，判定规则严格按公开国家标准实现并附独立复现脚本；正式质量判定应以企业受控文件为准。演示数据不代表任何真实供应商与真实供货质量。
