/**
 * 插件注册入口
 * 在此处 import 并注册所有内置插件
 *
 * 开发自定义插件:
 *   1. 在 src/tui/plugins/ 下新建 my-plugin.ts
 *   2. 使用 definePlugin() 定义插件
 *   3. 在本文件 import 并调用 pluginRegistry.register()
 *   4. 重新构建即可生效
 *
 * 外部插件 (未来支持):
 *   hyper plugin install my-npm-plugin
 */

import { pluginRegistry } from '../../sdk/plugin.js';
import emailReminderPlugin from './email-reminder.js';
import tokenCounterPlugin from './token-counter.js';
import weatherTimePlugin from './weather-time.js';
import { messagingPlugin } from './messaging.js';
import { analyticsPlugin } from './analytics.js';

// 注册内置插件 (默认启用)
pluginRegistry.register(emailReminderPlugin, true);
pluginRegistry.register(tokenCounterPlugin, true);
pluginRegistry.register(weatherTimePlugin, true);
pluginRegistry.register(messagingPlugin, true);
pluginRegistry.register(analyticsPlugin, true);

export { pluginRegistry };
