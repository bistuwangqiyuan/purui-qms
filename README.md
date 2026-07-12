# 普瑞 QMS · 换流阀组部件来料检验质量管理系统

面向**中电普瑞电力工程有限公司**（南瑞集团全资子公司，主营高压/特高压直流换流阀及水冷系统）换流阀产品组部件**来料检验（IQC）**业务的质量管理系统。

覆盖"来料登记 → 抽样方案自动检索 → 检验执行与结果上传 → 质量工程师审核 → 不合格品 MRB 处置 → 台账与统计报表"全流程闭环，符合 GB/T 19001-2016（ISO 9001:2015）第 8.4 条（外部提供的过程、产品和服务的控制）与第 8.7 条（不合格输出的控制）的管理要求。

## 功能一览

| 模块 | 说明 | 权限 |
| ---- | ---- | ---- |
| 登录与角色 | JWT 鉴权，bcrypt 密码哈希，三级角色职责分离 | 全员 |
| 工作台 | 批次 KPI、月度批合格率趋势、供应商批合格率、批次构成（ECharts） | 全员 |
| 来料登记 | 11 类换流阀组部件、自动生成批次号、**实时按 GB/T 2828.1-2012 检索抽样方案（字码/n/Ac/Re，含箭头规则）** | 检验员、管理员 |
| 检验执行 | 按组部件加载检验项目模板，定量项实测值录入（越限自动判不合格）、定性项不合格品数录入、检验照片上传、按 Ac/Re 自动批判定 | 检验员、管理员 |
| 审核处置 | 合格批确认接收；不合格批 MRB 处置（退货/全检挑选/让步接收，必填处置理由）；可退回重检；全程留痕 | 质量工程师、管理员 |
| 批次台账 | 搜索/状态筛选、批次详情、可打印检验报告、完整流转时间线 | 全员 |
| 标准与依据 | 全部引用标准、AQL 分级原则、检验模板、图片许可、可复现性声明 | 全员 |
| 用户管理 | 建用户、停用/启用、重置密码 | 管理员 |

## 演示账号

| 角色 | 用户名 | 密码 |
| ---- | ------ | ---- |
| 检验员 | `inspector` | `Insp@123` |
| 质量工程师 | `qe` | `Qe@123456` |
| 管理员 | `admin` | `Admin@123` |

> 系统首次启动自动播种演示账号与带"演示"标记的示例批次（固定随机种子生成，见
> `netlify/functions/seed-data.ts`），与真实业务数据严格区分。**正式使用前请用管理员
> 重置全部演示账号密码，并在 Netlify 环境变量中设置强随机 `JWT_SECRET`。**

## 技术架构

```
React 19 + TypeScript + Vite + ECharts   （前端 SPA，中文界面）
        │  REST（Bearer JWT）
Netlify Functions v2（netlify/functions/api.ts，路径 /api/*）
        │
Netlify Blobs（qms-users / qms-batches / qms-attachments 三个 Store）
```

- 抽样逻辑（`shared/sampling.ts`）与基础数据（`shared/masterdata.ts`）由前后端共用，
  保证"预览"与"落库"结果一致。
- 检验照片以 base64 上传（≤4 MB），存入 Netlify Blobs，UUID 作为访问凭据。

## 本地开发

```bash
npm install
npx netlify dev --offline --port 7777   # 前端 + Functions + 本地 Blobs 沙箱
```

打开 http://localhost:7777 即可。本地 Blobs 数据存于 `.netlify/blobs-serve/`，删除该目录可重置。

## 测试与可复现性验证

```bash
# 1) GB/T 2828.1-2012 抽样方案独立复现校验（仅 Python 标准库，零依赖）
python scripts/verify_sampling.py
#    - 输出三档 AQL 在典型批量下的完整方案表
#    - 对 9 个标准表 2-A 已知方案点断言校验（全部 PASS 才退出 0）
#    - 二项分布 + 超几何分布计算 OC 曲线，验证 p=AQL 处接收概率约 89%~98%

# 2) 端到端 API 测试（33 项断言：鉴权/越权/抽样/判定/MRB/统计/用户管理）
node scripts/e2e-test.mjs http://localhost:7777
```

> 注意：对生产环境运行 e2e 会留下"自动化测试供应商"批次与 `e2e_*` 用户。
> 递增 `netlify/functions/api.ts` 中的 `SEED_VERSION` 并重新部署即可自动清理。

