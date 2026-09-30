/** Re-export so scripts and tests can import the cache from the server path. */
export {
  cacheCounters,
  clearMemoryCacheForTests,
  fetchThroughCache,
  flushCacheRefreshes,
  resetOddAlertsCacheForTests,
  setCacheNowForTests,
  setRedisForTests,
  type CachedBody,
  type CacheStatus,
  type RedisLike,
  type UpstreamBody,
} from '../services/oddAlertsServerCache';
