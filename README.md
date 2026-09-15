# EqualPath Web

面向 Kuala Lumpur 与 Selangor 家庭的无登录 childcare 搜索与照护准备网页。用户从本次接送或照护需求出发，查找附近机构、核对公开条件、比较候选项，并整理联系问题和照护清单。

[正式站点](https://equalpathcare.me/) · [Appwrite 预览](https://equalpath-web.appwrite.network/) · [受控演示](https://equalpathcare.me/?mode=demo) · [直接进入搜索](https://equalpathcare.me/#discover)

受控演示使用明确标注的虚构机构，用来展示符合、冲突、未知与完整费用规则。真实接口失败时，网站不会静默切换到演示数据。

## 两种搜索

| | Regular childcare | Short-term care |
| --- | --- | --- |
| 适用场景 | 日常、持续性的 childcare 选择 | 临时数小时、单日或短期照护 |
| 必填信息 | 接送地点 | 接送地点、日期、最晚接走时间、照护结束时间 |
| 可选信息 | 孩子年龄、机构接送偏好 | 孩子年龄、机构接送偏好 |
| 搜索范围 | 5 km 或 10 km；每页最多 20 家 | 固定 5 km；每页最多 10 家 |
| 费用展示 | 可比较的 MYR 月费；区域预算会标明 `Estimated` | 小时、单次、session、日费或完整规则算出的 visit total；不把月费换算成小时价 |

截至 2026-09-15，公开目录包含 3,137 家可用机构：3,036 家进入 regular childcare 搜索，101 家进入独立的 short-term coursework research collection。101 家中只有 21 个地点找到公开的短时服务证据；进入研究集合不代表该分店接受本次临时照护，也不代表当天有名额。

## 当前体验

1. 从五张 childcare 插画组成的首页画廊进入搜索，或直接打开 `/#discover`。
2. 搜索一般 OpenStreetMap 地点、主动获取当前位置，或在平面地图上拖动并确认 pickup point。
3. 选择 regular childcare 或 short-term care，以最少字段发起查询。
4. 查看附近机构的 care end、年龄范围、道路行驶时间、费用、接送服务与注册来源。
5. 展开每项条件的 `supported`、`conflict`、`unknown` 或 `reference` 依据；已知冲突优先展示。
6. 最多比较三家机构，并按距离、费用、care-end time 或 pickup service 排序。缺少足够数据的排序会自动回到 Nearest first，并说明原因。
7. 生成与条件逐项对应的 enquiry questions，复制后由用户自行联系机构；公开电话、WhatsApp 和来源网页始终是用户主动打开的外部操作。
8. 在当前浏览器保存机构或搜索模板，稍后重新读取最新公开事实。模板不会自动恢复日期或孩子年龄。
9. 为选定机构生成 `Get ready for care` 清单，包括三段 pickup plan、分组问题、packing list，以及可打印或下载的独立 HTML。

首次访问提供可跳过、可重播的引导；示例输入只在受控演示中运行，结束后会恢复用户原来的搜索状态。界面支持键盘操作、reduced motion、响应式布局以及移动端精简地图卡片。

## 搜索与证据规则

- 服务范围只包含 Kuala Lumpur 与 Selangor；服务器会重新校验位置，Putrajaya 不会被归入 Selangor。
- 分页成员先按直线距离选出，再在当前页内把已知冲突排到后面并应用用户选择的排序。界面不把直线距离冒充道路距离。
- 道路时间来自 OSRM 路由估算，不包含实时交通、交接耗时或名额信息。
- 推荐优先使用有公开电话或明确 WhatsApp 的、无已知冲突的机构，但不会因此把更远机构换进当前最近一页，也不会在界面伪造“已联系”。
- 费用保留原始计费周期、币种、范围、额外费用和来源。缺失、不兼容或不可比较的数据保持未知。
- JKM / KPM 图标只说明记录或目录代码的来源；它们不证明实时营业、服务质量、可用名额或本次接收。
- 营业时间可用于 care-end 检查，但不等于临时照护时段。具体 care schedule、日期例外与来源冲突优先，并继续要求用户确认。
- 公开 listing、programme 或短时服务描述都不能证明当天 capacity、最终价格、pickup coverage 或 provider agreement。

## 隐私与产品边界

网站不要求账号，不收集孩子姓名、出生日期、健康信息或家庭关系。默认不会保存服务日期、照护时间、年龄、搜索结果或联系结果。

用户明确保存的机构和模板只存于当前浏览器，并按 live / demo 分开；另外只保留最近一次地图中心、缩放和已确认的 pickup point。没有云端同步，也不能自动跨设备恢复。

当前范围覆盖需求文档的 Epics 1–5：发现、条件检查、比较与联系准备、浏览器本地复用，以及照护交接准备。以下能力未实现：

- 实时 vacancy 或 provider acceptance
- 自动联系、消息发送或联系结果追踪
- 预订、付款、交通 marketplace 或 pickup 授权
- 用户账号、儿童档案或工作日历导入
- 家长评论浏览、共享 contingency card 与 rehearsal

## 技术结构

| 层 | 实现 |
| --- | --- |
| 前端 | React 19、Vite 6、MapLibre GL、Three.js |
| 地图与地点 | OpenFreeMap / OpenMapTiles、OpenStreetMap、Photon |
| 路线 | OSRM road-time estimates |
| 公共查询 | Appwrite `web-provider-query`，匿名、只读、无 API key |
| 本地状态 | Browser local storage；live / demo 隔离 |
| 验证 | Node test runner、Playwright、production bundle checks |

`web-provider-query` 只提供 `health`、`places`、`reverse`、`nearby`、`search`、`details` 和 `compare`。它不包含发布、写入、预订或消息动作，也不读取旧 iOS planner 的 owner 数据。

## 本地运行

需要 Node.js 22.12 或更高版本。

```sh
git clone https://github.com/Cheolhwi/equalpath-web.git
cd equalpath-web
npm ci
npm run dev
```

开发服务器运行于 [http://127.0.0.1:4179/](http://127.0.0.1:4179/)。默认前端直接调用已经部署的公开 Appwrite Function；如需显式使用仓库内的本地只读适配器：

```sh
VITE_EQUALPATH_API_URL=/api npm run dev
```

常用检查：

```sh
npm test
npm run build
npm run preview

# 完整的本地 release 检查；不会部署 Function
npm run release

# 首次运行浏览器测试前安装 Chromium
npx playwright install chromium
npm run test:browser
```

只有显式运行 `node scripts/deploy-api.mjs --deploy` 才会修改线上 Function；这不是普通开发或 CI 的一部分。

## 目录

- `src/`：React 页面、首页 3D 场景、地图、比较、问题、收藏与照护准备界面。
- `shared/`：请求规范、条件判断、费用/时间展示、保存与导出规则；前后端及测试共享。
- `server/`：匿名只读查询、地区校验、证据 overlay、地点搜索与路线估算。
- `server/data/`：版本化边界、来源索引与已审核补充数据；不包含用户资料。
- `scripts/`：build 检查、只读线上验证、数据采集/准备，以及显式授权后使用的发布脚本。
- `tests/`：领域、数据完整性、隐私边界、排序、地图、保存、准备与浏览器 journey 测试。
- `evidence/`：各轮技术、视觉与浏览器验收记录。

## 文档

- [Phase 0–3 验收](docs/PHASE0_3_VERIFICATION.md)
- [Phase 4–5：收藏、模板与照护准备](docs/PHASE4_5_VERIFICATION.md)
- [Regular / short-term care 分流与验证](docs/CARE_TYPES_2026_09_15.md)
- [临时照护证据规则](docs/TEMPORARY_CARE_2026_09_15.md)
- [短时照护扩展与限制](docs/SHORT_CARE_DEEPER_2026_09_15.md)
- [短时照护研究范围与地点清单](docs/SHORT_CARE_RESEARCH_2026_09_15.md) / [locations](docs/SHORT_CARE_LOCATIONS_2026_09_15.md)
- [接口与证据 contract](docs/API_CONTRACT.md)
- [完整 acceptance-criteria 台账](docs/AC_LEDGER.md)
- [部署设计与早期发布记录](docs/DEPLOYMENT.md)

需求基线为 `EqualPath_WebApp_Epics_User_Stories_DOD.docx` Revision 2.1：共 46 个 stories、114 条 acceptance criteria。当前 Epics 1–5 对应 28 个 stories、66 条 acceptance criteria；实现检查与真实数据的发布/充分性门槛分别记录，不能把功能已实现等同于机构事实已被确认。

首页复用了 RhineLabUI 的许可场景与模型；来源和许可见 [`src/vendor/rhine/UPSTREAM.md`](src/vendor/rhine/UPSTREAM.md) 与 [`src/vendor/rhine/LICENSE`](src/vendor/rhine/LICENSE)。地图与边界数据的归属会在运行界面及相应文档中保留。