## 部署

```bash
npm run build                      # tsc 类型检查 + vite 构建
npx netlify deploy --prod          # 部署静态资源 + Functions（Blobs 自动可用）
```

在 Netlify 站点设置中配置环境变量 `JWT_SECRET`（强随机字符串）。

## 标准与数据依据（实事求是、可查证）

| 依据 | 在本系统中的用途 |
| ---- | ---- |
| GB/T 19001-2016 / ISO 9001:2015《质量管理体系 要求》 | 流程设计依据（8.4 来料控制、8.7 不合格输出控制、7.5 成文信息） |
| GB/T 2828.1-2012 / ISO 2859-1:1999《计数抽样检验程序 第 1 部分》 | 抽样方案唯一检索依据：表 1（样本量字码，一般检验水平 II）、表 2-A（正常检验一次抽样，含箭头规则） |
| GB/T 20990.1-2020（MOD IEC 60700-1:2015）《高压直流输电晶闸管阀 第 1 部分：电气试验》 | 电气类检验项目上位依据 |
| T/CAPEC 18-2020《电力工业 晶闸管换流阀制造监理技术要求》 | 组部件清单依据（5.2 原材料及组部件检查、5.3 制造组装工序检查） |
| GB/T 15291《半导体器件 第 6 部分：晶闸管》 | 晶闸管 VDRM/IDRM/VTM/门极特性测试方法 |
| GB/T 17702《电力电子电容器》 | 阻尼电容器电容量/损耗/耐压 |
| GB/T 30425-2013《高压直流输电换流阀水冷却设备》 | 散热器、水冷管件水压试验 |
| GB/T 5585.1《电工用铜、铝及其合金母线》 | 母排尺寸与材质 |
| GB/T 1303、GB/T 1408.1 | 绝缘件层压板、电气强度试验 |

- 国家标准原文可在 **国家标准全文公开系统**（openstd.samr.gov.cn）免费查阅；团体标准见全国团体标准信息平台（www.ttbz.org.cn）。
- 公司背景信息来源：中电普瑞公开招聘简章（北京理工大学就业信息网、北京大学学生就业指导服务中心存档 PDF）及中商情报网企业档案。
- AQL 分级（关键件 0.65 / 重要件 1.0 / 一般件 2.5）属企业质量策划决策（GB/T 2828.1-2012 第 5 章规定 AQL 由负责部门指定），为行业常用实践取值；正式投产前应由质量部门按供货技术协议评审确认。
- 检验模板中的具体限值（如 VDRM ≥ 8500 V、电容量偏差 ±5%）为按公开标准与行业通用规格编制的**示例默认值**，正式使用时应按对应供货技术协议/图纸修订。

## 图片来源与许可

| 文件 | 用途 | 来源 |
| ---- | ---- | ---- |
| `public/images/hero-transmission.jpg` | 登录页背景（高压输电铁塔，日落） | [Unsplash photo-1473341304170-971dccb5ac1e](https://images.unsplash.com/photo-1473341304170-971dccb5ac1e)，Unsplash License |
| `public/images/standards-lab.jpg` | 标准页横幅（变电站电力变压器） | [Unsplash photo-1509390144018-eeaf65052242](https://images.unsplash.com/photo-1509390144018-eeaf65052242)，Unsplash License |

[Unsplash License](https://unsplash.com/license) 允许免费用于商业与非商业用途，无需许可与署名。

## 目录结构

```
├── netlify/functions/     # Functions v2：api.ts（全部 REST 路由）、seed-data.ts（演示数据）
├── shared/                # 前后端共用：types.ts、sampling.ts（GB/T 2828.1）、masterdata.ts（11 类组部件）
├── src/                   # React SPA：pages/（登录/工作台/登记/详情/台账/标准/用户）、components/
├── scripts/
│   ├── verify_sampling.py # 抽样方案独立复现与 OC 曲线（零依赖）
│   └── e2e-test.mjs       # 端到端 API 测试（33 项断言）
├── public/images/         # Unsplash 免费商用图片
└── netlify.toml           # 构建与 Functions 配置
```

## 免责声明

本系统为业务信息化工具，抽样方案与判定规则严格按公开国家标准实现并附独立复现脚本；
但正式质量判定应以企业受控文件（检验规程、技术协议、图纸）为准。系统演示数据不代表
任何真实供应商与真实供货质量。
