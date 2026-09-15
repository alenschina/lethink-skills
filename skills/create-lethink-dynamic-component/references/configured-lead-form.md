# 配置式留资表单

适用于访客提交咨询、申请或联系方式，数据进入现有留资管理的组件。经验来自 527 表单及配套公共能力，代码核对日期为 2026-09-14。其他业务表单先确认接收接口和存储模型，不应仅因页面有输入框就使用本契约。

## 先确认目标环境支持

默认仍只交付 `unit_json` 和动态 HTML，沿用原 CSS、JS、`deps_json`。先确认目标页面已经具备 `cfg.form` 的浏览器端提交能力；能力可以来自公共动态运行时，也可以在用户明确只处理当前组件时来自最小组件级 JS。后者是经过授权才增加的第三项产物，不应把所有表单任务都扩成脚本或后端开发。

优先查当前代码和相邻组件：

| 检查位置 | 要确认的行为 |
| --- | --- |
| 页面实际加载的公共动态运行时及当前组件 JS，搜索 `cfg.form`、`configuredSubmit`、`clickCaptcha` | 确认字段收集、验证码和状态反馈由哪一层负责，避免重复绑定 |
| 后端 `app/service/basic/ConfiguredLeadFormService.php` | 按源组件读取契约，校验后保存留资 |
| `ConfiguredLeadFormSchemaService.php` | 实际支持的字段类型、必填、长度和选项约束 |
| `extend/captcha/ClickCaptcha.php`、`app/controller/Auth.php`、`app/controller/api/CustomerLead.php`、`config/allowlist.php` | 登录点选验证码、最终提交复核及公开入口是否可用 |
| `app/service/component/ComponentService.php`、`ComponentPageActivationV3Service.php` | 保存、激活时识别表单，避免自动补入列表数据源和生成内容资源 |

先确认业务所说的“图片验证码”是输入字符还是按提示点选。允许登录同款方式时，优先复用现有 `Auth/clickCaptcha`、`Auth/checkClickCaptcha` 和 `ClickCaptcha`，不另建一套字符验证码。登录页面存在弹窗，不等于发布页已具备表单弹窗和最终提交校验。现有短信表单（例如 181）也不能直接当作点选验证码接口。

本参考模板使用新方案 `captcha.type: click`。旧字符图片方案使用 `image`、`CustomerLead/formCaptcha` 和 `captcha_code`，属于另一版本；新方案移除了独立图片服务并拒绝 `image`，两套配置不可混搭。校验器保留旧类型识别以便排查，但静态通过不代表部署版本支持。

按影响范围选择浏览器端能力的承载位置：

| 情况 | 做法 |
| --- | --- |
| 实际发布页的公共运行时已完整支持 `cfg.form` | 直接复用，不新增组件 JS |
| 需求只服务当前组件，用户希望避免修改公共源码 | 增加最小组件级 JS，阅读 [组件级表单运行时](component-level-form-runtime.md) |
| 多个组件需要长期复用同一能力 | 评估公共运行时改造，并核对所有真实资源入口和回归范围 |

若能力缺失，先说明需要补充哪部分、影响范围和交付限制。已有明确授权时补齐选定范围，否则不要声称仅靠 JSON、HTML 就能实现服务端校验。

## 从静态原稿提取契约

读取原 HTML；若为 0 字节，先确认是否尚未保存。按需要阅读原 JS，确认省份等自定义下拉怎样向隐藏控件赋值，以及是否已有提交监听器。保留 DOM 层级、类名及交互钩子。原稿若已有真实提交逻辑，先确认是否会与公共运行时重复请求。

整理每项业务输入的 `name`、含义、必填、长度、选项及存储位置。不要把访客数据放进组件默认值。原稿中的 `id` 或 `class` 不能代替 `name`：运行时通过 `form.elements.namedItem(field.key)` 收集值。

采用 [字段模板](configured-lead-form-template.json) 和 [配套 HTML](configured-lead-form-template.html) 的契约。参考 HTML 只展示接入方式；有原稿时将钩子加回原结构，不用这份简化布局覆盖原稿。

