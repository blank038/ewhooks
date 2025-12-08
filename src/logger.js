import chalk from 'chalk';

const LOG_LEVELS = {
  INFO: 0,
  WARN: 1,
  ERROR: 2
};

class Logger {
  constructor() {
    this.logLevel = this.parseLogLevel(process.env.LOG_LEVEL || 'INFO');
    this.bodyLogAdapters = this.parseBodyLogAdapters(process.env.BODY_LOG_ADAPTERS || '');
  }

  parseLogLevel(level) {
    const upperLevel = level.toUpperCase();
    return LOG_LEVELS[upperLevel] !== undefined ? LOG_LEVELS[upperLevel] : LOG_LEVELS.INFO;
  }

  parseBodyLogAdapters(adapters) {
    if (!adapters || adapters.trim() === '') {
      return null;
    }
    return adapters.split(',').map(a => a.trim()).filter(a => a);
  }

  shouldLogBody(adapterName) {
    if (this.bodyLogAdapters === null) {
      return true;
    }
    return this.bodyLogAdapters.includes(adapterName);
  }

  formatTimestamp() {
    return new Date().toISOString();
  }

  log(level, message, data = null) {
    if (LOG_LEVELS[level] < this.logLevel) {
      return;
    }

    const timestamp = this.formatTimestamp();
    let coloredLevel;
    
    switch (level) {
      case 'INFO':
        coloredLevel = chalk.blue.bold('[INFO]');
        break;
      case 'WARN':
        coloredLevel = chalk.yellow.bold('[WARN]');
        break;
      case 'ERROR':
        coloredLevel = chalk.red.bold('[ERROR]');
        break;
      default:
        coloredLevel = chalk.white.bold(`[${level}]`);
    }

    const logMessage = `${chalk.gray(timestamp)} ${coloredLevel} ${message}`;
    console.log(logMessage);

    if (data) {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }

  info(message, data = null) {
    this.log('INFO', message, data);
  }

  warn(message, data = null) {
    this.log('WARN', message, data);
  }

  error(message, data = null) {
    this.log('ERROR', message, data);
  }

  logRequest(method, path, adapterName, body = null, headers = null) {
    const requestInfo = `${chalk.cyan(method)} ${chalk.green(path)}`;
    this.info(requestInfo);

    if (this.shouldLogBody(adapterName)) {
      if (body && Object.keys(body).length > 0) {
        this.info(`请求载体 (${adapterName}):`, body);
      }
      if (headers && process.env.LOG_HEADERS === 'true') {
        this.info(`请求头 (${adapterName}):`, headers);
      }
    }
  }

  logForwardSuccess(adapterName, targetUrl, statusCode) {
    this.info(
      `转发成功: ${chalk.magenta(adapterName)} -> ${chalk.green(targetUrl)} [${chalk.green(statusCode)}]`
    );
  }

  logForwardError(adapterName, targetUrl, error) {
    this.error(
      `转发失败: ${chalk.magenta(adapterName)} -> ${chalk.red(targetUrl)}`,
      { error: error.message }
    );
  }

  logConfigError(adapterName, errorType) {
    this.error(`配置错误: ${chalk.magenta(adapterName)} - ${errorType}`);
  }
}

export default new Logger();
