import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

import express from "express";
import { forwardWebhook } from "./forwarder.js";
import logger from "./logger.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/adapter/:name", (req, res, next) => {
  if (req.params.name.endsWith(".json")) {
    logger.warn(`禁止直接访问配置文件: /adapter/${req.params.name}`);
    return res.status(403).json({
      error: "Forbidden",
      message: "Direct access to adapter configuration files is not allowed",
    });
  }
  next();
});

// 通用 webhook 处理函数
const handleWebhookRequest = async (req, res) => {
  const adapterName = req.params.name;

  try {
    const result = await forwardWebhook(adapterName, req);

    // 输出合并的日志
    const requestIdStr = result.requestId ? `[${result.requestId}] ` : "";
    const routeNameDisplay = result.routeName || "default";
    logger.info(
      `${requestIdStr}${logger.colorize(req.method, "cyan")} ${logger.colorize(`/adapter/${adapterName}`, "green")} -> ${logger.colorize(routeNameDisplay, "yellow")} [${logger.colorize(result.status, "green")}]`,
    );

    res.status(result.status).json(result.data);
  } catch (error) {
    if (error.message === "CONFIG_NOT_FOUND") {
      logger.logConfigError(adapterName, "配置文件不存在");
      return res.status(404).json({
        error: "Not Found",
        message: `Adapter configuration '${adapterName}' not found`,
      });
    }

    if (error.message === "CONFIG_PARSE_ERROR") {
      logger.logConfigError(adapterName, "配置文件格式错误");
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Invalid adapter configuration format",
      });
    }

    if (error.message === "CONFIG_MISSING_TO") {
      logger.logConfigError(adapterName, "配置缺少 to 字段");
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Adapter configuration missing required field: to",
      });
    }

    if (error.message === "CONFIG_MISSING_ROUTE_FIELD") {
      logger.logConfigError(adapterName, "配置缺少 routeField 字段");
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Adapter configuration missing required field: routeField",
      });
    }

    if (error.message === "NO_MATCHING_ROUTE") {
      logger.logConfigError(adapterName, "未找到匹配的路由且无默认路由");
      return res.status(400).json({
        error: "Bad Request",
        message: "No matching route found and no default route configured",
      });
    }

    logger.error(`转发失败: ${adapterName}`, { error: error.message });
    res.status(502).json({
      error: "Bad Gateway",
      message: "Failed to forward webhook request",
      details: error.message,
    });
  }
};

// GET 请求处理
app.get("/adapter/:name", handleWebhookRequest);

// POST 请求处理
app.post("/adapter/:name", handleWebhookRequest);

// 拒绝其他 HTTP 方法
app.all("/adapter/:name", (req, res) => {
  logger.warn(`不支持的 HTTP 方法: ${req.method} /adapter/${req.params.name}`);
  res.status(405).json({
    error: "Method Not Allowed",
    message: `HTTP method ${req.method} is not supported for this endpoint. Only GET and POST are allowed.`,
    allowedMethods: ["GET", "POST"],
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  logger.warn(`404 请求: ${req.method} ${req.path}`);
  res.status(404).json({
    error: "Not Found",
    message: "The requested endpoint does not exist",
  });
});

const server = app.listen(PORT, () => {
  logger.info(`WebHook 转接器服务已启动`);
  logger.info(`监听端口: ${PORT}`);
  logger.info(`访问地址: http://localhost:${PORT}`);
  logger.info(`健康检查: http://localhost:${PORT}/health`);
});
