#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
  if (!isObject(definition) || !definition.field) {
    errors.push("每个顶层字段定义都必须是带 field 的对象");
    continue;
  }
  if (fieldMap.has(definition.field)) errors.push(`顶层字段重复: ${definition.field}`);
  fieldMap.set(definition.field, definition);
}

const componentMeta = fieldMap.get("component_meta")?.default;
const dataSource = fieldMap.get("data_source")?.default;

if (!isObject(componentMeta)) errors.push("缺少 component_meta.default");
if (componentMeta?.runtime_type !== "dynamic") errors.push("component_meta.default.runtime_type 必须是 dynamic");
if (!isObject(dataSource)) errors.push("缺少 data_source.default");
if (dataSource?.mode !== "dynamic") errors.push("data_source.default.mode 必须是 dynamic");

const bindMode = dataSource?.bind_mode;
if (!new Set(["create_package", "existing_api"]).has(bindMode)) {
  errors.push("data_source.default.bind_mode 必须是 create_package 或 existing_api");
}

const itemFieldName = dataSource?.item_field || dataSource?.data_field || dataSource?.list_target;
const itemField = itemFieldName ? fieldMap.get(itemFieldName) : undefined;
if (!itemFieldName) errors.push("data_source.default 缺少 item_field");
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

  const sample = itemField.default?.find(isObject) || {};
  const sampleKeys = new Set(Object.keys(sample).filter((key) => !systemFields.has(key)));
  if (!sampleKeys.size) warnings.push(`${itemFieldName}.default 没有可用于字段识别的业务样本`);

  const schemaKeys = new Set(Object.keys(itemField.item_schema || {}));
  const editorKeys = fieldKeysFromEditor(itemField);
  const allowedKeys = new Set(dataSource.runtime_schema?.allowed_fields || []);
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

if (htmlPath) {
  let html = "";
  try {
    html = await readFile(resolve(htmlPath), "utf8");
  } catch (error) {
    errors.push(`无法读取 HTML: ${error.message}`);
  }

  if (html && !html.includes("data-lethink-dynamic")) errors.push("HTML 缺少 data-lethink-dynamic");
  if (html && itemFieldName && !html.includes(`data-component-items="${itemFieldName}"`)) {
    errors.push(`HTML 缺少 data-component-items="${itemFieldName}"`);
  }
  if (html && itemFieldName && !html.includes(`"field": "${itemFieldName}"`)) {
    warnings.push(`HTML 动态指令中没有发现 field: ${itemFieldName}`);
  }
  if (html && dataSource?.detail_link_field) {
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
}

for (const note of notes) console.log(`提示: ${note}`);
for (const warning of warnings) console.warn(`警告: ${warning}`);
for (const error of errors) console.error(`错误: ${error}`);

if (errors.length) {
  console.error(`校验失败：${errors.length} 个错误，${warnings.length} 个警告`);
  process.exit(1);
}

console.log(`校验通过：${warnings.length} 个警告`);
