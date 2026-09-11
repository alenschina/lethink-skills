// 只校验静态结构和已知顶层字段，不执行模板代码，不模拟 CMS 页面实例合并。
function decodeEntities(text) {
  const named = { quot: '"', apos: "'", amp: "&", lt: "<", gt: ">" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|quot|apos|amp|lt|gt);/gi, (entity, key) => {
    const lower = key.toLowerCase();
    if (lower[0] !== "#") return named[lower];
    const value = lower[1] === "x" ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
  });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasDefault(field) {
  return field && Object.prototype.hasOwnProperty.call(field, "default");
}

export function inspectDynamicHtml(html, fields) {
  const errors = [], warnings = [], notes = [], configs = [];
  // 忽略注释及脚本/样式正文中的示例字符串；不充当通用 HTML/CMS 解析器。
  const markup = html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const tokens = /\{\{\$([^@{}]+)@([^{}]+)\}\}/g;
  for (const match of decodeEntities(decodeEntities(markup)).matchAll(tokens)) {
    const [, kind, key] = match;
    if (kind === "Var" && /^\w+$/.test(key)) {
      if (!fields.has(key)) errors.push(`HTML 变量 ${match[0]} 没有对应的 unit_json 顶层字段`);
      else if (!hasDefault(fields.get(key))) warnings.push(`字段 ${key} 没有默认值，需检查页面实例和最终 HTML`);
      else if (fields.get(key).default === "" || fields.get(key).default === null) {
        warnings.push(`变量 ${match[0]} 的默认值为空，需核对页面实例是否应填写；空分类不限制查询`);
      }
    } else {
      warnings.push(`变量 ${match[0]} 无法由顶层默认值确定，本次只检查周围 JSON 结构，需验证最终页面/运行时值`);
    }
  }

  function interpolate(text) {
    let output = "", inString = false;
    for (let index = 0; index < text.length;) {
      const token = text.slice(index).match(/^\{\{\$([^@{}]+)@([^{}]+)\}\}/);
      if (token) {
        const [, kind, key] = token;
        const field = kind === "Var" ? fields.get(key) : undefined;
        if (hasDefault(field)) {
          const value = field.default;
          if (inString) {
            const stringValue = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
            output += JSON.stringify(stringValue).slice(1, -1);
          } else {
            output += JSON.stringify(value);
          }
        } else {
          // 仅用于继续发现漏逗号等结构错误，已在上面报告未定义/无法静态解析的变量。
          output += inString ? "" : "null";
        }
        index += token[0].length;
        continue;
      }
      const char = text[index];
      if (inString && char === "\\") {
        output += text.slice(index, index + 2);
        index += 2;
        continue;
      }
      if (char === '"') inString = !inString;
      output += char;
      index++;
    }
    return output;
  }

  const attributes = [...markup.matchAll(/\bdata-lethink-dynamic\s*=\s*(["'])([\s\S]*?)\1/gi)];
  const assignments = [...markup.matchAll(/\bdata-lethink-dynamic\s*=/gi)];
  if (!attributes.length) errors.push("HTML 缺少带引号的 data-lethink-dynamic 属性");
  if (assignments.length > attributes.length) errors.push("存在未闭合或未用引号包裹的 data-lethink-dynamic 属性");
  attributes.forEach((attribute, index) => {
    const label = `data-lethink-dynamic 第 ${index + 1} 处`;
    let text = decodeEntities(attribute[2]), parsed, failure;
    // 浏览器解析属性后，当前运行时还允许一次实体解码后重试。
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        parsed = JSON.parse(interpolate(text));
        failure = null;
        break;
      } catch (error) {
        failure = error;
        const decoded = decodeEntities(text);
        if (decoded === text) break;
        text = decoded;
      }
    }
    if (failure) {
      errors.push(`${label} JSON 无法解析: ${failure.message}`);
      return;
    }
    if (!isObject(parsed)) {
      errors.push(`${label} 必须是 JSON 对象`);
      return;
    }
    configs.push(parsed);
    // 与 PageService 一致：实例数据源只覆盖首个主数据段，不覆盖列表旁的分类段。
    const runtimeSection = ["list", "fanout", "category"].find(section => isObject(parsed[section]));
    for (const section of ["list", "category", "detail", "fanout"]) {
      const part = parsed[section];
      if (part === undefined) continue;
      if (!isObject(part)) {
        errors.push(`${label}.${section} 必须是对象`);
        continue;
      }
      if (part.params !== undefined && !isObject(part.params)) errors.push(`${label}.${section}.params 必须是对象`);
      if (section === "list" && part.filter_logic && part.params?.filter_logic && part.filter_logic !== part.params.filter_logic) {
        warnings.push(`${label}: 外层 filter_logic 会覆盖 params.filter_logic，请确认优先级符合业务要求`);
      }
      if (section === "list" && part.pagination?.enabled !== undefined) {
        notes.push("当前运行时使用根节点 data-lethink-enable-pagination 控制分页，不以 pagination.enabled 作为开关");
      }
      const sourceParams = fields.get("data_source")?.default?.params;
      if (section === runtimeSection && (isObject(sourceParams) || Array.isArray(sourceParams)) && isObject(part.params)) {
        for (const [key, value] of Object.entries(part.params)) {
          if (fields.has(key)) continue;
          if (!Object.prototype.hasOwnProperty.call(sourceParams, key)) {
            warnings.push(`${label}.${section}.params.${key} 可能在参数覆盖后丢失：data_source.params 未声明该参数，且没有同名顶层字段可回填；变量替换成功不代表合并后仍保留，请核对最终指令及请求`);
          } else if (JSON.stringify(sourceParams[key]) !== JSON.stringify(value)) {
            warnings.push(`${label}: HTML 与 data_source.params.${key} 不一致，实例数据源可能覆盖 HTML，请核对最终请求`);
          }
        }
      }
    }
  });
  notes.push("本次仅验证静态配置与支持的字段默认值，不代表 CMS 实例合并、运行时变量或真实接口验证通过");
  return {
    configs,
    itemFields: [...markup.matchAll(/\bdata-component-items\s*=\s*(["'])(.*?)\1/gi)].map(match => decodeEntities(match[2])),
    errors: [...new Set(errors)], warnings: [...new Set(warnings)], notes: [...new Set(notes)]
  };
}
