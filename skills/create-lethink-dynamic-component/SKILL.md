---
name: create-lethink-dynamic-component
description: 为 Lethink CMS 创建或排查动态组件。适用于根据业务数据结构编写 unit_json、选择 create_package 或 existing_api、接入 data-lethink-dynamic、配置内容管理入口，以及诊断接口数据未渲染、菜单未出现或占位符未替换的问题。
---

# 创建 Lethink 动态组件

为当前 Lethink CMS 前后端项目产出可以直接录入后台的 `unit_json` 和匹配的 HTML。先确认数据归属，再写配置；不要从页面外观反推表结构，也不要为了省事复用不属于该业务的数据源。

## 工作流程

1. 阅读业务需求和相邻组件，整理字段契约：字段中文名、稳定英文键、示例值、物理类型、后台控件、是否必填、层级关系、链接规则、数据维护方。
2. 判断数据归属并选择绑定方式：
   - 数据只属于这个组件或页面实例，需要平台生成表、接口和维护入口：使用 `create_package`。
   - 数据已经属于站点内容中心，存在稳定的公共接口和维护入口：使用 `existing_api`。
   - 子记录需要独立查询、编辑或复用：使用真实父子内容模型或已有分类接口；不要把它伪装成 `create_package` 的嵌套 JSON。
3. 写配置前先验证真实来源。搜索前后端实现或查询接口注册表，确认接口 `path`、参数、响应样例、`list_path`、站点过滤方式和维护入口。不要复用 `component_runtime_*` 之类页面实例生成的接口。
4. 阅读 [unit_json 契约](references/unit-json-contract.md)，只加载当前模式所需的模板：
   - `create_package`：参考 [独立内容模板](references/create-package-template.json)。
   - `existing_api` 产品分类：参考 [产品分类模板](references/existing-api-product-category-template.json) 和 [配套 HTML](references/product-category-template.html)。
5. 同步编写 HTML 的 `data-lethink-dynamic`。浏览器运行时读取的是 HTML 指令，不能只在 `unit_json.data_source` 中配置接口、映射或详情链接。
6. 运行校验：
   ```bash
   node scripts/validate-unit-json.mjs /absolute/path/component.unit.json [/absolute/path/component.html]
   ```
7. 在测试站点创建动态组件，并设置必要的组件标签。将组件放入测试页面后保存页面，以触发激活。检查真实请求、内容入口和渲染 DOM，再交付。

## 必须保持的约束

- `unit_json` 顶层是字段数组。
- `component_meta.default.runtime_type` 必须是 `dynamic`。
- `create_package` 的 `items.item_schema` 是以字段名为键的对象；`items.schema.fields` 才是数组。
- 同一业务字段必须在样本、`item_schema`、`schema.fields` 和 `runtime_schema.allowed_fields` 中对齐。
- `create_package` 默认使用 `seed_runtime_default: false`，避免把预览数据写成正式内容。
- `existing_api` 只引用已有资源，不会为新组件创建私有表或私有接口。
- 站点隔离由当前请求上下文和后端 `site_id` 过滤实现。不要在组件模板里写死站点 ID。
- 复用公共内容意味着同一站点内多个组件读取同一批内容。修改公共内容、接口实现或表结构前，要说明影响范围。
- 固定内容模块的后台入口依赖组件记录上的精确标签：`cat:product`、`cat:news`、`cat:solution`、`cat:case`、`cat:download`。仅写 `content_module` 不够。
- 详情链接优先由 `detail_url`、`detail_id_key`、`detail_id_param`、`detail_link_field` 生成，然后在 HTML 使用 `href="{{link}}"`。不要依赖 `href="...?id={{id}}"` 这种拼接能被所有 CMS 处理链稳定保留。

## 交付要求

交付时至少给出：完整 `unit_json`、匹配的 HTML 片段、需要设置的组件标签、数据维护入口、数据作用域，以及验证结果。若接口或字段契约尚未从代码或真实响应中证实，应明确列出未证实项，不能把猜测写成可直接上线的配置。

遇到菜单不出现、接口可返回但页面不渲染、链接占位符残留或跨站点数据疑问时，阅读 [排查指南](references/troubleshooting.md)。
