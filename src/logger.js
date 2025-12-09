const colors = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
};

const LOG_LEVELS = {
  INFO: 0,
  WARN: 1,
  ERROR: 2,
};

class Logger {
  constructor() {
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    
    this.logLevel = this.parseLogLevel(process.env.LOG_LEVEL || "INFO");
    this.bodyLogAdapters = this.parseAdapterList(
      process.env.BODY_LOG_ADAPTERS || "",
    );
    this.forwardLogAdapters = this.parseAdapterList(
      process.env.FORWARD_LOG_ADAPTERS || "",
    );
    
    this.initialized = true;
  }

  parseLogLevel(level) {
    const upperLevel = level.toUpperCase();
    return LOG_LEVELS[upperLevel] !== undefined
      ? LOG_LEVELS[upperLevel]
      : LOG_LEVELS.INFO;
  }

  parseAdapterList(adapters) {
    if (!adapters || adapters.trim() === "") {
      return null;
    }
    return adapters
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a);
  }

  shouldLogBody(adapterName) {
    if (!this.initialized) this.init();
    
    return this.bodyLogAdapters === null || this.bodyLogAdapters.includes(adapterName);
  }

  shouldLogForward(adapterName) {
    if (!this.initialized) this.init();
    
    return this.forwardLogAdapters === null || this.forwardLogAdapters.includes(adapterName);
  }

  formatTimestamp() {
    return new Date().toISOString();
  }

  colorize(text, color) {
    return `${colors[color]}${text}${colors.reset}`;
  }

  log(level, message, data = null) {
    if (!this.initialized) this.init();
    
    if (LOG_LEVELS[level] < this.logLevel) {
      return;
    }

    const timestamp = this.formatTimestamp();
    let coloredLevel;

    switch (level) {
      case "INFO":
        coloredLevel =
          this.colorize("[INFO]", "blue") + this.colorize("", "bold");
        break;
      case "WARN":
        coloredLevel =
          this.colorize("[WARN]", "yellow") + this.colorize("", "bold");
        break;
      case "ERROR":
        coloredLevel =
          this.colorize("[ERROR]", "red") + this.colorize("", "bold");
        break;
      default:
        coloredLevel = `[${level}]`;
    }

    const logMessage = `${this.colorize(timestamp, "gray")} ${coloredLevel} ${message}`;
    console.log(logMessage);

    if (data) {
      console.log(this.colorize(JSON.stringify(data, null, 2), "gray"));
    }
  }

  info(message, data = null) {
    this.log("INFO", message, data);
  }

  warn(message, data = null) {
    this.log("WARN", message, data);
  }

  error(message, data = null) {
    this.log("ERROR", message, data);
  }

  logRequest(method, path, adapterName, body = null, headers = null) {
    const requestInfo = `${this.colorize(method, "cyan")} ${this.colorize(path, "green")}`;
    this.info(requestInfo);

    if (this.shouldLogBody(adapterName)) {
      if (body && Object.keys(body).length > 0) {
        this.info(`请求载体 (${adapterName}):`, body);
      }
      if (headers && process.env.LOG_HEADERS === "true") {
        this.info(`请求头 (${adapterName}):`, headers);
      }
    }
  }

  logForwardSuccess(adapterName, targetUrl, statusCode, forwardedBody = null, requestId = null) {
    const requestIdStr = requestId ? `[${this.colorize(requestId, "cyan")}] ` : "";
    this.info(
      `${requestIdStr}转发成功: ${this.colorize(adapterName, "magenta")} -> ${this.colorize(targetUrl, "green")} [${this.colorize(statusCode, "green")}]`,
    );

    if (this.shouldLogForward(adapterName) && forwardedBody) {
      this.info(`${requestIdStr}转发载体 (${adapterName}):`, forwardedBody);
    }
  }

  logForwardError(adapterName, targetUrl, error, forwardedBody = null, requestId = null) {
    const requestIdStr = requestId ? `[${this.colorize(requestId, "cyan")}] ` : "";
    this.error(
      `${requestIdStr}转发失败: ${this.colorize(adapterName, "magenta")} -> ${this.colorize(targetUrl, "red")}`,
      { error: error.message },
    );

    if (this.shouldLogForward(adapterName) && forwardedBody) {
      this.error(`${requestIdStr}转发载体 (${adapterName}):`, forwardedBody);
    }
  }

  logConfigError(adapterName, errorType) {
    this.error(
      `配置错误: ${this.colorize(adapterName, "magenta")} - ${errorType}`,
    );
  }
}

const logger = new Logger();
export default logger;