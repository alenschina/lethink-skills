# 动态请求契约

本文记录当前 Lethink 实现。接入其他版本时，按函数名核对实际代码，不把这里的默认值当作所有版本的保证。

## 请求值与运行时规则

`data-lethink-dynamic` 是完整的运行时配置，并不是全部原样发送给接口的请求体。

| 位置 | 含义 | 请求行为 |
| --- | --- | --- |
| `execute_path` | 执行入口 | 用于构建请求 URL |
| `list.path` | 接口名 | 转为查询参数 `path` |
| `list.params` | 固定请求参数，例如分类、推荐条件 | 复制其中的键值；空字符串、null 最终不序列化 |
| `list.category_param` | 当前选中分类使用的参数名，默认 `category_id` | 选中值写入该名称；`category_param` 本身不发送 |
| `list.keyword_param` | 关键词参数名，默认 `keyword` | 搜索状态写入该名称 |
| `list.year_param` / `month_param` / `day_param` | 日期参数名，默认 `year` / `month` / `day` | 所选日期部分写入对应名称 |
| `list.page_param` / `limit_param` | 页码及条数参数名，默认 `page` / `limit` | 分页状态写入对应名称 |
| `list.limit` | 每页条数 | 运行时显式转换为请求参数；根节点 `data-lethink-page-size` 可覆盖它 |
| `list.filter_logic` | 外层兼容写法 | 非空时转换为请求参数，覆盖 `params.filter_logic` |
| `list.list_path` | 响应数组路径，例如 `data.list` | 前端读取响应，不发送 |
| `list.field` | 目标 `data-component-items` 名称 | 前端渲染配置，不发送 |
| `list.mapping` | 模板字段到响应字段路径的映射 | 左侧是模板字段，右侧是响应字段路径，不发送 |
| `list.search` | 搜索表单选择器 | 前端事件绑定，不发送 |
| `list.pagination.pages_path` | 总页数路径 | 前端读取响应，不发送 |
| `list.detail_*` | 缺失详情链接的生成规则 | 前端处理，不发送 |
| `list.default` / `allow_default_fallback` | 预览样例及回退行为 | 不作为请求参数发送 |

业务条件集中放在 `params` 通常更易读，但不能把 `limit`、`filter_logic` 的外层写法误判为错误，也不能把 `mapping`、`search` 等控制项都塞进 `params`。同一条件尽量只声明一次，避免意外覆盖。

## 固定分类与分类切换

固定查询某类文章：

```json
"params": {
  "category_id": "{{$Var@category_id}}",
  "filter_logic": "and"
}
```

这是 HTML 指令片段。`{{$Var@category_id}}` 要有同名 `unit_json` 顶层字段，并由页面实例填写真实 ID。空字符串表示不限定分类，不会阻止请求；如果业务要求固定公示分类，空值不满足业务要求。

需要用户切换分类时，可用 `category` 段加载分类，并声明：

```json
"category_param": "category_id"
```

它只规定参数名。假设当前选中的分类 ID 为 12，运行时会发送 `category_id=12`；12 只是解释用的值，不能作为正式分类默认值。当前代码省略这项时默认也是 `category_id`。

有 `category.path` 时，运行时先请求分类，再按当前分类请求列表；分类结果为空可能直接结束，不继续请求列表。没有分类切换需求时，使用 `list.params.category_id` 即可，无需为了能取数而添加分类段。页面服务可能根据接口角色绑定注入分类段，仍需检查最终 HTML。

## 两阶段合并顺序

服务端页面渲染阶段：

1. 读取当前页面实例的字段值和 `data_source`。
2. 在当前 `PageService::mergeDynamicRuntimeDataSourceFromProps` 中，实例 `data_source.params` 覆盖 HTML 对应段的 `params`。
3. 对 HTML 原先声明的参数，如果实例存在同名顶层字段，再用该字段覆盖参数。例如 `params.category_id` 对应顶层 `category_id`。
4. 平台合并当前站点和页面实例上下文；无需模板写死 `site_id`。

浏览器 `loadList` 阶段：

1. 复制最终 `list.params`。
2. 当前分类、关键词和年/月/日状态非空时，写入对应参数，覆盖同名固定值。
3. 显式的外层 `filter_logic` 非空时覆盖 `params` 中的值；`newsListData` 路径还存在默认 OR 的兼容逻辑，应核对当前实现。
4. 根据分页开关、当前页码、页大小写入 `page` 和 `limit`。
5. 解析运行时 URL 参数，再由执行器组合 `path`、`site_id` 和查询参数。

HTML 改了但请求没变时，应检查旧页面实例配置。`unit_json.data_source.params` 内不应再塞入未经证实能被解析的 `{{$Var@...}}`；用实际默认值和顶层字段覆盖机制。若自定义字段名不同，应显式核对替换及映射过程，不能假设参数名会自动匹配。

## 定位代码

在用户实际应用项目中搜索这些文件和函数，不依赖个人电脑的绝对目录：

- 前端 `src/utils/lethink-dynamic-runtime.js`：`parseDynamicConfig`、`resolveSiteId`、`RT.boot`、`RT.initInstance`、`loadList`、`execute`。
- 后端 `app/service/template/PageService.php`：`mergeDynamicRuntimeDataSourceFromProps`、`mergeDynamicRuntimeInstanceContext`。
- 后端 `app/service/api/ApiService.php`：接口分派、请求过滤和分页实现。

源码与部署资源可能不同；必要时检查页面实际加载的运行时。标准 `/cmsapi/api.api/execute` 在当前实现中可按挂载位置适配为 `/cmsapi2/api.api/execute`，Network 应按 `execute` 查找。
