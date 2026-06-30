/**
 * TTL 内存缓存工具
 * 用于实时数据（tasks/members/deliverables）的短期缓存，减少重复云调用
 *
 * 使用示例：
 *   const tasks = await withCache('getTasks_teamX', 30000, () => getTasks(...))
 *   // 写操作后：
 *   invalidateCache('getTasks')
 *   invalidateAllCache()  // 退出登录时
 */

// Map<key, { data, time }>
const _store = new Map()

/**
 * 带 TTL 的缓存读取
 * @param {string}   key  缓存键（需包含队伍ID等区分维度）
 * @param {number}   ttl  有效期（毫秒），默认 30s
 * @param {Function} fn   数据获取函数，仅缓存 miss 时调用
 * @returns {Promise<any>}
 */
async function withCache(key, ttl, fn) {
  const now = Date.now()
  const entry = _store.get(key)
  if (entry && (now - entry.time) < ttl) {
    return entry.data
  }
  const data = await fn()
  _store.set(key, { data, time: now })
  return data
}

/**
 * 失效匹配前缀的缓存
 * @param {string} prefix 键前缀，如 'getTasks'、'getMembers'
 */
function invalidateCache(prefix) {
  if (!prefix) return
  for (const key of _store.keys()) {
    if (key.startsWith(prefix)) {
      _store.delete(key)
    }
  }
}

/**
 * 失效所有缓存（退出登录时调用）
 */
function invalidateAllCache() {
  _store.clear()
}

module.exports = {
  withCache,
  invalidateCache,
  invalidateAllCache
}