| 配置 | 含义 |
| --- | --- |
| `component_meta.default.runtime_type: dynamic` | 动态组件 |
| `component_meta.default.component_type: configured_lead_form` | 标识提交表单，不是 `data_source.bind_mode` 的取值 |
| `generate_menu: false`、`generates_content_menu: false` | 此表单不生成列表内容菜单；仍需确认服务端识别分支已部署 |
| `lead_form.default.fields` | 非空字段定义数组；每项使用 `key`，不是列表编辑器的 `field` |
| `lead_form.default.phone_field` | 将指定的已校验字段写入现有 `lead.phone` 列；不配置时当前实现留空 |
| `lead_form.default.captcha.type: click` | 服务端强制复核并消费登录同款点选验证码；不需要验证码时省略 `captcha`，不虚构 `none` 或 `sms` 类型 |

`lead_form` 使用隐藏对象字段；标题和按钮文案等普通配置可以开放编辑。无需 `items`、`data_source`、`runtime_schema`、`list.path`、分类或分页，也不为每次挂载创建物理表和接口。

字段定义遵循当前服务端契约：

- `fields` 为 1–50 项；`key` 以英文字母开头，只含字母、数字、下划线，最长 64 字符且唯一；`label` 非空。
- 类型支持 `text`、`email`、`select`、`textarea`、`consent`。电话的契约类型用 `text`，HTML 可用 `type="tel"`；不能据 HTML 类型发明 schema 类型。
- `required` 与 HTML 必填属性对齐；`max` 为明确的字符上限，服务端最高按 4000 处理。电话映射另有 20 字符及禁止换行约束，不应默认限制为大陆手机号。
- 可选邮箱留空合法，填写时校验格式。不要因为原稿有邮箱输入框就自动设为必填。
- 需要限制选项时使用 `options` 字符串数组，与原 JS 写入控件的实际值一致，先清理值两端空格。自定义下拉通常是隐藏输入，单靠 HTML `required` 无法保证选择，必须在 schema 中声明必填并验证运行时和后端。
- 点选验证码不需要 `vcode` 输入框，也不放进业务 `fields`；浏览器端弹窗返回独立的 `captcha_id`、`captcha_info`。

`label` 还参与留资存储：当前服务把字段写成 `label：value` 的备注行。后台姓名、邮箱、省份、客户备注等展示依赖 `app/model/basic/Lead.php` 的标签解析，例如 `客户姓名`、`邮箱`、`省份`、`客户备注`；随意改为其他同义词可能让对应列变空。备注总长目前截断为 4000 字符，大量字段不能默认视为无损结构化存储；有独立查询或导出要求时先核对模型能力。

## HTML 指令与请求

组件根节点使用：

```html
data-lethink-dynamic='{
  "execute_path": "/cmsapi/api.api/execute",
  "form": {
    "selector": ".form",
    "schema": {{$Var@lead_form}},
    "status": "[data-lethink-form-status]",
    "success_text": "提交成功，我们会尽快与您联系"
  }
}'
```

`schema` 是对象模板，外面不加双引号。CMS 渲染后检查 `form.schema.fields` 是否仍为数组。表单和提示节点应匹配选择器；选择器在当前组件根节点或表单内解析，避免依赖全局唯一 ID。状态提示使用 `role="status"`、`aria-live="polite"`；提交按钮初始 `disabled`，由实际承担表单逻辑的浏览器端实现准备好后启用。

`execute_path` 在此用于解析 API 主机及 `/cmsapi`、`/cmsapi2` 前缀，表单不会调用 execute 查询列表。点选验证码在表单校验通过并点击提交后才打开；POST 使用 `application/x-www-form-urlencoded`：

