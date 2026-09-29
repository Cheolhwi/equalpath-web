# Epic 6 搜索与推荐框架

可编辑图：[`EPIC6_RECOMMENDATION_FRAMEWORK.drawio`](./EPIC6_RECOMMENDATION_FRAMEWORK.drawio)

## 核心边界

EqualPath 的推荐不是独立的广告流，也不是一个把所有信息压成单一分数的排行榜。一次搜索分成两步：

1. **Eligibility hard gate**：先按 care type、地点/半径、年龄、日期、start/end、pickup 和冲突状态筛选当前可用结果。
2. **Personalised rerank**：只在通过硬门槛的结果中，结合用户选择的偏好、review 证据和 saved/compare/view 行为做轻量重排。

因此，review 只能回答“这家机构是否更符合你在意的主题”，不能把“有人评论过短时照护”解释成当前日期有空位。

## Review 分类

review 先进入一级主题，再进入二级偏好：

| 一级主题 | 二级偏好 |
| --- | --- |
| Temporary care | Flexible short care |
| Pickup | Smooth pickup |
| Late collection | Clear late pickup |
| Fees | Predictable fees |
| Communication | Responsive team |

只有同一分支、同一主题至少两条支持性 review 才能成为 `supported`。否则保持 `unknown`，不加分。provider listing、单条 review、总星级不能单独形成偏好证据。

## 当前重排逻辑

```text
eligible pool
  → proximity + known condition fit
  → history seed: saved > compared > viewed（按时间衰减）
  → provider similarity（只有有意义的 service / pickup / fee 事实参与）
  → selected review preferences（capped nudge ≤ 0.22）
  → keep explicit sort priority
  → ordered result page / map suggestions
```

偏好是温和的个性化信号，不会推翻显式的 `price`、`closing`、`pickup` 排序。未知证据为中性，不视为匹配。已知冲突排在无冲突结果之后；没有任何可用结果、全部结果都为灰色时才显示外部短时照护兜底。

## Cold start 与反馈回流

首次进入 live 地图前显示可跳过的偏好页，最多选三个 review-derived preferences。没有偏好和历史时，系统只使用距离与已知条件匹配；随后把首次偏好作为第一条个性化信号。用户的 saved、compare、view、hide 记录只保存在当前模式的浏览器本地，按 care type 隔离并衰减。清除本地缓存会删除偏好、历史和收藏，并回到 landing page。

## 读图方式

图中从左到右看：输入信号 → 证据/硬筛选 → 个性化重排 → 页面输出与反馈。红色路径是冲突/不可用路径；虚线是 cold start 的替代输入路径。周末 `care end = Not listed` 是一个明确的业务覆盖规则：周六或周日直接进入 conflict，不是 unknown。
