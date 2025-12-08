import 'dotenv/config';
import express from 'express';
import { forwardWebhook } from './forwarder.js';
import logger from './logger.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/adapter/:name', (req, res, next) => {
  if (req.params.name.endsWith('.json')) {
    logger.warn(`禁止直接访问配置文件: /adapter/${req.params.name}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Direct access to adapter configuration files is not allowed'
    });
  }
  next();
});

app.all('/adapter/:name', async (req, res) => {
  const adapterName = req.params.name;
  
  logger.logRequest(req.method, `/adapter/${adapterName}`, adapterName, req.body, req.headers);
  
  try {
    const result = await forwardWebhook(adapterName, req);
    
    res.status(result.status).json(result.data);
  } catch (error) {
    if (error.message === 'CONFIG_NOT_FOUND') {
      logger.logConfigError(adapterName, '配置文件不存在');
      return res.status(404).json({
        error: 'Not Found',
        message: `Adapter configuration '${adapterName}' not found`
      });
    }
    
    if (error.message === 'CONFIG_PARSE_ERROR') {
      logger.logConfigError(adapterName, '配置文件格式错误');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Invalid adapter configuration format'
      });
    }
    
    if (error.message === 'CONFIG_MISSING_TO') {
      logger.logConfigError(adapterName, '配置缺少 to 字段');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Adapter configuration missing required field: to'
      });
    }
    
    logger.error(`转发失败: ${adapterName}`, { error: error.message });
    res.status(502).json({
      error: 'Bad Gateway',
      message: 'Failed to forward webhook request',
      details: error.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  logger.warn(`404 请求: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist'
  });
});

app.listen(PORT, () => {
  logger.info(`WebHook 转接器服务已启动`);
  logger.info(`监听端口: ${PORT}`);
  logger.info(`访问地址: http://localhost:${PORT}`);
  logger.info(`健康检查: http://localhost:${PORT}/health`);
});