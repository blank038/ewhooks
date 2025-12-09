import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import axios from "axios";
import { resolveAllVariables } from "./variableResolver.js";
import logger from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
});

async function loadConfig(adapterName) {
  const configPath = path.join(
    __dirname,
    "..",
    "adapter",
    `${adapterName}.json`,
  );

  try {
    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("CONFIG_NOT_FOUND");
    }
    throw new Error("CONFIG_PARSE_ERROR");
  }
}

function selectTarget(config, context) {
  if (!config.routes) {
    if (!config.to) {
      throw new Error("CONFIG_MISSING_TO");
    }
    return {
      to: config.to,
      method: config.method,
      headers: config.headers,
      body: config.body,
    };
  }

  /**
   * 辅助函数：判断单个字段值是否匹配给定的模式
   * @param {*} matchPattern - 匹配模式，可以是字符串、正则表达式格式字符串或正则表达式对象
   * @param {string} value - 要匹配的值
   * @returns {boolean} 是否匹配
   */
  function isMatch(matchPattern, value) {
    // 精确匹配（字符串）
    if (typeof matchPattern === 'string') {
      // 检查是否为正则表达式格式：/pattern/flags
      const regexMatch = matchPattern.match(/^\/(.+?)\/([gimsuy]*)$/);
      if (regexMatch) {
        try {
          const regex = new RegExp(regexMatch[1], regexMatch[2]);
          return regex.test(value);
        } catch (error) {
          logger.logError(`无效的正则表达式: ${matchPattern}`, error);
          return false;
        }
      }
      // 普通字符串精确匹配
      return matchPattern === value;
    }
    
    // 正则表达式对象格式：{"regex": "pattern", "flags": "i"}
    if (typeof matchPattern === 'object' && matchPattern.regex) {
      try {
        const regex = new RegExp(matchPattern.regex, matchPattern.flags || '');
        return regex.test(value);
      } catch (error) {
        logger.logError(`无效的正则表达式对象: ${JSON.stringify(matchPattern)}`, error);
        return false;
      }
    }

    // 默认精确匹配
    return matchPattern === value;
  }

  // 遍历路由规则
  for (const route of config.routes) {
    let matched = false;

    // 新格式：使用 conditions 数组进行多条件匹配
    if (route.conditions && Array.isArray(route.conditions)) {
      const operator = route.operator || "AND"; // 默认使用 AND 逻辑
      const results = [];

      // 逐个评估每个条件
      for (const condition of route.conditions) {
        if (!condition.field || condition.match === undefined) {
          logger.logError(`无效的条件配置: ${JSON.stringify(condition)}`);
          results.push(false);
          continue;
        }

        // 解析字段值
        const fieldValue = resolveAllVariables(`{{${condition.field}}}`, context);
        
        // 判断是否匹配
        const matchResult = isMatch(condition.match, fieldValue);
        results.push(matchResult);

        logger.logInfo(`条件匹配: ${condition.field}=${fieldValue} 匹配 ${condition.match} => ${matchResult}`);
      }

      // 根据 operator 计算最终结果
      if (operator === "AND") {
        matched = results.every(r => r === true);
      } else if (operator === "OR") {
        matched = results.some(r => r === true);
      } else {
        logger.logError(`不支持的操作符: ${operator}`);
        matched = false;
      }

      logger.logInfo(`条件组合结果 (${operator}): ${matched}`);
    }
    // 旧格式：使用 routeField + match（向后兼容）
    else if (route.match !== undefined) {
      const routeField = config.routeField;
      if (!routeField) {
        throw new Error("CONFIG_MISSING_ROUTE_FIELD");
      }

      // 解析字段值
      const fieldValue = resolveAllVariables(`{{${routeField}}}`, context);
      
      // 判断是否匹配
      matched = isMatch(route.match, fieldValue);

      logger.logInfo(`路由字段匹配: ${routeField}=${fieldValue} 匹配 ${route.match} => ${matched}`);
    }

    // 如果匹配成功，返回该路由
    if (matched) {
      logger.logInfo(`路由匹配成功 -> ${route.to}`);
      return {
        to: route.to,
        method: route.method || config.method,
        headers: route.headers || config.headers,
        body: route.body || config.body,
      };
    }
  }

  // 使用默认路由
  if (config.default) {
    logger.logInfo(`使用默认路由 -> ${config.default.to}`);
    return {
      to: config.default.to,
      method: config.default.method || config.method,
      headers: config.default.headers || config.headers,
      body: config.default.body || config.body,
    };
  }

  throw new Error("NO_MATCHING_ROUTE");
}

function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function forwardWebhook(adapterName, req) {
  const requestId = generateRequestId();

  const config = await loadConfig(adapterName);

  const context = {
    body: req.body || {},
    headers: req.headers || {},
    query: req.query || {},
    env: process.env,
  };

  const target = selectTarget(config, context);

  const method = target.method || req.method;
  const headers = target.headers
    ? resolveAllVariables(target.headers, context)
    : {};
  const body = target.body
    ? resolveAllVariables(target.body, context)
    : req.body;

  try {
    const response = await axios({
      method,
      url: target.to,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      data: body,
      timeout: 30000,
      maxRedirects: 5,
      httpsAgent: httpsAgent,
      proxy: false,
    });

    logger.logForwardSuccess(adapterName, target.to, response.status, body, requestId);

    return {
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    logger.logForwardError(adapterName, target.to, error, body, requestId);

    if (error.response) {
      let responseData = error.response.data;

      if (typeof responseData === "string" || !responseData) {
        responseData = {
          error: "Forwarding failed",
          statusCode: error.response.status,
          message:
            typeof error.response.data === "string"
              ? error.response.data.substring(0, 200)
              : error.message,
        };
      }

      return {
        status: error.response.status,
        data: responseData,
      };
    }

    return {
      status: 502,
      data: {
        error: "Failed to forward webhook",
        message: error.message,
      },
    };
  }
}