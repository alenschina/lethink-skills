# unit_json 契约

## 先决定数据归属

| 问题 | 选择 | 含义 |
| --- | --- | --- |
| 数据只服务于新组件或页面实例吗？ | `create_package` | 页面保存激活时生成实例级模型、表、接口和维护入口 |
| 数据已经由产品、新闻、案例等内容中心维护吗？ | `existing_api` | 复用稳定接口和公共表；同站点消费者共享内容 |
| 子项需要独立查询、权限、状态或复用吗？ | 真实父子模型 | 不应存进单条记录的 TEXT/JSON 字段 |

`create_package` 中的嵌套对象或数组通常存进当前记录的一个 TEXT/JSON 列，不会自动变成子表和外键。

## 顶层结构

`unit_json` 是字段定义数组。常见字段分三类：

1. 普通组件配置，如区块标题。
2. 隐藏的 `component_meta` 和 `data_source`。
3. 动态数据字段，如 `items` 或 `categories`。

最小动态元信息：

```json
{
  "field": "component_meta",
  "type": "object",
  "edit_type": "hidden",
  "can_edit": 0,
  "show_in_panel": 0,
  "default": {
    "runtime_type": "dynamic",
    "activation_mode": "page_mount"
  }
}
```

## create_package

平台从动态数据字段中推断业务列。一个字段要同时出现在以下位置：

| 位置 | 作用 |
| --- | --- |
| `items.default[0]` | 字段识别和组件库预览样本 |
| `items.item_schema.<key>` | 数据库物理类型与后台标签 |
| `items.schema.fields[]` | 编辑表单控件与校验 |
| `data_source.default.runtime_schema.allowed_fields` | 生成的运行时模型允许字段 |
| `runtime_schema.views` | 列表、表单和搜索展示 |

`item_schema` 必须是对象：

```json
"item_schema": {
  "title": { "label": "标题", "type": "varchar" },
  "summary": { "label": "说明", "type": "text" }
}
```

`schema.fields` 必须是数组：

```json
"schema": {
  "fields": [
    {
      "field": "title",
      "label": "标题",
      "type": "string",
      "edit_type": "input",
      "component": "input",
      "required": true
    }
  ]
}
```

常用物理类型：`varchar`、`text`、`int`、`bigint`、`tinyint`、`decimal`、`date`、`datetime`。不确定长文本时优先核对已有组件和后端建模实现。

不要预填运行时生成的 `model_id`、`table_name` 或 `component_runtime_*` 接口。首次把组件加入页面并保存时，由激活流程生成实例资源。结构变更是否自动迁移取决于后端激活逻辑；先在测试站点验证，不要把修改配置等同于数据库已经迁移。

## existing_api

至少确认以下契约：

```json
{
  "mode": "dynamic",
  "source_type": "api",
  "bind_mode": "existing_api",
  "execute_path": "/cmsapi/api.api/execute",
  "method": "GET",
  "path": "stable_api_path",
  "list_path": "data.list",
  "item_field": "items",
  "mapping": {}
}
```

`execute_path` 是统一入口，业务接口由 `path` 区分。可用接口应从注册表或代码确认：

- 列表：`/cmsapi/api.api/index?site_id=<site>&include_global=1&status=1&page=1&limit=200`
- 详情：`/cmsapi/api.api/get?id=<api-id>`
- 执行：`/cmsapi/api.api/execute?path=<path>&site_id=<site>`

优先查看扁平接口列表。不要只凭接口名判断响应结构；必须执行接口并核对真实 `data.list`。

### 固定内容模块

| 内容模块 | 组件标签 | 常见维护入口 |
| --- | --- | --- |
| `product` | `cat:product` | `content/product` |
| `news` | `cat:news` | 对应新闻内容入口 |
| `solution` | `cat:solution` | 对应解决方案入口 |
| `case` | `cat:case` | 对应案例入口 |
| `download` | `cat:download` | 对应下载入口 |

固定内容菜单由组件记录的 `tags` 识别。`unit_json` 中的 `content_module` 用于描述和运行时配置，不能代替 `cat:*` 标签。

## HTML 指令对齐

HTML 根节点携带 `data-lethink-dynamic`，常用统一入口如下：

```html
<section data-lethink-dynamic='{
  "execute_path": "/cmsapi/api.api/execute",
  "list": {
    "path": "stable_api_path",
    "list_path": "data.list",
    "field": "items",
    "default": {{$Var@items}}
  }
}'>
  <div data-component-items="items">
    <article data-component-item>{{title}}</article>
  </div>
</section>
```

必须对齐：

- 指令中的 `field`、`data-component-items` 和 `unit_json.data_source.item_field`。
- 指令的 `path`、`list_path`、`mapping` 与真实接口响应。
- 模板占位符与映射后的字段名。
- 树形数据的嵌套区域，例如根分类使用 `categories`，子分类使用运行时生成的 `children`。

复杂链接采用运行时生成字段：

```json
{
  "detail_url": "/products/product-list",
  "detail_id_key": "id",
  "detail_id_param": "category_id",
  "detail_link_field": "link"
}
```

HTML 使用 `href="{{link}}"`。这些字段需要出现在 HTML 的 `data-lethink-dynamic` 对应分支中；仅写入 `unit_json` 不会让浏览器运行时看到它们。

## 站点作用域

运行时会从当前页面解析 `site_id`，附加到执行请求和站点请求头；后端接口仍必须按 `site_id` 过滤。公共产品分类接口的隔离单位是站点：

- 不同站点读取各自的分类记录。
- 同一站点内复用该接口的组件读取同一批分类记录。
- 修改某站点的公共内容会影响该站点内所有消费者。
- 修改公共接口实现、接口注册或表结构可能影响所有站点消费者。

不要在模板中写死 `site_id`。调试时应观察实际网络请求并验证后端返回的站点数据。
