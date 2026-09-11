import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { inspectDynamicHtml } from "./validate-dynamic-html.mjs";

const sample = [{ title: '含有 "引号"、单引号\'、反斜杠\\与换行\n的样例' }];
const definitions = [
  { field: "component_meta", default: { runtime_type: "dynamic" } },
  { field: "data_source", default: { mode: "dynamic", bind_mode: "existing_api", path: "article_list", execute_path: "/cmsapi/api.api/execute", list_path: "data.list", item_field: "items", params: {} } },
  { field: "items", default: sample },
  { field: "category_id", default: 12 },
  { field: "page_size", default: 9 },
  { field: "label", default: sample[0].title }
];
const fields = new Map(definitions.map(field => [field.field, field]));
function markup(raw) {
  return `<section data-lethink-dynamic='${raw}'><div data-component-items="items"><article data-component-item>{{title}}</article></div></section>`;
}
const literal = '{"list":{"path":"article_list","field":"items","params":{"category_id":12},"limit":9,"filter_logic":"and"}}';

test("缺少 params 后的逗号必须报错，补正后通过", () => {
  const broken = literal.replace('12},"limit"', '12}"limit"');
  assert.ok(inspectDynamicHtml(markup(broken), fields).errors.some(message => message.includes("JSON 无法解析")));
  assert.deepEqual(inspectDynamicHtml(markup(literal), fields).errors, []);
});

test("数组、数字及字符串中的字段变量使用正确类型和转义", () => {
  const result = inspectDynamicHtml(markup('{"list":{"field":"items","default":{{$Var@items}},"limit":{{$Var@page_size}},"params":{"category_id":"{{$Var@category_id}}"},"label":"{{$Var@label}}"}}'), fields);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.configs[0].list.default, sample);
  assert.equal(result.configs[0].list.limit, 9);
  assert.equal(result.configs[0].list.params.category_id, "12");
  assert.equal(result.configs[0].list.label, sample[0].title);
});

test("字符串中的转义双引号不改变变量的字符串上下文", () => {
  const result = inspectDynamicHtml(markup('{"list":{"field":"items","label":"前缀\\\"{{$Var@label}}"}}'), fields);
  assert.deepEqual(result.errors, []);
  assert.equal(result.configs[0].list.label, '前缀"' + sample[0].title);
});

test("未定义字段报错，而不是把空替换结果当作成功", () => {
  const result = inspectDynamicHtml(markup('{"list":{"params":{"category_id":"{{$Var@wrong_category}}"}}}'), fields);
  assert.ok(result.errors.some(message => message.includes("wrong_category")));
});

test("检查指令之外的字段变量，保留合法的行占位符", () => {
  const result = inspectDynamicHtml(markup(literal).replace("<section ", '<section data-size="{{$Var@missing_size}}" '), fields);
  assert.ok(result.errors.some(message => message.includes("missing_size")));
  assert.ok(!result.errors.some(message => message.includes("title")));
});

test("字段存在但未配置默认值时提示验证实例值", () => {
  const incomplete = new Map(fields).set("category_id", { field: "category_id" });
  const result = inspectDynamicHtml(markup('{"list":{"params":{"category_id":"{{$Var@category_id}}"}}}'), incomplete);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(message => message.includes("没有默认值")));
});

test("分类默认留空提示配置，不误报成无法发起请求", () => {
  const empty = new Map(fields).set("category_id", { field: "category_id", default: "" });
  const result = inspectDynamicHtml(markup('{"list":{"params":{"category_id":"{{$Var@category_id}}"}}}'), empty);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(message => message.includes("默认值为空")));
});

test("运行时 URL 变量保留验证边界，同时仍能发现周围语法错误", () => {
  const raw = '{"list":{"params":{"category_id":"{{$Url@category_id}}"},"limit":9}}';
  const result = inspectDynamicHtml(markup(raw), fields);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(message => message.includes("无法由顶层默认值确定")));
  assert.ok(inspectDynamicHtml(markup(raw.replace('"},"limit"', '"}"limit"')), fields).errors.length > 0);
});

