export function getSyncStatusMeta(record = {}) {
  const scope = String(record.workspace_scope || '').trim();
  const status = String(record.sync_status || '').trim();
  if (scope === 'team' || status === 'mirror') {
    return { label: '团队镜像', className: 'sync-status--mirror' };
  }
  if (status === 'published') {
    return { label: '已发布团队', className: 'sync-status--published' };
  }
  if (status === 'backup' || status === 'backed_up' || status === 'synced') {
    return { label: '已备份个人云端', className: 'sync-status--backup' };
  }
  return { label: '本地未同步', className: 'sync-status--local' };
}

export function isTeamMirrorRecord(record = {}) {
  return String(record.workspace_scope || '').trim() === 'team' || String(record.sync_status || '').trim() === 'mirror';
}
