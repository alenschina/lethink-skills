# 验证与部署一致性清单（jsdom 断言、版本差分诊、挂载门控）

近月事故复盘沉淀。核心事实：**本地环境 ≠ 生产环境**——后端代码版本、库材料、公共包、运行时副本四层各自漂移；jsdom ≠ 浏览器。下面是固定差异表与分诊顺序，照单核对，不靠事故重新发现。

## jsdom 验证清单

加载与环境：

- 只 eval 本组件 `component.js`，勿整段 eval 页面 `$allJs`（会执行同页其他组件脚本，XHR 到假域名报错）——噪音用 `new VirtualConsole()` 静音（787/731）。
- 运行时加载**后端 `public/static/js/lethink-dynamic-runtime.js` 副本**：前端 `src/utils` 副本缺 `shouldHideEmptyDetailSublists` 等，空态行为假阴性（789）。
- 组件态须注入 `<meta name="lethink-site-id">`，否则运行时走静态预览零请求（747/731）。
- outside-only 不执行内联脚本：解析期改写脚本须 `querySelectorAll('script:not([type])')` 按序手动 eval（747/788）。
- jQuery `$(fn)` 走 Deferred 异步：eval 后 await ~80ms 再断言；`DOMContentLoaded` 后才可断言 js 覆盖结果（734/611）。
- jsdom 不应用媒体查询：`$.fx.off=true` + 预置 inline `none` 模拟 `@media` 隐藏初态（722）。
- jQuery `.trigger('click')` 不派发原生事件（运行时是 addEventListener）：用 `.get(0).click()`；anchor click spy 须记录后仍 `dispatchEvent`（647/772）。

断言规则：

- **可见性必须显式断言 `style.display` / `aria-hidden`**——class/节点数查不出内联 `display:none` 误杀（747 页签误杀就这样漏过）。
- **段断言必须限定组件根类或实例包裹 id**：同页头部导航的 `/search` 表单、公共 CSS、页脚都会让全页级断言误命中/误报（787 命中 623 表单；756 缺席断言须限 section；731 同根类名互相串卡）。发布链 CSS 作用域前缀会让同名类先出现，锚点选 body 专属类。
- `input.value` 赋值会同步污染 `defaultValue`（真实浏览器不会）——复位行为走行为级断言（764）。
- 服务端态断言（如"产物无 src"）须在 eval 组件 js **之前**检查（756）。
- 200ms 防双跑窗口：连续点击断言间隔须 >220ms（742/764）。
- 同页多组件：契约断言按 `component_id` 精确过滤请求（773：668 同挂掩盖假绿）；兄弟组件 HTML 用兄弟自己 unit_json 的 VAR_MAP（736/737）。
- `mock fetch` 的 GET 参数在 URL 不在 body；responses 计划键 = 0 基请求序且先 push 后取（742/764）。

## 「本地有效但用户说没生效」分诊顺序

按序排查，每步都有便宜的证据：

1. **查库资源特征串**：`SELECT content LIKE '%<新代码特征>%' FROM sys_component_resource WHERE component_id=<id> AND is_active=1` —— 旧 = 执行的还是旧 install.sql / 跑错库，重跑最新 install.sql。
2. **后端版本**：渲染期重读库资源需 ≥9731f129（更老则须后台重存页面刷新快照）；能力开关键（如 `case_capacity_enabled`）随版才存在；私有助手是否存在（见下）。
3. **预览缓存 1h**：后台清预览缓存（`SiteProfile/clearPreviewCache` 按站点）后强刷。
4. **发布静态页须重新发布**——install.sql 不触发重发布。
5. **旧字段值不自动迁移**：字段改名（756/758 `video`→`youtube_url`）须页面重存并重新填值。

「生产 tab/字段不出现」先看**双开关双版本**：tab 出现的键是旧版已随版的，字段键是新版未随版的——前端已发后端未发即此现象；F12 看 componentFields 响应有无该键定案（731/747/748 生产分诊）。

## 部署一致性

- **接口与后端改动必须自包含**：复用他人提交引入的私有助手 = 选择性部署炸弹（647 生产事故：补查代码调 623 未随版的 `runtimeCmsTableHasColumn`，`download_list` 全消费者 500）。验证法 = 无依赖基线组合探针（master 无依赖提交 + 仅放本次改动）。`php -l` 与同库测试都测不出 undefined method。
- **改常量名/删方法后全文件 grep 旧引用**（647、788 `API_BASE→ZHINENG_API` 漏改一行造成"部分端点正常"假象）；代理端点逐个 curl 实测。
- **公共包 CSS 多代并行**：本地 abc static 副本 ≠ 生产实载版本（742：生产新包描边是 `::before`+mask，本地旧包不是——第一轮按旧包修错了方向）。样式问题先拉生产实载 css：预览端点 `cms.chint.com/cmsapi2/system.siteProfile/preview?site_id=&url=` 公开可直取，css 经 previewRemoteAsset 代理。
- **给共享模型加列须三库同步**：init 模板 / chint_local / chint_phpunit 夹具，否则测试道先炸（647 ePLAN 21 例）。
- deps_json 嵌入页面树节点必须是**数组**（JSON 字符串被静默跳过，页面丢组件资源；挂载脚本先 `json_decode` 再嵌入）。
- CB OSS 防盗链对 css 同样生效：布局骨架（Swiper wrapper 等）不能依赖 CB 原链 css，核心规则自包含进组件 css（647）。

## 挂载门控 vs 验证回滚

能力开关、后台 Tab、表单字段按「站点挂载 ∪ 显式绑定」**实时门控**（`siteMountedComponentIds` 无缓存）。验证后把挂载回滚掉 = 后台编辑位/整个 Tab 消失，用户会当 bug 报（789/731/747/748 全踩过）。交付收尾必须报告：

- 本地验证挂载是**保留**还是**已回滚**（回滚即编辑位消失，需说明）；
- 生产步骤按序：后端发版（前提）→ 重跑最新 install.sql（自查 SQL 确认特征串）→ 页面挂载/重存（改名/改契约的页面须重配）→ 重新发布。

## 脚本操作写后即验

- **纯增量改动提交前** `git diff <base> -- <file> | grep -E '^-[^-]'` 必须为空；stat 带 `-`/N deletions 立刻停下核对（711 事故：Edit 重抄上下文旧行丢了 cover 兜底，跟着提交进了 master）。接口行字段改动的回归断言落在接口层，别只看页面 DOM（运行时别名补齐会掩盖退化）。
- bash heredoc 含 `$var` 必须 `<<'EOF'` 引号定界（788：`$check` 被 shell 展开成空串，断言静默丢失）——写后立即 grep 特征串复核。
- 挂载脚本从兄弟组件复制时，粗替换组件号**改不到根类名**（design 号不含组件 id）——ROOT_CLASS 手工核对（787 一次 6 FAIL）。
- 手写契约 JSON 后 `json.loads`/`JSON.parse` 自检（731 漏闭合根 `}`）。
- `node -e` 调试勿用双引号包 `{{$Var@...}}`（shell 展开造假 bug），调试脚本落文件（738/774）。
- curl 测 CB 签名链必须带完整 query（截短 `response-content-disposition` 尾段 → SignatureDoesNotMatch 假 bug）。
