#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectDynamicHtml } from "./validate-dynamic-html.mjs";
import { inspectLeadForm } from "./validate-lead-form.mjs";

const unitPath = process.argv[2];
const htmlPath = process.argv[3];

if (!unitPath) {
  console.error("用法: node validate-unit-json.mjs <unit_json 文件> [HTML 文件]");
  process.exit(2);
}

const errors = [];
const warnings = [];
const notes = [];
const systemFields = new Set(["id", "site_id", "sort", "status", "create_time", "update_time", "delete_time"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sorted(values) {
  return [...values].sort();
}

function difference(left, right) {
  return sorted([...left].filter((value) => !right.has(value)));
}

function fieldKeysFromEditor(field) {
  const fields = field?.schema?.fields;
  if (!Array.isArray(fields)) return new Set();
  return new Set(fields.map((item) => item?.field).filter(Boolean));
}

function checkEqualBusinessFields(label, expected, actual) {
  const missing = difference(expected, actual);
  const extra = difference(actual, new Set([...expected, ...systemFields]));
  if (missing.length) errors.push(`${label} 缺少字段: ${missing.join(", ")}`);
  if (extra.length) warnings.push(`${label} 包含样本中没有的业务字段: ${extra.join(", ")}`);
}

let unitJson;
try {
  unitJson = JSON.parse(await readFile(resolve(unitPath), "utf8"));
} catch (error) {
  console.error(`无法读取或解析 unit_json: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(unitJson)) {
  errors.push("unit_json 顶层必须是数组");
}

const definitions = Array.isArray(unitJson) ? unitJson : [];
const fieldMap = new Map();
for (const definition of definitions) {
  if (!isObject(definition) || typeof definition.field !== "string" || !definition.field.trim()) {
    errors.push("每个顶层字段定义都必须是带 field 的对象");
    continue;
  }
  if (fieldMap.has(definition.field)) errors.push(`顶层字段重复: ${definition.field}`);
  fieldMap.set(definition.field, definition);
}

const componentMeta = fieldMap.get("component_meta")?.default;
const dataSource = fieldMap.get("data_source")?.default;
const isLeadForm = componentMeta?.component_type === "configured_lead_form" || fieldMap.has("lead_form");

if (!isObject(componentMeta)) errors.push("缺少 component_meta.default");
if (componentMeta?.runtime_type !== "dynamic") errors.push("component_meta.default.runtime_type 必须是 dynamic");
if (!isLeadForm && !isObject(dataSource)) errors.push("缺少 data_source.default");
if (!isLeadForm && dataSource?.mode !== "dynamic") errors.push("data_source.default.mode 必须是 dynamic");

const bindMode = isLeadForm ? undefined : dataSource?.bind_mode;
if (!isLeadForm && !new Set(["create_package", "existing_api"]).has(bindMode)) {
  errors.push("data_source.default.bind_mode 必须是 create_package 或 existing_api");
}

const itemFieldName = isLeadForm ? undefined : dataSource?.item_field || dataSource?.data_field || dataSource?.list_target;
const itemField = itemFieldName ? fieldMap.get(itemFieldName) : undefined;
if (!isLeadForm && !itemFieldName) errors.push("data_source.default 缺少 item_field");
if (itemFieldName && !itemField) errors.push(`找不到动态数据字段: ${itemFieldName}`);
if (itemField && !Array.isArray(itemField.default)) errors.push(`${itemFieldName}.default 必须是数组`);

if (bindMode === "create_package" && itemField) {
  if (dataSource.seed_runtime_default !== false) {
    warnings.push("create_package 建议显式设置 seed_runtime_default: false，避免预览数据成为正式内容");
  }
  if (!isObject(itemField.item_schema)) {
    errors.push(`${itemFieldName}.item_schema 必须是以字段名为键的对象，不能是数组`);
  }
  if (!Array.isArray(itemField.schema?.fields)) {
    errors.push(`${itemFieldName}.schema.fields 必须是数组`);
  }

  const sample = (Array.isArray(itemField.default) ? itemField.default.find(isObject) : undefined) || {};
  const sampleKeys = new Set(Object.keys(sample).filter((key) => !systemFields.has(key)));
  if (!sampleKeys.size) warnings.push(`${itemFieldName}.default 没有可用于字段识别的业务样本`);

  const schemaKeys = new Set(Object.keys(itemField.item_schema || {}));
  const editorKeys = fieldKeysFromEditor(itemField);
  const allowedFields = dataSource.runtime_schema?.allowed_fields;
  if (!Array.isArray(allowedFields) || allowedFields.some(key => typeof key !== "string" || !key.trim())) {
    errors.push("runtime_schema.allowed_fields 必须是非空字段名组成的数组");
  }
  const allowedKeys = new Set(Array.isArray(allowedFields) ? allowedFields.filter(key => typeof key === "string") : []);
  checkEqualBusinessFields(`${itemFieldName}.item_schema`, sampleKeys, schemaKeys);
  checkEqualBusinessFields(`${itemFieldName}.schema.fields`, sampleKeys, editorKeys);
  checkEqualBusinessFields("runtime_schema.allowed_fields", sampleKeys, allowedKeys);

  for (const forbidden of ["model_id", "table_name", "api_path", "path"]) {
    const value = dataSource[forbidden];
    if (typeof value === "string" && value.includes("component_runtime_")) {
      errors.push(`create_package 不应预填实例生成资源 ${forbidden}: ${value}`);
    }
  }
}

if (bindMode === "existing_api") {
  const apiPath = dataSource.path || dataSource.api_path || dataSource.component_api_path;
  if (!apiPath) errors.push("existing_api 缺少稳定接口 path/api_path");
  if (typeof apiPath === "string" && apiPath.includes("component_runtime_")) {
    errors.push("existing_api 不能复用页面实例生成的 component_runtime_* 接口");
  }
  if (!dataSource.list_path) errors.push("existing_api 缺少 list_path");
  if (!dataSource.execute_path) warnings.push("建议显式设置 execute_path: /cmsapi/api.api/execute");

  const moduleName = dataSource.content_module || componentMeta?.content_module;
  const tags = {
    product: "cat:product",
    news: "cat:news",
    solution: "cat:solution",
    case: "cat:case",
    download: "cat:download"
  };
  if (tags[moduleName]) notes.push(`后台组件记录需要设置标签 ${tags[moduleName]}；unit_json 无法代替该标签`);

  if (dataSource.detail_url) {
    for (const key of ["detail_id_key", "detail_id_param", "detail_link_field"]) {
      if (!dataSource[key]) errors.push(`配置 detail_url 时还需要 ${key}`);
    }
  }
}

// —— 事故硬规则（references/incident-hard-rules.md）：字段名启发式与文案撇号 ——
const videoLikeName = /(^|_)(videos?|mp4|webm|mov|m4v|ogg)(_|$)/i;
const standaloneLinkNames = new Set(["link", "url", "href", "link_url", "jump_url", "more_link", "more_url", "button_link", "btn_link"]);
const runtimeAssetName = /(image|cover|logo|icon|thumb|pic|picture|photo|banner|poster|avatar|file_url|download_url|attachment)/i;
for (const definition of definitions) {
  if (!isObject(definition) || typeof definition.field !== "string") continue;
  const name = definition.field;
  if (["component_meta", "data_source"].includes(name)) continue;
  const editType = definition.edit_type;
  if (name === "target") {
    errors.push(`字段名 target 是平台保留名（打开方式语义），组件不可用；行内链接字段用 link`);
  }
  if (videoLikeName.test(name) && ["input", "textarea"].includes(editType)) {
    errors.push(`字段 ${name} 名字命中视频启发式，面板会无视 edit_type=${editType} 强制渲染视频上传控件（756 事故）；纯文本字段改名（如 youtube_url）`);
  }
  if (standaloneLinkNames.has(name) && ["input", "textarea"].includes(editType)) {
    notes.push(`字段 ${name} 精确名会渲染 StandaloneLinkBuilder 站内链接选择器；要普通文本输入需避开该名单`);
  }
  if (editType === "file" && !runtimeAssetName.test(name)) {
    errors.push(`edit_type=file 的字段 ${name} 名字不含 file_url/download_url/attachment，后端不会把文件编号解析成签名 URL（734 btn_file 事故）`);
  }
  if (typeof definition.default === "string" && definition.default.includes("'")) {
    warnings.push(`字段 ${name} 默认文案含 ASCII 撇号；注入单引号属性会截断（599/684/752 事故），文案撇号一律 U+2019 ’`);
  }
}

let formHtml;
let htmlConfigs = [];
if (htmlPath) {
  let html = "";
  try {
    html = await readFile(resolve(htmlPath), "utf8");
  } catch (error) {
    errors.push(`无法读取 HTML: ${error.message}`);
  }

  const inspection = inspectDynamicHtml(html, fieldMap);
  formHtml = html;
  htmlConfigs = inspection.configs;
  errors.push(...inspection.errors);
  warnings.push(...inspection.warnings);
  notes.push(...inspection.notes);
  // 纯标量详情组件（detail.scalars 绑定字段、无 sublists/lists 区域，如单图板块）没有行区域，
  // item_field 只是 data_source 的形式占位（599/707/739 同形态），区域检查豁免。
  const detailCfgForItems = inspection.configs.map((c) => c && c.detail).find(Boolean) || {};
  const scalarOnlyDetail = Object.keys(detailCfgForItems.scalars || {}).length > 0
    && !(detailCfgForItems.sublists || []).length
    && !(detailCfgForItems.lists || []).length;
  if (html && itemFieldName && !inspection.itemFields.includes(itemFieldName) && !scalarOnlyDetail) {
    errors.push(`HTML 缺少 data-component-items="${itemFieldName}"`);
  }
  if (html && itemFieldName && !scalarOnlyDetail && inspection.configs.length && !inspection.boundFields.includes(itemFieldName)) {
    warnings.push(`HTML 动态指令中没有发现 field: ${itemFieldName}`);
  }
  if (html && !isLeadForm && dataSource?.detail_link_field) {
    const linkField = dataSource.detail_link_field;
    if (!html.includes(`href="{{${linkField}}}"`)) {
      warnings.push(`HTML 未使用运行时详情链接 href="{{${linkField}}}"`);
    }
    for (const key of ["detail_url", "detail_id_key", "detail_id_param", "detail_link_field"]) {
      if (!html.includes(`"${key}"`)) errors.push(`HTML 的 data-lethink-dynamic 中缺少 ${key}`);
    }
  }
  if (/href=["'][^"']*\?[^"']*\{\{[^}]+\}\}/.test(html)) {
    warnings.push("HTML href 中仍有拼接式查询参数占位符；优先改用 detail_* 生成 link 字段");
  }

  // —— 事故硬规则（references/incident-hard-rules.md）：值载体、占位链接、scalars ——
  // 契约 JSON 内零单引号：&#39; 会被保存链剥层/渲染链二次实体化两个方向截断（684/752 生产事故）。
  for (const attribute of html.matchAll(/\bdata-lethink-dynamic\s*=\s*(['"])([\s\S]*?)\1/gi)) {
    const raw = attribute[2];
    const label = `data-lethink-dynamic（${raw.slice(0, 40).trim()}…）`;
    if (/&#0?39;|&apos;/i.test(raw)) {
      errors.push(`${label} 含 &#39;/&apos; 实体：保存链解码剥层、渲染链二次实体化都会截断属性，契约 JSON 内必须零单引号`);
    }
    if (raw.replace(/&#0?39;|&apos;/gi, "'").includes("'")) {
      errors.push(`${label} 契约 JSON 内出现 ASCII 单引号：单引号属性会被提前闭合；文案撇号改 U+2019 或把可编辑文案移出契约`);
    }
  }
  // 数组/对象值裸注入普通属性：值含引号即截断（680/778/756 家族），应走 script application/json 载体、契约 content 键或 js 槽。
  const carrierWarned = new Set();
  for (const attribute of html.matchAll(/\b([\w:.-]+)\s*=\s*(['"])([\s\S]*?)\2/g)) {
    const attrName = attribute[1];
    if (attrName === "data-lethink-dynamic") continue;
    for (const token of attribute[3].matchAll(/\{\{\$Var@(\w+)\}\}/g)) {
      const field = fieldMap.get(token[1]);
      const value = field?.default;
      if (value !== null && typeof value === "object" && !carrierWarned.has(`${attrName}:${token[1]}`)) {
        carrierWarned.add(`${attrName}:${token[1]}`);
        warnings.push(`属性 ${attrName} 直接注入数组/对象字段 ${token[1]}：值含引号即截断（680/778/756 事故）；改用 <script type="application/json"> 载体、契约 content 键或 js 槽 $Js@`);
      }
    }
  }
  // learn-more/gdt-more 的 <a> + 占位 href 会被 cleanupEmptyActionLinks 隐藏（747 页签误杀/742 提交钮事故）。
  for (const tag of html.matchAll(/<a\b[^>]*>/gi)) {
    const text = tag[0];
    const classes = text.match(/\bclass\s*=\s*(["'])([^"']*)\1/i)?.[2] || "";
    if (!/(^|\s)(learn-more|gdt-more)(\s|$)/.test(classes)) continue;
    const href = text.match(/\bhref\s*=\s*(["'])([^"']*)\1/i)?.[2] ?? "";
    if (href === "" || href === "#" || href === "##" || /^javascript:/i.test(href) || /^\{\{[^}]*\}\}$/.test(href)) {
      warnings.push(`learn-more/gdt-more 的 <a> 占位链接（href="${href}"）会被空动作按钮扫描器隐藏：功能性元素改 <button>；确要空链自动隐藏则属预期`);
    }
  }
  // detail 带 sublists 未声明 scalars：子列表全空时整组件被运行时隐藏（738/774/789 三连踩）。
  for (const config of inspection.configs) {
    const detail = isObject(config) ? config.detail : undefined;
    if (!isObject(detail)) continue;
    const sublistCount = (detail.sublists || []).length + (detail.lists || []).length;
    if (sublistCount && !Object.keys(detail.scalars || {}).length) {
      warnings.push("detail 带 sublists 未声明 scalars：子列表全空时整组件会被运行时隐藏且不渲染；主体有常驻标量必须声明 detail.scalars（纯子列表组件可忽略）");
    }
  }
}

if (isLeadForm) {
  const inspection = inspectLeadForm(fieldMap, formHtml, htmlConfigs);
  errors.push(...inspection.errors);
  warnings.push(...inspection.warnings);
  notes.push(...inspection.notes);
}

for (const note of notes) console.log(`提示: ${note}`);
for (const warning of warnings) console.warn(`警告: ${warning}`);
for (const error of errors) console.error(`错误: ${error}`);

if (errors.length) {
  console.error(`校验失败：${errors.length} 个错误，${warnings.length} 个警告`);
  process.exit(1);
}

console.log(`校验通过：${warnings.length} 个警告`);
