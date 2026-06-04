import { useState, useEffect } from 'react';
import { List, Dialog, Toast, Button, Selector } from 'antd-mobile';
import { db } from '../db/database';
import { useAppStore } from '../stores/useAppStore';
import { useTradeStore } from '../stores/useTradeStore';
import { parseTradesFile } from '../utils/importTrades';
import './SettingsPage.css';

function SettingsPage() {
  const { isDbPersistent, theme, colorConvention, setTheme, setColorConvention } = useAppStore();
  const { stats, refreshAll } = useTradeStore();
  const [storageInfo, setStorageInfo] = useState(null);

  useEffect(() => {
    // Get storage estimate
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        setStorageInfo({
          used: formatBytes(est.usage || 0),
          quota: formatBytes(est.quota || 0),
          percent: ((est.usage / est.quota) * 100).toFixed(1),
        });
      });
    }
  }, []);

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async function handleExport() {
    try {
      Toast.show({ icon: 'loading', content: '正在导出...' });
      const result = await db.exportDB();

      let blob, filename;
      if (result.format === 'json') {
        blob = new Blob([result.data], { type: 'application/json' });
        filename = `invest_brain_backup_${new Date().toISOString().slice(0, 10)}.json`;
      } else {
        blob = new Blob([result.data], { type: 'application/octet-stream' });
        filename = `invest_brain_backup_${new Date().toISOString().slice(0, 10)}.db`;
      }

      // Download file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      Toast.show({ icon: 'success', content: '导出成功' });
    } catch (err) {
      Toast.show({ icon: 'fail', content: '导出失败: ' + err.message });
    }
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.db';

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const confirmed = await Dialog.confirm({
        title: '确认导入',
        content: `导入 "${file.name}" 将覆盖所有现有数据。此操作不可撤销。确定继续？`,
        confirmText: '确认导入',
        cancelText: '取消',
      });

      if (!confirmed) return;

      try {
        Toast.show({ icon: 'loading', content: '正在导入...' });

        const text = await file.text();
        await db.importDB(text);
        await refreshAll();

        Toast.show({ icon: 'success', content: '导入成功' });
      } catch (err) {
        Toast.show({ icon: 'fail', content: '导入失败: ' + err.message });
      }
    };

    input.click();
  }

  async function handleImportTrades() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel';

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        Toast.show({ icon: 'loading', content: '正在读取...' });
        const trades = await parseTradesFile(file);

        if (trades.length === 0) {
          Toast.show({ icon: 'fail', content: '未找到有效的交易记录' });
          return;
        }

        const confirmed = await Dialog.confirm({
          title: '确认导入',
          content: `共解析到 ${trades.length} 条交易记录。是否确认导入？`,
          confirmText: '确认导入',
          cancelText: '取消',
        });

        if (!confirmed) return;

        Toast.show({ icon: 'loading', content: '正在导入...' });
        let successCount = 0;
        let failCount = 0;
        const errors = [];

        for (const trade of trades) {
          try {
            await db.upsertAsset({
              id: trade.asset_id,
              symbol: trade.symbol,
              name: trade.asset_name || '',
              type: trade.asset_type || 'STOCK',
            });
            await db.addTrade(trade);
            successCount++;
          } catch (err) {
            failCount++;
            errors.push(`${trade.symbol}: ${err.message || '写入失败'}`);
          }
        }
        await refreshAll();

        if (failCount === 0) {
          Toast.show({ icon: 'success', content: `成功导入 ${successCount} 条记录` });
        } else if (successCount > 0) {
          Toast.show({ icon: 'success', content: `导入完成: 成功 ${successCount} 条, 失败 ${failCount} 条` });
          Dialog.alert({
            header: <span style={{ color: 'var(--color-loss)' }}>部分导入失败</span>,
            content: (
              <div style={{ textAlign: 'left', maxHeight: '200px', overflowY: 'auto' }}>
                <p>以下记录导入失败：</p>
                <ul style={{ paddingLeft: '20px', margin: '8px 0', color: 'var(--color-text-secondary)' }}>
                  {errors.map((err, idx) => <li key={idx}>{err}</li>)}
                </ul>
              </div>
            ),
            confirmText: '我知道了',
          });
        } else {
          Dialog.alert({
            header: <span style={{ color: 'var(--color-loss)' }}>导入失败</span>,
            content: (
              <div style={{ textAlign: 'left' }}>
                <p>全部 ${failCount} 条记录导入失败：</p>
                <ul style={{ paddingLeft: '20px', margin: '8px 0', color: 'var(--color-text-secondary)' }}>
                  {errors.map((err, idx) => <li key={idx}>{err}</li>)}
                </ul>
              </div>
            ),
            confirmText: '关闭',
          });
        }
      } catch (err) {
        Toast.show({ icon: 'fail', content: '导入失败: ' + err.message });
      }
    };

    input.click();
  }

  async function handleClearData() {
    Dialog.show({
      title: '⚠️ 清除所有数据',
      content: '此操作将永久删除所有交易记录、决策和信息。请确保已备份数据。',
      closeOnAction: true,
      actions: [
        { key: 'cancel', text: '取消' },
        { 
          key: 'clear', 
          text: '确认清除', 
          danger: true,
          onClick: async () => {
            try {
              Toast.show({ icon: 'loading', content: '正在清除...' });
              const tables = ['reviews', 'decision_info_links', 'trades', 'decisions', 'informations', 'assets'];
              for (const table of tables) {
                await db.exec(`DELETE FROM ${table}`);
              }
              await refreshAll();
              Toast.show({ icon: 'success', content: '数据已清除' });
            } catch (err) {
              Toast.show({ icon: 'fail', content: '清除失败: ' + err.message });
            }
          }
        }
      ]
    });
  }

  return (
    <div className="page settings-page">
      <div className="page-header">
        <h1 className="page-header__title">设置</h1>
        <p className="page-header__subtitle">数据管理与应用配置</p>
      </div>

      {/* Data Statistics */}
      <div className="section">
        <div className="section__title">数据概览</div>
        <div className="stats-grid">
          <div className="stats-grid__item glass-card">
            <div className="stats-grid__value">{stats.asset_count || 0}</div>
            <div className="stats-grid__label">资产</div>
          </div>
          <div className="stats-grid__item glass-card">
            <div className="stats-grid__value">{stats.trade_count || 0}</div>
            <div className="stats-grid__label">交易</div>
          </div>
          <div className="stats-grid__item glass-card">
            <div className="stats-grid__value">{stats.decision_count || 0}</div>
            <div className="stats-grid__label">决策</div>
          </div>
          <div className="stats-grid__item glass-card">
            <div className="stats-grid__value">{stats.review_count || 0}</div>
            <div className="stats-grid__label">复盘</div>
          </div>
        </div>
      </div>

      {/* App Settings */}
      <div className="section">
        <div className="section__title">应用设置</div>
        <div className="settings-card glass-card">
          <div className="settings-card__row">
            <span className="settings-card__icon">🎨</span>
            <div className="settings-card__content">
              <div className="settings-card__label">颜色主题</div>
            </div>
            <Selector
              options={[
                { label: '深色', value: 'dark' },
                { label: '浅色', value: 'light' },
              ]}
              value={[theme]}
              onChange={v => { if (v.length) setTheme(v[0]); }}
              style={{ '--padding': '4px 12px' }}
            />
          </div>
          <div className="settings-card__divider" />
          <div className="settings-card__row">
            <span className="settings-card__icon">📊</span>
            <div className="settings-card__content">
              <div className="settings-card__label">涨跌颜色</div>
            </div>
            <Selector
              options={[
                { label: '绿涨红跌', value: 'green-up' },
                { label: '红涨绿跌', value: 'red-up' },
              ]}
              value={[colorConvention]}
              onChange={v => { if (v.length) setColorConvention(v[0]); }}
              style={{ '--padding': '4px 12px' }}
            />
          </div>
        </div>
      </div>

      {/* Backup & Restore */}
      <div className="section">
        <div className="section__title">数据备份</div>
        <div className="settings-card glass-card">
          <div className="settings-card__row" onClick={handleExport}>
            <span className="settings-card__icon">📤</span>
            <div className="settings-card__content">
              <div className="settings-card__label">导出备份</div>
              <div className="settings-card__desc">将所有数据导出为 JSON 文件</div>
            </div>
            <span className="settings-card__arrow">›</span>
          </div>
          <div className="settings-card__divider" />
          <div className="settings-card__row" onClick={handleImport}>
            <span className="settings-card__icon">📥</span>
            <div className="settings-card__content">
              <div className="settings-card__label">导入恢复</div>
              <div className="settings-card__desc">从备份文件恢复数据</div>
            </div>
            <span className="settings-card__arrow">›</span>
          </div>
          <div className="settings-card__divider" />
          <div className="settings-card__row" onClick={handleImportTrades}>
            <span className="settings-card__icon">📈</span>
            <div className="settings-card__content">
              <div className="settings-card__label">导入交易记录 (CSV/Excel)</div>
              <div className="settings-card__desc">批量导入历史交易数据</div>
            </div>
            <span className="settings-card__arrow">›</span>
          </div>
        </div>
      </div>

      {/* Storage Info */}
      <div className="section">
        <div className="section__title">存储状态</div>
        <div className="settings-card glass-card">
          <div className="settings-card__row">
            <span className="settings-card__icon">💾</span>
            <div className="settings-card__content">
              <div className="settings-card__label">数据持久化</div>
              <div className="settings-card__desc">
                {isDbPersistent ? (
                  <span className="text-profit">✓ OPFS 持久化存储已启用</span>
                ) : (
                  <span className="text-loss">⚠ 使用内存存储（关闭后数据可能丢失）</span>
                )}
              </div>
            </div>
          </div>
          {storageInfo && (
            <>
              <div className="settings-card__divider" />
              <div className="settings-card__row">
                <span className="settings-card__icon">📊</span>
                <div className="settings-card__content">
                  <div className="settings-card__label">存储用量</div>
                  <div className="settings-card__desc">
                    已用 {storageInfo.used} / {storageInfo.quota} ({storageInfo.percent}%)
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="section">
        <div className="section__title text-loss">危险操作</div>
        <div className="settings-card glass-card">
          <div className="settings-card__row settings-card__row--danger" onClick={handleClearData}>
            <span className="settings-card__icon">🗑️</span>
            <div className="settings-card__content">
              <div className="settings-card__label text-loss">清除所有数据</div>
              <div className="settings-card__desc">永久删除所有记录（不可恢复）</div>
            </div>
            <span className="settings-card__arrow">›</span>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="settings-about">
          <div className="settings-about__logo">🧠</div>
          <div className="settings-about__name">InvestBrain</div>
          <div className="settings-about__version">v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}</div>
          <div className="settings-about__build-time" style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            最后更新: {typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'Dev Mode'}
          </div>
          <div className="settings-about__desc">
            本地优先 · 纯单机 · PWA 投资决策闭环系统
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
