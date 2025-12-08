function getValueByPath(obj, path) {
  if (!obj || !path) return undefined;
  
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }
  
  return current;
}

function resolveVariable(variable, context) {
  const parts = variable.split('.');
  const source = parts[0];
  const path = parts.slice(1).join('.');
  
  switch (source) {
    case 'body':
      return getValueByPath(context.body, path);
    case 'headers':
      return getValueByPath(context.headers, path);
    case 'query':
      return getValueByPath(context.query, path);
    case 'env':
      return process.env[path];
    default:
      return undefined;
  }
}

function replaceVariables(str, context) {
  if (typeof str !== 'string') return str;
  
  return str.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
    const value = resolveVariable(variable.trim(), context);
    return value !== undefined ? String(value) : '';
  });
}

export function resolveAllVariables(data, context) {
  if (typeof data === 'string') {
    return replaceVariables(data, context);
  }
  
  if (Array.isArray(data)) {
    return data.map(item => resolveAllVariables(item, context));
  }
  
  if (data !== null && typeof data === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = resolveAllVariables(value, context);
    }
    return result;
  }
  
  return data;
}