| 顺序与接口（以 `/cmsapi` 为例） | 参数与行为 |
| --- | --- |
| `GET /cmsapi/auth/clickCaptcha` | `id`；复用登录图片生成，响应含 `id`、`text`、`base64`、`width`、`height` |
| `POST /cmsapi/auth/checkClickCaptcha` | `id`、`info`、`unset: false`；预检不消费挑战，留给最终提交复核 |
| `POST /cmsapi/api.CustomerLead/configuredSubmit` | `site_id`、`component_id`、`data`（业务字段 JSON 字符串）、`captcha_id`、`captcha_info`、来源信息；响应必须为 `code: 0` 且 `data.id` 为新留资 ID |

`captcha_info` 复用登录协议：`x1,y1-x2,y2;图片宽;图片高`。浏览器端弹窗把显示缩放后的点位转换为原图坐标，并传原图尺寸。验证码 ID 使用 `lf-站点ID-组件ID-24位随机十六进制字符`，服务端检查请求上下文前缀。不能只依赖浏览器预检成功：最终提交必须调用 `ClickCaptcha::check(..., true)` 复核消费，否则绕过弹窗直接 POST 仍可能入库。

不要把这些路径填成 `list.path`，也不需要为它们注册 execute 接口。运行时使用解析后的 `cfg.site_id` 和顶层 `cfg.params.component_id`；它们来自实际挂载上下文，模板不写死 527、站点 ID 或测试页面 ID。

后端从该组件当前唯一启用的 `unit_json` 源资源读取 `lead_form`，不信任浏览器声明的校验策略。修改字段或验证码后，要同步源契约、HTML、页面实例并重新保存发布。只修改页面实例的 `form.schema` 不能关闭服务端验证码，也可能造成前后端规则不一致。

## 数据归属与后台操作

此实现写入现有逻辑表 `lead`，真实表名前缀取决于部署环境。记录携带当前 `site_id`，联系方式按 `phone_field` 映射，其他业务值和来源保存到备注。同站点多个表单进入同一留资管理，组件 ID 留在来源备注中；不是每个组件实例拥有独立表。

在 CMS 中录入 JSON、HTML，沿用原 CSS、JS 和依赖；若选择组件级方案，再录入该组件的最小 JS，并删除或停用与它重复绑定的原稿提交逻辑。挂到测试站点页面并保存。在现有“留资管理”（前端视图 `content/lead`）核对记录和站点权限。此表单不依赖 `cat:product`、`cat:news`，不能用添加文章标签来解决留资入口不可见。

## 验证码与预览的关键行为

生成图片、缓存和有效期沿用登录 `ClickCaptcha` 与 `config/captcha.php`，默认有效期 600 秒、2 个目标，需要 GD、Redis 及原图片/字体/图标资源，参数以目标环境为准。共享校验保留 `unset: false` 预检，并检查点位数量、坐标及图片尺寸。成功的最终复核使用 Redis 比较后删除，避免并发重放或误删刚刷新的挑战；错误点选不会消费，可重新点选或刷新。业务字段先校验，字段失败也不等于验证码已消费。不要把旧独立图片接口的限流和失败消费行为套到登录接口上。

选定的浏览器端实现负责创建局部弹窗和样式、加载、点选、刷新、关闭与状态反馈；发布页不依赖后台 Vue，组件主体仍沿用原 CSS、JS。弹窗打开后先显示与验证码图片同尺寸比例的稳定加载面板，图片和点选提示只在图片触发 `load` 后显示。待加载图片必须留在布局和解码流程中，可用 `visibility: hidden`，不要通过 `display: none` 或隐藏父节点阻断部分预览环境的图片加载。图片失败时保留弹窗并显示可重试状态，刷新使用同样的加载切换流程。

取消后保留业务输入且不提交；刷新、取消后的旧异步响应应被忽略。提交期间禁用按钮以防重复弹窗和 POST；成功重置输入及自定义下拉显示，失败保留输入。客户端防重复点击不等于服务端业务幂等，超时不自动重试提交，应先确认是否入库。

