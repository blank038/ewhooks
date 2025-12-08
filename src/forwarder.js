import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { resolveAllVariables } from './variableResolver.js';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadConfig(adapterName) {
  const configPath = path.join(__dirname, '..', 'adapter', `${adapterName}.json`);
  
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('CONFIG_NOT_FOUND');
    }
    throw new Error('CONFIG_PARSE_ERROR');
  }
}

export async function forwardWebhook(adapterName, req) {
  const config = await loadConfig(adapterName);
  
  if (!config.to) {
    throw new Error('CONFIG_MISSING_TO');
  }
  
  const context = {
    body: req.body || {},
    headers: req.headers || {},
    query: req.query || {},
    env: process.env
  };
  
  const method = config.method || req.method;
  const headers = config.headers ? resolveAllVariables(config.headers, context) : {};
  const body = config.body ? resolveAllVariables(config.body, context) : req.body;
  
  try {
    const response = await axios({
      method,
      url: config.to,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      data: body
    });
    
    logger.logForwardSuccess(adapterName, config.to, response.status);
    
    return {
      status: response.status,
      data: response.data
    };
  } catch (error) {
    if (error.response) {
      logger.logForwardError(adapterName, config.to, error);
      return {
        status: error.response.status,
        data: error.response.data
      };
    }
    logger.logForwardError(adapterName, config.to, error);
    throw error;
  }
}