function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function summarizePrimitive(beforeValue, afterValue) {
  if (beforeValue === undefined && afterValue !== undefined) return 'added';
  if (beforeValue !== undefined && afterValue === undefined) return 'removed';
  return 'updated';
}

function summarizeChanges(before, after) {
  const beforeObj = isPlainObject(before) ? before : {};
  const afterObj = isPlainObject(after) ? after : {};
  const keys = [...new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])];
  const changes = [];

  for (const key of keys) {
    const previous = beforeObj[key];
    const current = afterObj[key];
    if (JSON.stringify(previous) === JSON.stringify(current)) continue;
    changes.push({
      field: key,
      changeType: summarizePrimitive(previous, current),
      before: previous === undefined ? null : previous,
      after: current === undefined ? null : current,
    });
  }

  return changes;
}

module.exports = {
  summarizeChanges,
};
