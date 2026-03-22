/**
 * 插件: weather-time
 * ==================
 * 天气 + 时间插件 —— 无需 API Key, 基于 Open-Meteo 免费天气 API
 *
 * 命令:
 *   /weather           — 显示当前天气 (使用上次城市)
 *   /weather 北京      — 查询指定城市
 *   /weather 上海      — 支持中文城市名
 *   /time              — 显示多时区时间
 *   /time 纽约         — 显示指定城市时间
 *   /date              — 今日日历视图
 *
 * 自然语言:
 *   "今天天气怎么样"
 *   "北京天气"
 *   "现在几点"
 *
 * 状态栏:
 *   🌤 22° 北京  14:32
 *
 * 数据来源:
 *   天气: Open-Meteo (https://open-meteo.com) 完全免费, 无需注册
 *   地理编码: Open-Meteo Geocoding API
 */

import { definePlugin, defineSkill } from '../../sdk/plugin.js';

// ── 天气代码 → 描述/图标 ──────────────────────────────────────────────────────

const WMO_CODES: Record<number, { desc: string; icon: string; iconNight?: string }> = {
  0:  { desc: '晴朗',   icon: '☀️', iconNight: '🌙' },
  1:  { desc: '大部晴', icon: '🌤' },
  2:  { desc: '局部多云', icon: '⛅' },
  3:  { desc: '阴天',   icon: '☁️' },
  45: { desc: '雾',     icon: '🌫' },
  48: { desc: '冻雾',   icon: '🌫' },
  51: { desc: '小毛毛雨', icon: '🌦' },
  53: { desc: '毛毛雨',  icon: '🌦' },
  55: { desc: '大毛毛雨', icon: '🌧' },
  61: { desc: '小雨',   icon: '🌧' },
  63: { desc: '中雨',   icon: '🌧' },
  65: { desc: '大雨',   icon: '🌧' },
  71: { desc: '小雪',   icon: '🌨' },
  73: { desc: '中雪',   icon: '🌨' },
  75: { desc: '大雪',   icon: '❄️' },
  77: { desc: '冰粒',   icon: '🌨' },
  80: { desc: '阵雨',   icon: '🌦' },
  81: { desc: '中阵雨', icon: '🌧' },
  82: { desc: '强阵雨', icon: '⛈' },
  85: { desc: '阵雪',   icon: '🌨' },
  86: { desc: '强阵雪', icon: '❄️' },
  95: { desc: '雷暴',   icon: '⛈' },
  96: { desc: '雷暴+冰雹', icon: '⛈' },
  99: { desc: '雷暴+大冰雹', icon: '⛈' },
};

// ── 城市名 → 中英文映射 ──────────────────────────────────────────────────────

const CITY_MAP: Record<string, string> = {
  '北京': 'Beijing', '上海': 'Shanghai', '广州': 'Guangzhou',
  '深圳': 'Shenzhen', '成都': 'Chengdu', '杭州': 'Hangzhou',
  '武汉': 'Wuhan', '西安': 'Xian', '南京': 'Nanjing',
  '天津': 'Tianjin', '重庆': 'Chongqing', '苏州': 'Suzhou',
  '纽约': 'New York', '伦敦': 'London', '东京': 'Tokyo',
  '首尔': 'Seoul', '巴黎': 'Paris', '新加坡': 'Singapore',
  '香港': 'Hong Kong', '台北': 'Taipei', '澳门': 'Macao',
};

// ── 时区映射 ──────────────────────────────────────────────────────────────────

const TIMEZONE_MAP: Record<string, string> = {
  '北京': 'Asia/Shanghai', '上海': 'Asia/Shanghai',
  '东京': 'Asia/Tokyo', '首尔': 'Asia/Seoul',
  '纽约': 'America/New_York', '洛杉矶': 'America/Los_Angeles',
  '伦敦': 'Europe/London', '巴黎': 'Europe/Paris',
  '新加坡': 'Asia/Singapore', '悉尼': 'Australia/Sydney',
  '迪拜': 'Asia/Dubai', '香港': 'Asia/Hong_Kong',
};

// ── 缓存 ──────────────────────────────────────────────────────────────────────

interface WeatherCache {
  city: string;
  displayName: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  isDay: number;
  fetchedAt: Date;
}

let lastCity = '上海';
let weatherCache: WeatherCache | null = null;
let isFetching = false;