test("复杂字段表达式不伪装成已验证值", () => {
  const result = inspectDynamicHtml(markup('{"list":{"path":"{{$Var@source.path}}"}}'), fields);
  assert.ok(result.warnings.some(message => message.includes("source.path")));
});

test("双引号 HTML 属性和实体编码都可解析", () => {
  const encoded = literal.replaceAll('"', "&quot;");
  const html = `<section data-lethink-dynamic="${encoded}"><div data-component-items='items'></div></section>`;
  const result = inspectDynamicHtml(html, fields);
  assert.deepEqual(result.errors, []);
  assert.equal(result.configs[0].list.params.category_id, 12);
  assert.deepEqual(result.itemFields, ["items"]);
});

test("兼容实体被保留到属性值里的运行时重试形式", () => {
  const encoded = literal.replaceAll('"', "&amp;quot;");
  assert.deepEqual(inspectDynamicHtml(markup(encoded), fields).errors, []);
});

test("实体编码后的未定义变量仍然报错", () => {
  const result = inspectDynamicHtml(markup('{"list":{"path":"&#123;&#123;$Var@missing_api&#125;&#125;"}}'), fields);
  assert.ok(result.errors.some(message => message.includes("missing_api")));
});

test("多个动态组件逐一校验", () => {
  const result = inspectDynamicHtml(markup(literal) + markup('{"list":}'), fields);
  assert.equal(result.configs.length, 1);
  assert.ok(result.errors.some(message => message.includes("第 2 处")));
});

test("忽略注释和脚本中的指令示例", () => {
  const result = inspectDynamicHtml('<!-- data-lethink-dynamic="坏例子" --><script>const text = "data-lethink-dynamic=坏例子";</script>' + markup(literal), fields);
  assert.deepEqual(result.errors, []);
  assert.equal(result.configs.length, 1);
});

test("缺少属性、无引号属性及 JSON 数组不能通过", () => {
  for (const html of ["<div></div>", "<div data-lethink-dynamic={}></div>", markup("[]")]) {
    assert.ok(inspectDynamicHtml(html, fields).errors.length > 0);
  }
});

test("params 需要对象，外层 filter_logic 和 limit 属于合法配置", () => {
  assert.ok(inspectDynamicHtml(markup('{"list":{"params":[]}}'), fields).errors.length > 0);
  assert.deepEqual(inspectDynamicHtml(markup(literal), fields).errors, []);
});

test("冲突的 filter_logic 和实例数据源覆盖给出提示", () => {
  const scoped = new Map(fields).set("data_source", { default: { params: { keyword: "实例值" } } });
  const result = inspectDynamicHtml(markup('{"list":{"params":{"keyword":"源值","filter_logic":"or"},"filter_logic":"and"}}'), scoped);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(message => message.includes("filter_logic")));
  assert.ok(result.warnings.some(message => message.includes("data_source.params.keyword")));
});

const cli = fileURLToPath(new URL("./validate-unit-json.mjs", import.meta.url));
test("实际 CLI 对漏逗号返回失败退出码，修复后成功", () => {
  const folder = mkdtempSync(join(tmpdir(), "lethink-validator-test-"));
  try {
    const unit = join(folder, "component.json"), html = join(folder, "component.html");
    writeFileSync(unit, JSON.stringify(definitions));
    writeFileSync(html, markup(literal.replace('12},"limit"', '12}"limit"')));
    assert.equal(spawnSync(process.execPath, [cli, unit, html]).status, 1);
    writeFileSync(html, markup(literal));
    assert.equal(spawnSync(process.execPath, [cli, unit, html]).status, 0);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

for (const [name, json, html] of [
  ["独立内容", "create-package-template.json", null],
  ["产品分类", "existing-api-product-category-template.json", "product-category-template.html"],
  ["文章列表", "existing-api-article-list-template.json", "article-list-template.html"]
]) {
  test(`${name}参考模板通过实际 CLI 校验`, () => {
    const reference = file => fileURLToPath(new URL(`../references/${file}`, import.meta.url));
    const args = [cli, reference(json)];
    if (html) args.push(reference(html));
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    if (name === "文章列表") assert.match(result.stderr, /默认值为空/);
  });
}
