import { isDeepStrictEqual } from "node:util";

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const types = new Set(["text", "email", "select", "textarea", "consent"]);

// 对照 ConfiguredLeadFormSchemaService 做静态校验，不模拟 CMS、DOM 或后端入库。
export function inspectLeadForm(fieldMap, html, configs = []) {
  const errors = [], warnings = [], notes = [];
  const schema = fieldMap.get("lead_form")?.default;
  const fields = schema?.fields;
  if (!isObject(schema) || !Array.isArray(fields) || !fields.length || fields.length > 50) {
    errors.push("lead_form.default 必须是对象，fields 必须是 1–50 项的数组");
    return { errors, warnings, notes };
  }
  const keys = new Set();
  for (const field of fields) {
    if (!isObject(field)) { errors.push("表单字段必须是对象"); continue; }
    const { key, label, type = "text" } = field;
    if (typeof key !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || keys.has(key)) {
      errors.push(`表单字段 key 无效或重复: ${key}`);
    }
    keys.add(key);
    if (typeof label !== "string" || !label.trim()) errors.push(`表单字段 ${key} 缺少 label`);
    if (!types.has(type)) errors.push(`表单字段 ${key} 的 type 不受支持: ${type}`);
    if (field.required !== undefined && typeof field.required !== "boolean") warnings.push(`表单字段 ${key} 的 required 建议使用布尔值`);
    if (field.max !== undefined && (!Number.isInteger(field.max) || field.max < 0 || field.max > 4000)) {
      warnings.push(`表单字段 ${key} 的 max 建议使用 0–4000 的整数，避免服务端转换后与前端规则不同`);
    }
    if (type === "select" && field.options !== undefined && (!Array.isArray(field.options) || field.options.some(value => typeof value !== "string"))) {
      errors.push(`表单字段 ${key} 的 options 必须是字符串数组`);
    }
  }
  for (const field of fields.filter(isObject)) {
    if (field.other_value && field.other_field && !keys.has(field.other_field)) errors.push(`表单联动字段不存在: ${field.other_field}`);
  }
  if (schema.phone_field !== undefined && schema.phone_field !== "") {
    if (!keys.has(schema.phone_field)) errors.push(`phone_field 未对应表单 key: ${schema.phone_field}`);
    const phone = fields.find(field => field?.key === schema.phone_field);
    if (phone && (!phone.max || phone.max > 20)) warnings.push("phone_field 对应字段建议设置 max: 20，当前留资电话列另有限长校验");
  }
  if (schema.captcha !== undefined && (!isObject(schema.captcha) || ![undefined, "", "image"].includes(schema.captcha.type))) {
    errors.push("lead_form.captcha 仅支持图片验证码对象；无需验证码时省略 captcha");
  }
  if (schema.captcha?.type === "image" && keys.has("vcode")) warnings.push("vcode 是验证码输入，不应放入业务 fields；使用独立 captcha_id/captcha_code 提交");
  if (fieldMap.has("data_source") || fieldMap.has("items")) warnings.push("配置式留资表单不需要列表 data_source/items，请确认没有误用列表契约");

  if (html !== undefined) {
    const forms = configs.filter(config => config.form !== undefined);
    if (!forms.length) errors.push("表单 HTML 的 data-lethink-dynamic 缺少 form 分支");
    for (const config of forms) {
      if (!isObject(config.form) || !isObject(config.form.schema)) errors.push("HTML form.schema 必须是对象；对象模板外不要加双引号");
      else if (!isDeepStrictEqual(config.form.schema, schema)) errors.push("HTML form.schema 与 lead_form.default 不一致，请同步源契约与 HTML");
      if (["list", "category", "detail", "fanout"].some(key => config[key] !== undefined)) warnings.push("form 分支优先初始化，同一动态指令中的列表等分支不会执行");
    }
    const markup = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
    if (!/<form\b/i.test(markup)) errors.push("表单 HTML 缺少 form 元素");
    const names = new Set([...markup.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)]
      .map(match => match[0].match(/\sname\s*=\s*(["'])(.*?)\1/i)?.[2]).filter(Boolean));
    for (const key of keys) {
      if (!names.has(key)) errors.push(`HTML 缺少 name="${key}" 的表单控件（id/class 不能代替 name）`);
    }
    notes.push("表单 HTML 静态检查只匹配带引号的 name；实际表单归属、自定义选择器、必填控件和验证码钩子需在 DOM 验证");
  }
  notes.push("表单直接 POST CustomerLead 控制器；不要求 data_source/items，也不代表验证码或真实入库已验证");
  return { errors, warnings, notes };
}