async function geocode(cityName: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const englishName = CITY_MAP[cityName] ?? cityName;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(englishName)}&count=1&language=zh&format=json`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await resp.json() as { results?: Array<{ latitude: number; longitude: number; name: string }> };
    if (!data.results || data.results.length === 0) return null;
    const r = data.results[0];
    return { lat: r.latitude, lon: r.longitude, name: r.name };
  } catch {
    return null;
  }
}

async function fetchWeather(cityName: string): Promise<WeatherCache | null> {
  const geo = await geocode(cityName);
  if (!geo) return null;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day` +
    `&wind_speed_unit=kmh&timezone=auto`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await resp.json() as {
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        relative_humidity_2m: number;
        wind_speed_10m: number;
        weather_code: number;
        is_day: number;
      };
    };
    const c = data.current;
    return {
      city: cityName,
      displayName: geo.name,
      temp: Math.round(c.temperature_2m),
      feelsLike: Math.round(c.apparent_temperature),
      humidity: c.relative_humidity_2m,
      windSpeed: Math.round(c.wind_speed_10m),
      weatherCode: c.weather_code,
      isDay: c.is_day,
      fetchedAt: new Date(),
    };
  } catch {
    return null;
  }
}

function getWeatherInfo(code: number, isDay: number) {
  const info = WMO_CODES[code] ?? { desc: '未知', icon: '❓' };
  const icon = (isDay === 0 && info.iconNight) ? info.iconNight : info.icon;
  return { desc: info.desc, icon };
}

function formatWeatherLine(w: WeatherCache): string {
  const { icon, desc } = getWeatherInfo(w.weatherCode, w.isDay);
  return `${icon} ${w.temp}° ${desc} 体感${w.feelsLike}° 湿度${w.humidity}% 风${w.windSpeed}km/h`;
}

function formatTime(tz?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
    timeZone: tz,
  };
  return new Date().toLocaleTimeString('zh-CN', opts);
}

