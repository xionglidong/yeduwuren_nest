/**
 * http.js — 全局 HTTP 请求拦截与 NestJS 响应自动解包工具
 * 自动适配 NestJS 框架返回的 { code: 200, message: "success", data: ... } 格式
 */
(function () {
  const originalFetch = window.fetch;
  if (!originalFetch) return;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const originalJson = response.json.bind(response);

    response.json = async function () {
      const result = await originalJson();
      if (
        result !== null &&
        typeof result === 'object' &&
        'code' in result &&
        'data' in result &&
        ('message' in result || 'timestamp' in result)
      ) {
        return result.data;
      }
      return result;
    };

    return response;
  };
})();
