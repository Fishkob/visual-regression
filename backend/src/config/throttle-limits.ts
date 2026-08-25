// Joi defaults for the route-scoped throttles. The effective limits are read
// DI-backed from AppConfigService at module init (throttle-config.module.ts),
// so env values are honored by the actual limiter; the Joi schema in
// env.validation.ts imports these defaults so the validated schema and the
// runtime limits cannot drift.
export const LOGIN_THROTTLE_DEFAULTS = { limit: 5, ttl: 60 } as const;
export const LOG_THROTTLE_DEFAULTS = { limit: 100, ttl: 60 } as const;
