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

  const routeField = config.routeField;
  if (!routeField) {
    throw new Error("CONFIG_MISSING_ROUTE_FIELD");
  }

  const fieldValue = resolveAllVariables(`{{${routeField}}}`, context);

  for (const route of config.routes) {
    if (route.match === fieldValue) {
      return {
        to: route.to,
        method: route.method || config.method,
        headers: route.headers || config.headers,
        body: route.body || config.body,
      };
    }
  }

  if (config.default) {
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