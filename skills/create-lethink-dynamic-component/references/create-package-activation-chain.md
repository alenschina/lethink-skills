# create_package 激活链路与后台编辑入口

回答"为什么挂到页面后能在后台『网站栏目』下编辑组件内容"。适用于排查菜单缺失、内容表/接口未生成、实例数据串用、菜单重复等问题时理解全链路。

## 契约标记（组件源 unit_json）

`create_package` 组件的 `data_source` / `component_meta` 声明：

| 键 | 含义 |
| --- | --- |
| `data_source.bind_mode = "create_package"` | 页面保存时生成本实例私有的内容资源 |
| `data_source.table_scope = "page_component"` | 表归属页面实例，不进共享业务模块 |
| `component_meta.component_type = "page_scoped_dynamic_table"` | 自由组件类型标记 |
| `data_source.generate_menu = true` | 生成后台编辑菜单 |
| `data_source.runtime_schema` | 完整内容模型：`fields`（字段定义，含嵌套数组列）、`views`（form/list/search 展示哪些字段）、`sorts`（字段顺序） |

`runtime_schema` 同时驱动物理列、后台表单/列表/搜索，三处必须对齐（见 [unit_json 契约](unit-json-contract.md) 的对齐表）。

## 页面保存时的激活（五件套 + 回写闭环）

保存页面（`/template.Page/edit`）→ `PageService::edit` → `reconcilePageComponentActivation` → `ComponentPageActivationV3Service::activatePageComponent`，对组件树每个节点执行 `ensureRuntimeStack`：

1. 注册 `sys_datasource` + `sys_model`（模型登记）。
2. `ensurePhysicalTable`：`CREATE TABLE IF NOT EXISTS` 物理内容表，固定带 `site_id`（站点隔离）和 `component_id`（来源组件）列。
3. `ensureModelFields`：`runtime_schema.fields` 逐个落成 `sys_model_field`；嵌套数组存单个 JSON/TEXT 列，不生成子表。
4. `upsertApi`：登记动态查询接口到 api 注册表，统一经 `/cmsapi/api.api/execute` 执行。接口 path 两种命名：
   - 页面级稳定命名：`component_{组件ID}_page_{site}_{page}`（同页面同组件复用同一套资源）；
   - 实例隔离命名：`/component/runtime/site/…/instance/{实例键}/list`（同组件二次挂载各自独立）。
5. `upsertMenu`：生成后台编辑菜单，必须挂在「内容管理 → 该页面」目录下；`url = /system.model_page/{modelId}/index`；remark 写 JSON 标记 `generated_by:component_runtime` + `page_id/page_component_id/component_id/component_index/instance_id`（菜单判重、清理、实例认领都靠它）。
6. `sys_component_page_binding` 登记实例坐标；`writeRuntimeBinding` 把 `model_id/api_id/api_path/menu_id/params` **回写进该节点 unit_json 的 data_source**——组件从此知道自己的数据在哪，前台渲染也依赖这组回写值。

判定"激活成功"看 unit_json `data_source` 是否已带 `api_path/model_id/menu_id` 且 `package_status=active`；全是 0/pending 说明激活未跑或被解绑（节点换实例 ID、重复挂载时运行时坐标会被清空待重建）。

## 后台菜单三层结构

```
网站栏目（根目录）
└── 页面目录（asset_scope=content_page_menu，标题=页面名，按 sys_page 页面树同步）
    └── 组件内容菜单（asset_scope=exhibition_content_menu，标题=组件名）
```

二级菜单与页面结构对应是设计使然：页面目录就是页面树镜像（`syncRegularPageMenuOrderForSite` 维护顺序与状态）。组件菜单打开的是**通用模型页** `/src/views/backend/template/index.vue`：它不感知具体组件，只按 url 里的 modelId 读 `sys_model` + `sys_model_field` + `runtime_schema.views` 动态渲染表单/列表/搜索——编辑的行落在第 2 步生成的物理表里，不是组件配置。

排查菜单问题先查 `sys_menu.remark` 的标记（菜单生命周期、六个删除时机与显示过滤链另见排查指南）。菜单缺失优先确认：页面状态启用、`generate_menu` 未被契约关闭、激活链路完整跑过。

## 前台取数

发布后的组件 HTML `data-lethink-dynamic` 段携带回写后的 `data_source`（`api_path` + `site_id` 等 params），前端运行时请求 `/cmsapi/api.api/execute?path=…` 拉列表渲染。物理表按 `site_id` 过滤，同一组件复制到别的站点/页面生成独立一套（命名跟着 site+page 走）。

请求中的 `page_id`/`page_component_id` 坐标只用于定位物理表，正常不做行级过滤。新激活的窄列表没有归属列；旧版激活的宽列表带归属列（默认 0），依赖契约 `bind_mode = create_package` 的独立建表豁免跳过行级坐标过滤——豁免判定只读契约值且无绑定兜底，契约合并时 `bind_mode` 丢失即静默失效，归属 0 的行（含模型页新增的全部行，add 链只写 site_id/component_id 不写页面归属）会全部查不到。诊断 SQL 与修复见 [排查指南](troubleshooting.md)。

## 实例隔离

同一组件第二次挂载会分配新实例 ID（`comp-{组件ID}-{序号}`，保存前由 `ComponentInstanceIdService` 归一化并解绑从首实例复制来的运行时坐标），激活后独立成套：表、接口、菜单各一份。因此：

- 不要跨实例复用 `component_runtime_*` 接口或 model_id；
- 编辑器里"删除组件不保存又重新添加"会换实例身份；旧实例的表和菜单按删除清理规则停用/软删，内容数据默认保留可被重新认领；
- 菜单/绑定/标记全部按实例坐标判重，历史无 `instance_id` 标记的菜单无法被新激活认领（重复菜单问题的根源）；
- **同坐标重挂不会生成新实例**：删除后不保存页面就重拖（或保存时绑定仍在），激活命中已有绑定而复用旧 model/表/菜单。要全新实例必须"删除 → 保存页面（清绑定）→ 重拖 → 保存"。实例键 `comp-{组件ID}-{页面内序号}-{契约hash}` 是确定性键，同素材同序号跨站同键，可据此判断实例代际；
- 契约改版重存已有实例：结构同步（建分类表/补列/加字段）会执行，但**分类种子与旧行新列回填不会**——内容表非空时播种守卫连带短路分类种子，旧行新分组列全 NULL。需按"旧行分组值 ↔ 分类名"回填或删干净重挂（见 [排查指南](troubleshooting.md)）。

## 与其他契约的区别

| 契约 | 数据归属 | 后台编辑入口 |
| --- | --- | --- |
| `create_package`（自由组件） | 页面实例私有表 | 网站栏目 → 页面 → 组件菜单（通用模型页） |
| `existing_api` | 共享业务模块（产品/新闻等） | 对应内容中心模块 |
| `configured_lead_form` | 留资管理 | 留资列表 |
| 静态组件 | unit_json 即内容 | 页面编辑器（static_edit_deeplink 跳回画布） |
