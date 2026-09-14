import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const cli = fileURLToPath(new URL("./validate-unit-json.mjs", import.meta.url));
const definitions = JSON.parse(readFileSync(new URL("../references/configured-lead-form-template.json", import.meta.url), "utf8"));
const markup = readFileSync(new URL("../references/configured-lead-form-template.html", import.meta.url), "utf8");

function run(change = () => {}, transform = value => value) {
  const folder = mkdtempSync(join(tmpdir(), "lethink-form-validator-"));
  try {
    const unit = structuredClone(definitions);
    change(unit.find(field => field.field === "lead_form").default, unit);
    writeFileSync(join(folder, "unit.json"), JSON.stringify(unit));
    writeFileSync(join(folder, "form.html"), transform(markup));
    const result = spawnSync(process.execPath, [cli, join(folder, "unit.json"), join(folder, "form.html")], { encoding: "utf8" });
    return { status: result.status, output: result.stdout + result.stderr };
  } finally { rmSync(folder, { recursive: true, force: true }); }
}

test("点选验证码表单无需列表数据源即可通过 CLI", () => {
  const result = run();
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /0 个警告/);
  assert.doesNotMatch(result.output, /缺少 data_source|缺少 item_field|缺少 data-component-items/);
});

test("不启用验证码的既有表单仍合法，对象内引号不破坏替换", () => {
  const result = run(schema => { delete schema.captcha; schema.fields[0].label = '客户姓名\'与"引号"'; });
  assert.equal(result.status, 0, result.output);
});

test("电话映射不存在和发明验证码类型都必须被拒绝", () => {
  for (const change of [schema => { schema.phone_field = "missing"; }, schema => { schema.captcha.type = "sms"; }]) {
    assert.equal(run(change).status, 1);
  }
});

test("服务端不接受的重复字段、字段类型、选项结构及空契约不能通过", () => {
  for (const change of [
    schema => { schema.fields.push({ ...schema.fields[0] }); },
    schema => { schema.fields[1].type = "tel"; },
    schema => { schema.fields[0].type = "select"; schema.fields[0].options = [{ value: "a" }]; },
    schema => { schema.fields = []; },
    (_, unit) => { unit.splice(unit.findIndex(field => field.field === "lead_form"), 1); }
  ]) assert.equal(run(change).status, 1);
});

test("id 不能代替提交字段的 name，脚本中的伪输入也不能补足", () => {
  const result = run(undefined, html => html.replace('name="phone"', 'id="phone"') + '<script>const example = `<input name="phone">`;</script>');
  assert.equal(result.status, 1);
  assert.match(result.output, /name="phone"/);
});

test("schema 被包成字符串或残留旧规则时不能通过", () => {
  const quoted = run(undefined, html => html.replace('{{$Var@lead_form}}', '"{{$Var@lead_form}}"'));
  assert.equal(quoted.status, 1);
  assert.match(quoted.output, /form.schema 必须是对象/);
  const stale = run(undefined, html => html.replace('{{$Var@lead_form}}', '{"fields":[]}'));
  assert.equal(stale.status, 1);
  assert.match(stale.output, /与 lead_form.default 不一致/);
});

test("表单元信息配上列表 HTML 不算合法表单", () => {
  const result = run(undefined, () => '<section data-lethink-dynamic=\'{"list":{"path":"article_list"}}\'></section>');
  assert.equal(result.status, 1);
  assert.match(result.output, /缺少 form 分支/);
});

// 保留旧配置识别，但不能把静态通过当作新运行时兼容证明。
test("旧字符图片验证码可被识别并提示部署版本差异", () => {
  const result = run(schema => { schema.captcha.type = "image"; });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /新点选版本不支持/);
});
