# 高频事故硬规则（值载体、字段名、契约形态、保真）

2026-10 下旬至 11 月下旬组件交付的事故复盘沉淀。每条规则注明事故组件编号——这些形态已付过代价，不再当新问题排查。可静态拦截的部分已内置进 `scripts/validate-unit-json.mjs`，校验报错时先对照本页。

## 1. 值的载体：自由文本与数组不进单引号属性

平台在多处对 HTML 属性做实体解码（保存链 `saveResources` 无条件 `htmlspecialchars_decode`、渲染链整段实体化），形成隐式契约：**写进属性的自由文本必须零撇号、零引号冲突**。事故链：

- `data-lethink-dynamic` 契约 JSON 内**零单引号**：`&#39;` 不可靠——684（生产不 boot、0 请求）与 752（`<p>` 泄漏破坏页面）两次实锤，渲染链把 `&#39;` 二次实体化、保存链剥层解码，两个方向都截断。
- 样例/默认文案撇号一律 **U+2019 `’`**（599 定案后 684/752 重犯两次）。用户可编辑文案移出契约，放双引号 `data-*` 属性由 preboot 读回。
- 平台旧版对属性内 `{{$Var@}}` 标量是裸 `str_replace`（backend 6eb0aa0e 起才转义为 `\u0027`）：后端未随版的环境，面板文案避免 `'` 与 `\`。
- **数组/对象/可能含引号的值不裸注入属性**：整段 YouTube iframe 代码截断双引号属性（756/758/768）、英文撇号截断单引号属性（680/778）。用 `<script type="application/json" class="*-data">{{$Var@field}}</script>` 载体（文本节点免疫实体解析），组件 JS 读载体。既有的安全通道：`data-lethink-dynamic` 的 `content` 键（后端 ENT_QUOTES 转义，742 定式）、js 槽 `{{$Js@field}}`（html 槽数组 $Var 会被 dynamicMeta 空集化）。
- 组件 JS 源码**零 HTML 实体字面量**（`&amp;` 等保存后被解码成裸字符，`'''` 三连引号炸整段 JS）：实体一律运行时拼接（577/586 定式）。JS 选择器勿匹配 `a[href="##"]`——渲染链改写成非法选择器整段 JS 死，只写 `a[href=""]`（624）。

## 2. 字段名避开平台启发式（名字先于 edit_type）

面板（`ComponentUnitConfigPanel.vue`）与后端（`ApiService::isRuntimeAssetField`）都按**字段名正则**分派控件/解析行为，排在 `edit_type` 之前：

- 名字命中 `(^|_)(videos?|mp4|webm|mov|m4v|ogg)(_|$)` → 面板强制**视频上传控件**，即使 `edit_type=input`（756 首版叫 `video` 翻车）。纯文本字段改名（`youtube_url` 安全）。组件库编辑器 popupForm 的 `type:video` 是另一语义（地址+封面），两处别混。
- 精确名 `link/url/href/link_url/jump_url/more_link/more_url/button_link/btn_link` → StandaloneLinkBuilder 站内链接选择器（734 `btn_link` 是有意保留；要普通文本输入就避开）。
- `edit_type=file` 的上传字段：名字必须含 `file_url/download_url/attachment` 才触发后端**文件编号→签名 URL** 解析（734：`btn_file` 不解析、数字裸透传；`file_url` 实测 902057→CB 长链）。含 `image/cover/logo/icon/…` 名单的字段值为纯数字时同样会被解析——不想被解析别撞名。
- `target` 是平台保留字段名（打开方式语义），组件不可用（259 定案，行内链接字段叫 `link`）。
- 控件形态不对时：抄面板判定链在 node 里跑同款正则对照，勿凭 edit_type 猜。

## 3. 详情契约：主体是标量必须声明 `detail.scalars`

带 `sublists` 且未声明 `scalars` 的详情组件，**子列表全空时整组件被隐藏且不渲染**（738/774/789 三连踩；741 是有意依赖此行为）。主体有常驻标量（标题/主图等）就必须声明 `detail.scalars`（哪怕恒等映射）。纯标量组件（scalars 且无子列表）可豁免 item_field 区域检查（739）。

注意运行时双副本：前端 `src/utils` 副本**没有** `shouldHideEmptyDetailSublists`，jsdom 空态测试必须加载后端 `public/static/js/lethink-dynamic-runtime.js` 副本，否则假阴性。

## 4. 空链占位与空动作按钮扫描器

公共运行时 `cleanupEmptyActionLinks` 扫 `a.learn-more / a.gdt-more / .action a / a[data-button] / button[data-button]`，href 为空/`#`/`##`/token/`javascript:` 即隐藏：

- **功能性元素勿用这些类的 `<a>` + 占位 href**：分类页签改 `<button type="button">`（747 预览误杀终案，运行时分类点击按 `[data-id]` 委托不关心标签）；提交钮 `<button type="submit">`（742 终案——生产公共包 `.gdt-more` 描边是 `::before`+mask，input 置换元素不渲染伪元素必丢描边）。
- 确要"空链自动隐藏"的 CTA 反而利用该机制（735/746）。
- jsdom 断言可见性必须显式查 `style.display`/`aria-hidden`，节点数查不出内联隐藏（747 教训）。

## 5. 原稿保真三原则（用户硬性要求）

- **DOM 结构逐字同构**：不拆 thead/tbody、不改层级、不删原稿没有的节点（738 拆 thead 被否；722 静态 `.m-language` 改为渲染段运行时创建）。能力缺口补公共运行时（如 738 表格模板解析/静态行保留）或组件 JS，不改标记。
- **CSS 与 origin 逐字一致零追加**（722 定案）。运行必需的偏差逐条报备（如 `.nav` fixed 补 `width:100%`、756 flex stretch 杀圆角须 `align-items:flex-start`）。同族通用 CSS 坑先查：flex stretch 拉伸定高媒体（756 生产圆角事故）、`body/:root` 规则被作用域化搬上 wrapper 杀 sticky（551/552）、组件富文本 ul 须更高特异性 `!important` 压 `markRichTextHost`（735）、`:last-child` 被运行时包裹层误杀须 (0,5,0) 补丁且置于 `@media` 前（706/647/649）。
- **交互钩子沿用原稿选择器与参数**：滚动阈值用原稿 `head-fixed/m-show`@50px 而非自拟（722）；下拉/页签交互以原稿行为为基准，原稿明显易误触的才经用户定案偏离（764 弃 hover 改 click）。

## 6. 用户已定案、勿再翻案

- 面板 `appendPathSuffix` 守卫（8d0aad9）被重构移除是有意的，勿当丢失修复去恢复（747 曾恢复被否决已 revert）。
- 空态回落 = 空态文案，不回落样例假数据；防闪烁 = 删掉写死样例仅留隐藏行模板（788 终案，visibility 中间方案被否）。
- `unit_json` image 字段 default 直存原始 URL，不转文件编号、不预插 sys_file（渲染链直接透传）。
- 表单提交一律**点击驱动**（v3 实测免疫 rogue preventDefault）；下拉默认值语义 = 占位文案即提交值；reset 一切按 defaultValue 语义（764）。
- 详情数据点独立建模，不塞进有多消费者的富文本字段（789 performance_highlights 否决塞案例描述）。
