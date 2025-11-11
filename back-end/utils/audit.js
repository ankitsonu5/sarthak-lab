const AuditLog = require('../models/AuditLog');
const os = require('os');

// Flatten nested objects into dot-path keys for a shallow, readable diff
function flatten(obj, prefix = '', out = {}) {
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      flatten(v, path, out);
    } else {
      out[path] = v;
    }
  }
  return out;
}

function buildDiff(beforeDoc = {}, afterDoc = {}, whitelist) {
  const before = flatten(beforeDoc);
  const after = flatten(afterDoc);
  const diff = {};
  const keys = whitelist && Array.isArray(whitelist) ? whitelist : Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    // stringify arrays/objects for simple comparison; Dates compared by value
    const norm = (x) => x instanceof Date ? x.toISOString() : (typeof x === 'object' ? JSON.stringify(x) : x);
    if (norm(b) !== norm(a)) {
      diff[k] = { before: b, after: a };
    }
  }
  return diff;
}

function actorFromReq(req) {
  const user = req.user || {};
  return {
    userId: (user.id || user._id || '').toString(),
    role: user.role || undefined,
    name: user.name || user.email || undefined,
  };
}

async function recordAudit({ req, entityType, entityId, action, beforeDoc, afterDoc, whitelist, meta }) {
  try {
    const diff = action === 'UPDATE' ? buildDiff(beforeDoc, afterDoc, whitelist) : {};
    const by = actorFromReq(req);
    const payload = {
      entityType,
      entityId: (entityId || '').toString(),
      action,
      by,
      diff,
      meta: { ...(meta || {}), host: os.hostname() },
      at: new Date()
    };
    await AuditLog.create(payload);
  } catch (e) {
    // Never block main flow on audit failure
    console.warn('⚠️ Audit record failed:', e?.message);
  }
}

module.exports = { recordAudit, buildDiff };