function formatDate(): string {
  const now = new Date();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 周${weekdays[now.getDay()]}`;
}

// ── Plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
  id: 'weather-time',
  name: '天气时间',
  version: '1.0.0',
  description: '实时天气 (Open-Meteo 免费) + 多时区时间显示, 无需 API Key',
  author: 'hyperterminal',
  tags: ['weather', 'time', 'utility'],

  onLoad: async ({ getConfig }) => {
    // 加载上次使用的城市
    const saved = getConfig('weather.city');
    if (saved) lastCity = saved;
    // 后台预取天气
    void fetchWeather(lastCity).then(w => { if (w) weatherCache = w; });
  },

  // ── 每隔 10 分钟刷新天气 ─────────────────────────────────────────────────
  onTick: async ({ uptime }) => {
    if (uptime % 600 === 0 && !isFetching) {
      isFetching = true;
      const w = await fetchWeather(lastCity);
      if (w) weatherCache = w;
      isFetching = false;
    }
  },

  // ── 命令 ─────────────────────────────────────────────────────────────────
  commands: {
    weather: async ({ args, addMessage, setConfig }) => {
      const city = args.trim() || lastCity;
      if (args.trim()) {
        lastCity = city;
        setConfig('weather.city', city);
        weatherCache = null; // 清除缓存强制刷新
      }

      addMessage(`🔄 正在获取 ${city} 天气...`, 'system');
      const w = await fetchWeather(city);

      if (!w) {
        addMessage(`⚠ 无法获取 "${city}" 天气\n请检查城市名称是否正确`, 'system');
        return;
      }

      weatherCache = w;
      const { icon, desc } = getWeatherInfo(w.weatherCode, w.isDay);
      const lines = [
        `${icon} **${w.displayName} 当前天气**\n`,
        `  温度: ${w.temp}°C  (体感 ${w.feelsLike}°C)`,
        `  天气: ${desc}`,
        `  湿度: ${w.humidity}%`,
        `  风速: ${w.windSpeed} km/h`,
        `  更新: ${w.fetchedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
        '',
        `  /weather 城市名  查询其他城市`,
      ];
      addMessage(lines.join('\n'), 'system');
    },

    time: async ({ args, addMessage }) => {
      const cityName = args.trim();

      if (cityName) {
        const tz = TIMEZONE_MAP[cityName];
        if (!tz) {
          addMessage(`⚠ 未知城市时区: "${cityName}"\n支持: ${Object.keys(TIMEZONE_MAP).join(', ')}`, 'system');
          return;
        }
        const timeStr = formatTime(tz);
        addMessage(`🕐 **${cityName}时间**\n\n  ${timeStr}\n  ${tz}`, 'system');
        return;
      }

      // 多时区展示
      const cities = [
        { name: '北京/上海', tz: 'Asia/Shanghai' },
        { name: '东京', tz: 'Asia/Tokyo' },
        { name: '新加坡', tz: 'Asia/Singapore' },
        { name: '伦敦', tz: 'Europe/London' },
        { name: '纽约', tz: 'America/New_York' },
        { name: '洛杉矶', tz: 'America/Los_Angeles' },
      ];

      const lines = [`🕐 **世界时间** — ${formatDate()}\n`];
      for (const c of cities) {
        lines.push(`  ${c.name.padEnd(10)} ${formatTime(c.tz)}`);
      }
      addMessage(lines.join('\n'), 'system');
    },

    date: async ({ addMessage }) => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const today = now.getDate();

      // 生成月历
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthNames = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];

      const lines = [
        `📅 **${year}年${monthNames[month]}月**\n`,
        '  日 一 二 三 四 五 六',
      ];

      let row = '  ' + '   '.repeat(firstDay);
      for (let d = 1; d <= daysInMonth; d++) {
        const isToday = d === today;
        row += isToday ? `[${d.toString().padStart(2)}]` : ` ${d.toString().padStart(2)} `;
        const dayOfWeek = (firstDay + d - 1) % 7;
        if (dayOfWeek === 6 || d === daysInMonth) {
          lines.push(row);
          row = '  ';
        }
      }

      lines.push(`\n  今天: ${formatDate()}`);
      addMessage(lines.join('\n'), 'system');
    },
  },

  // ── 自然语言 ──────────────────────────────────────────────────────────────
  naturalTriggers: [
    /^(?:今天|现在|最近)?(?:天气|气温|温度)(?:怎么样|如何|是多少)?$/,
    /^(.+)[的地]天气$/,
    /^(.+)\s*天气$/,
    /^(?:现在|此刻)?几点(?:了)?$/,
    /^(?:今天|现在)(?:是)?几月几号/,
  ],

  onNaturalInput: async ({ match: _match, input, addMessage }) => {
    const lc = input.toLowerCase();
    if (lc.includes('几点') || lc.includes('时间')) {
      const lines = [`🕐 **现在时间**\n`, `  本地: ${formatTime()}`];
      addMessage(lines.join('\n'), 'system');
      return;
    }
    if (lc.includes('几月') || lc.includes('日期')) {
      addMessage(`📅 ${formatDate()}`, 'system');
      return;
    }
    // 天气查询
    const cityMatch = input.match(/^(.+)[的地]天气$/) ?? input.match(/^(.+)\s*天气$/);
    const city = cityMatch ? cityMatch[1].trim() : lastCity;
    const w = await fetchWeather(city);
    if (w) {
      weatherCache = w;
      addMessage(`${formatWeatherLine(w)}\n${w.displayName} — ${formatDate()}`, 'system');
    } else {
      addMessage(`⚠ 无法获取 "${city}" 天气`, 'system');
    }
  },

  // ── 状态栏 ────────────────────────────────────────────────────────────────
  statusWidget: () => {
    const timeStr = formatTime();
    if (!weatherCache) return `🕐 ${timeStr}`;
    const { icon } = getWeatherInfo(weatherCache.weatherCode, weatherCache.isDay);
    return `${icon} ${weatherCache.temp}° ${lastCity}  🕐 ${timeStr}`;
  },

  // ── 插件视图内容 ──────────────────────────────────────────────────────────
  viewLines: () => {
    const lines = [
      '  === 天气时间插件 ===',
      `  📅 ${formatDate()}`,
      `  🕐 本地 ${formatTime()}`,
    ];

    if (weatherCache) {
      const { icon, desc } = getWeatherInfo(weatherCache.weatherCode, weatherCache.isDay);
      const age = Math.floor((Date.now() - weatherCache.fetchedAt.getTime()) / 60000);
      lines.push(
        `  ${icon} ${weatherCache.displayName}: ${weatherCache.temp}°C ${desc}`,
        `  湿度 ${weatherCache.humidity}%  风 ${weatherCache.windSpeed}km/h`,
        `  更新于 ${age} 分钟前`,
      );
    } else {
      lines.push('  (天气数据获取中...)');
    }

    lines.push(
      '',
      '  /weather [城市]  查询天气',
      '  /time            多时区时间',
      '  /date            月历',
    );
    return lines;
  },

  // ── MCP Skills ────────────────────────────────────────────────────────────
  skills: [
    defineSkill(
      'weather-time',
      '获取天气信息和时间',
      [
        {
          name: 'get_weather',
          description: '获取指定城市的实时天气',
          params: {
            city: { type: 'string', description: '城市名 (中英文均可, 如 北京, Shanghai)' },
          },
          handler: async (input) => {
            const city = String(input['city'] ?? lastCity);
            const w = await fetchWeather(city);
            if (!w) return { content: `无法获取 "${city}" 天气`, isError: true };
            weatherCache = w;
            const { desc, icon } = getWeatherInfo(w.weatherCode, w.isDay);
            return {
              content: JSON.stringify({
                city: w.displayName,
                temperature: w.temp,
                feelsLike: w.feelsLike,
                humidity: w.humidity,
                windSpeed: w.windSpeed,
                condition: desc,
                icon,
              }),
            };
          },
        },
        {
          name: 'get_current_time',
          description: '获取当前时间',
          params: {
            timezone: { type: 'string', description: '时区 (如 Asia/Shanghai), 不填则返回本地时间', required: false },
          },
          handler: async (input) => {
            const tz = input['timezone'] ? String(input['timezone']) : undefined;
            return {
              content: JSON.stringify({
                time: formatTime(tz),
                date: formatDate(),
                timestamp: Date.now(),
              }),
            };
          },
        },
      ]
    ),
  ],
});
