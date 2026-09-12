# EqualPath Web — 第一轮（阶段 0–3）

新版无登录网页：填写本次照护需求 → 查找机构 → 检查条件 → 比较 → 准备联系。另已加入用户主动授权的当前位置获取。

首页提供 RhineLab 风格的模糊地图入口。点击进入后，以约 0.4 秒的轻微地图移动直接显示搜索主界面，没有中间过场；支持减少动态效果以及返回首页后保留本次需求。直接打开 `/#discover` 可进入搜索。[首页与转场验收](design-qa.md)。

- [本地预览](http://127.0.0.1:4179/)
- [Appwrite 线上预览](https://equalpath-web.appwrite.network/)、[正式域名](https://equalpathcare.me/)、[独立仓库](https://github.com/Cheolhwi/equalpath-web)、[发布说明与域名状态](docs/DEPLOYMENT.md)
- [受控演示](http://127.0.0.1:4179/?mode=demo)：明确标明的虚构机构，用于试验符合、冲突、未知和完整费用规则。
- [验收记录](docs/PHASE0_3_VERIFICATION.md)、[完整 AC 台账](docs/AC_LEDGER.md)、[接口与资源](docs/API_CONTRACT.md)

需求依据 `EqualPath_WebApp_Epics_User_Stories_DOD.docx` Revision 2；可读提取版保留在 `docs/`：46 个故事、114 条 AC。本轮 Epics 1–3 为 18 个故事、43 条 AC。功能交付与真实数据发布门槛分开记录，不能把 43 条的实现等同于全部正式验收通过。

## 启动

要求 Node.js 22.12+。克隆仓库后按锁文件安装依赖；GitHub Actions 和 Appwrite 在干净环境中运行相同检查。

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

默认前端直接调用现有 Appwrite 项目中已部署的 `web-provider-query`。不需要 API key、父母账号或登录。`VITE_EQUALPATH_API_URL=/api npm run dev` 可显式使用本机查询适配器；不会在云端失败时悄悄切换示例。

## 代码位置

- `src/`：React 页面、平面地图、比较、询问清单、定位与样式。
- `shared/`：需求定义、年龄区间、时间/接送/费用检查；服务端与测试共享。
- `server/`：只读 Appwrite 查询、地区检查、证据来源、受控样例。
- `server/data/`：固定版本的地区边界和分支证据索引；不是用户资料。
- `scripts/deploy-api.mjs`：运维使用的新版查询 Function 部署脚本，依赖本机相邻 `appwrite-backend` 的授权 CLI；不在网页 CI 中执行。
- `scripts/verify-cloud.mjs`：匿名云端接口检查。
- `scripts/qa-server.mjs`：本机故障测试，不访问 Appwrite。
- `evidence/`：本轮技术及浏览器验收证据。

原型保留于 `../design-prototypes/rhine-map/`；旧 iOS 代码与业务资源未迁入新版。

## 本轮行为

公共机构名搜索、地图选点、主动获取当前位置；同日时间校验；年龄和接送偏好可不填；列表地图联动；最多三家比较；费用保持原口径；按当前需求生成、去重、调整、复制问题；有来源的 `tel:` 与来源页链接。页面没有自动发消息、预订、电话结果追踪或永久需求存储。

定位只在主动点击后启动。先等待 10 秒，暂时不可用或超时后增加一次最多 30 秒的高精度尝试；拒绝权限时不重复请求。取得首个位置、取消、改为手动输入 / 地图选点或离开表单都会清除短期定位订阅。成功显示精度与用途提示，定位失败保留原输入和重试入口；发起查询后仍由服务端验证 KL / Selangor。实际设备权限和定位精度取决于浏览器与系统。

地图使用 OpenFreeMap / OpenMapTiles 的 OpenStreetMap 数据，保留归属链接。行政边界来自 geoBoundaries 的 OSM 派生 2017 数据（ODbL），不是现行官方测绘边界。

## 后续边界

本轮未实现阶段 4–8 的收藏、模板、交接材料、评论浏览、共享卡和演练。已存在的评论表没有被接入本轮询问清单。多数真实接送政策与一次性费用仍需补证；已知营业时间不等同于临时照护窗口。