预览判断要区分表单与列表：公共运行时可读取 `hooks.previewMode`；组件级脚本则应检查无站点、无组件标识、编辑器全局标志及显式静态配置。命中表单预览时不取验证码、不提交；缺少组件上下文也禁用。站点列表预览可能仍要读取真实接口，不能为了禁止表单提交而恢复全局静态化。真实提交应在带有效上下文且未被标记为静态/表单预览的测试页面验证。

## 发布时核对实际加载脚本

组件级方案需要同时更新源组件 JS 和已经挂载到页面的组件实例。修改源资源后，重新打开页面配置、同步或保存组件并发布；预览仍输出旧脚本时刷新站点预览缓存。以 Elements 或实际响应中的脚本文本为准，不能因本地文件已修改就认定页面已经生效。可比较源组件资源、页面实例和本地交付文件的内容摘要，避免只更新其中一层。

若选择公共运行时方案，本项目存在五份可能的入口：

- 前端 `src/utils/lethink-dynamic-runtime.js`
- 前端 `public/abc/components/static/js/lethink-dynamic-runtime.js`
- 前端 `public/assets/vendor/file-cms/abc/components/static/js/lethink-dynamic-runtime.js`
- 后端 `public/static/js/lethink-dynamic-runtime.js`
- 后端 `public/assets/vendor/file-cms/abc/components/static/js/lethink-dynamic-runtime.js`

需要补公共能力时检查所有实际入口；各副本可能已有差异，应移植所需分支，不能用一份整文件覆盖其他副本。发布页还可能由 `DynamicRuntimeAssetService` 选取站点或全局 `sys_file` 中路径为 `abc/components/static/js/lethink-dynamic-runtime.js` 的文件中心/CB/CDN 资源。仅提交仓库文件不足以证明站点升级；应在 Network 打开实际加载脚本确认 `configuredSubmit`、`clickCaptcha` 及 `cfg.form` 分支。JSON、HTML 和浏览器端能力应同步升级；仅修改 `captcha.type` 无法让旧脚本识别新方案。组件级方案则应确认公共运行时不再包含同一表单提交逻辑，避免一次提交被两层处理。

## 验证顺序

1. 运行技能校验器检查 JSON、对象模板、schema 与 HTML 的 `name` 对齐；它不会要求表单补 `data_source/items`。校验器不执行原 JS，也不验证任意 CSS 选择器或 CMS 保存链路。
2. 检查真实 `ComponentService` 保存/渲染和 `PageService` 上下文注入结果：无残留变量、字段对象不丢失、不被补成列表配置，站点和组件上下文正确。单元测试若以反射绕过构造器，需为新加入的数据库查询准备明确的测试数据；不能删除上下文断言来让测试通过。
3. 验证实际浏览器端实现：初始禁用、有效提交才弹窗、图片完成加载前只显示稳定加载态、完成后再显示图片和提示、取消不提交、刷新忽略旧响应、桌面和移动端缩放点选、隐藏省份必填、空邮箱允许、重复点击仅一次 POST、失败保留输入、成功重置、同页实例互不重置，以及表单预览零真实请求。补公共能力时回归站点列表预览仍能取数；使用组件级方案时确认同一根节点只初始化一次，其他动态组件不受影响。
4. 在隔离测试环境走真实控制器和存储：错误、过期、重放、跨站点和跨组件验证码应拒绝；有效请求返回新记录 ID，核对留资字段和正确站点。补充验证码消费逻辑时验证两个独立请求并发使用同一挑战仅一个成功，并回归登录预检不消费的行为。模拟 fetch 成功不能代替入库验证。不要为方便测试向生产代码加入验证码绕过入口。
5. 区分已完成的静态校验、本地运行时/模拟请求、真实后端联调、CMS 挂载发布验证；缺少哪一层就明确列出。核对原 CSS、JS 沿用情况，以及实际发布页资源版本。

排查时：无 execute 请求本身是正常的，先找两个 Auth 请求及 `CustomerLead/configuredSubmit`；按钮一直禁用时检查实际运行时、预览标志、上下文和验证码状态；提交成功但后台列为空时先检查 `phone_field` 与备注标签映射。
