import { useState, useEffect } from 'react';
import { List, Dialog, Toast, Button, Selector, Input } from 'antd-mobile';
import { db } from '../db/database';
import { useAppStore } from '../stores/useAppStore';
import { useTradeStore } from '../stores/useTradeStore';
import { parseTradesFile } from '../utils/importTrades';
import { restoreAutoBackup } from '../utils/autoBackup';
import './SettingsPage.css';

function AgentLogo() {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="智能体">
      <path
        className="settings-about__logo-halo"
        d="M24 4 40.45 13.5v19L24 42 7.55 32.5v-19L24 4Z"
      />
      <path
        className="settings-about__logo-shell"
        d="M24 7.8 37.16 15.4v15.2L24 38.2 10.84 30.6V15.4L24 7.8Z"
      />
      <path
        className="settings-about__logo-face"
        d="M16 20.2c0-3.2 2.6-5.8 5.8-5.8h4.4c3.2 0 5.8 2.6 5.8 5.8v4.9c0 3.2-2.6 5.8-5.8 5.8h-4.4c-3.2 0-5.8-2.6-5.8-5.8v-4.9Z"
      />
      <path
        className="settings-about__logo-line"
        d="M24 10.8v4.2M17.6 33.3l3-3M30.4 33.3l-3-3"
      />
      <circle className="settings-about__logo-eye" cx="21" cy="22.7" r="1.7" />
      <circle className="settings-about__logo-eye" cx="29" cy="22.7" r="1.7" />
      <path className="settings-about__logo-mouth" d="M21.5 27c1.8 1.3 4.2 1.3 6 0" />
      <circle className="settings-about__logo-node" cx="24" cy="10.8" r="2.2" />
    </svg>
  );
}

function SettingsPage() {
  const { 
    isDbPersistent, 
    theme, 
    colorConvention, 
    setTheme, 
    setColorConvention,
    geminiApiKey,
    saveGeminiApiKey,
    syncUserId,
    syncSecret,
    saveSyncConfig,
    streamlitUrl,
    setStreamlitUrl
  } = useAppStore();

  const { stats, refreshAll } = useTradeStore();
  const [storageInfo, setStorageInfo] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState(geminiApiKey);
  const [streamlitUrlInput, setStreamlitUrlInput] = useState(streamlitUrl);
  const [syncUserIdInput, setSyncUserIdInput] = useState(syncUserId);
  const [syncSecretInput, setSyncSecretInput] = useState(syncSecret);
  const [autoSync, setAutoSync] = useState(localStorage.getItem('invest_auto_sync') === 'true');
  const [lastBackupTime, setLastBackupTime] = useState(localStorage.getItem('ib_last_autobackup_time'));

  useEffect(() => {
    setApiKeyInput(geminiApiKey);
  }, [geminiApiKey]);

  useEffect(() => {
    setSyncUserIdInput(syncUserId);
    setSyncSecretInput(syncSecret);
  }, [syncUserId, syncSecret]);

  useEffect(() => {
    setStreamlitUrlInput(streamlitUrl);
  }, [streamlitUrl]);

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
        title: '确认导入并覆盖',
        content: `全量恢复将清除当前所有数据并导入 "${file.name}"。此操作不可撤销。确定继续？`,
        confirmText: '确认覆盖',
        cancelText: '取消',
      });

      if (!confirmed) return;

      try {
        Toast.show({ icon: 'loading', content: '正在恢复备份...' });

        const text = await file.text();
        await db.importDB(text, false); // merge = false
        await refreshAll();

        Toast.show({ icon: 'success', content: '恢复成功' });
      } catch (err) {
        Toast.show({ icon: 'fail', content: '恢复失败: ' + err.message });
      }
    };

    input.click();
  }

  async function handleMergeData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const confirmed = await Dialog.confirm({
        title: '合并团队数据',
        content: `将 "${file.name}" 中的数据合并到当前数据库。如果有相同记录将被覆盖更新，不会删除现有数据。`,
        confirmText: '确认合并',
        cancelText: '取消',
      });

      if (!confirmed) return;

      try {
        Toast.show({ icon: 'loading', content: '正在合并数据...' });

        const text = await file.text();
        const res = await db.importDB(text, true); // merge = true
        
        if (res.success) {
          await refreshAll();
          Toast.show({ icon: 'success', content: '合并成功' });
        } else {
          throw new Error(res.error || '合并过程出错');
        }
      } catch (err) {
        Toast.show({ icon: 'fail', content: '合并失败: ' + err.message });
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

  async function handleSaveApiKey() {
    try {
      await saveGeminiApiKey(apiKeyInput);
      Toast.show({ icon: 'success', content: '已保存' });
    } catch (e) {
      Toast.show({ icon: 'fail', content: '保存失败' });
    }
  }

  async function handleSaveSyncConfig() {
    try {
      await saveSyncConfig(syncUserIdInput, syncSecretInput);
      Toast.show({ icon: 'success', content: '云端配置已保存' });
    } catch (e) {
      Toast.show({ icon: 'fail', content: '保存失败' });
    }
  }

  async function handleSyncUpload() {
    if (!syncUserId || !syncSecret) {
      Toast.show({ icon: 'fail', content: '请先填写并保存同步凭证' });
      return;
    }
    try {
      Toast.show({ icon: 'loading', content: '打包本地数据...', duration: 0 });
      const result = await db.exportDB();
      const exportData = JSON.parse(result.data);

      Toast.show({ icon: 'loading', content: '上传至云端...', duration: 0 });
      const res = await fetch('/api/sync-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${encodeURIComponent(syncSecret)}`
        },
        body: JSON.stringify({
          userId: syncUserId,
          data: exportData
        })
      });

      let responseData;
      let rawText = '';
      try {
        rawText = await res.text();
        responseData = JSON.parse(rawText);
      } catch (e) {
        throw new Error(`无法解析服务器响应: ${rawText.substring(0, 100)}... (状态码: ${res.status})`);
      }
      if (!res.ok) throw new Error(responseData?.error || '上传失败');

      Toast.clear();
      Toast.show({ icon: 'success', content: '已成功备份至云端' });
    } catch (e) {
      Toast.clear();
      Toast.show({ icon: 'fail', content: e.message });
    }
  }

  async function handleSyncDownload() {
    if (!syncSecret) {
      Toast.show({ icon: 'fail', content: '请先填写同步暗号' });
      return;
    }
    try {
      Toast.show({ icon: 'loading', content: '拉取全员云端数据...', duration: 0 });
      const res = await fetch('/api/sync-download', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${encodeURIComponent(syncSecret)}`
        }
      });

      let responseData;
      try {
        responseData = await res.json();
      } catch (e) {
        throw new Error('服务器端未正确配置数据库，或数据库地址格式错误。');
      }
      if (!res.ok) throw new Error(responseData?.error || '拉取失败');

      if (!responseData.mergedData || responseData.usersFound === 0) {
        Toast.clear();
        Toast.show({ content: '云端暂无数据' });
        return;
      }

      Toast.show({ icon: 'loading', content: `合并 ${responseData.usersFound} 位成员的数据...`, duration: 0 });
      
      const jsonString = JSON.stringify(responseData.mergedData);
      await db.importDB(jsonString, true); // true indicates merge mode
      
      await refreshAll();
      Toast.clear();
      Toast.show({ icon: 'success', content: '全员数据同步合并成功' });
    } catch (e) {
      Toast.clear();
      Toast.show({ icon: 'fail', content: e.message });
    }
  }

  async function handleRestoreMyData() {
    if (!syncUserIdInput || !syncSecretInput) {
      Toast.show({ icon: 'fail', content: '请先填写同步凭证' });
      return;
    }
    try {
      Toast.show({ icon: 'loading', content: '拉取您的云端备份...', duration: 0 });
      const res = await fetch(`/api/sync-download?userId=${encodeURIComponent(syncUserIdInput)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${encodeURIComponent(syncSecretInput)}`
        }
      });

      let responseData;
      try {
        responseData = await res.json();
      } catch (e) {
        throw new Error('服务器端未正确配置数据库，或数据库地址格式错误。');
      }
      if (!res.ok) throw new Error(responseData?.error || '拉取失败');

      if (!responseData.mergedData || responseData.usersFound === 0) {
        Toast.clear();
        Toast.show({ content: '未找到您的云端备份' });
        return;
      }

      Toast.show({ icon: 'loading', content: '恢复并合并数据...', duration: 0 });
      
      const jsonString = JSON.stringify(responseData.mergedData);
      await db.importDB(jsonString, true); // true indicates merge mode
      
      await refreshAll();
      Toast.clear();
      Toast.show({ icon: 'success', content: '您的数据已成功恢复' });
    } catch (e) {
      Toast.clear();
      Toast.show({ icon: 'fail', content: e.message });
    }
  }

  async function handleRestoreRedundantBackup() {
    const confirmed = await Dialog.confirm({
      title: '确认从冗余备份恢复？',
      content: '该操作将以您设备上最后一次自动备份的数据覆盖当前的数据库。此操作不可撤销，是否继续？',
      confirmText: '确认恢复',
      cancelText: '取消',
    });

    if (!confirmed) return;

    try {
      Toast.show({ icon: 'loading', content: '正在恢复数据...' });
      const res = await restoreAutoBackup();
      if (res.success) {
        await refreshAll();
        Toast.show({ icon: 'success', content: res.message });
        setLastBackupTime(localStorage.getItem('ib_last_autobackup_time'));
      }
    } catch (err) {
      Dialog.alert({
        header: <span style={{ color: 'var(--color-loss)' }}>恢复失败</span>,
        content: err.message || '未找到可用的自动备份，或恢复过程中发生错误。',
        confirmText: '我知道了',
      });
    }
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

      {/* API Key Configuration */}
      <div className="section">
        <div className="section__title">大模型 API 配置 (OCR与智能总结)</div>
        <div className="settings-card glass-card">
          <div className="settings-card__row" style={{ cursor: 'default' }}>
            <span className="settings-card__icon">🔑</span>
            <div className="settings-card__content">
              <div className="settings-card__label">本地 Gemini API Key</div>
              <div className="settings-card__desc">
                配有内置 Key，在此处配置您私有的 Key 可享受独立配额（优先存储于本地 SQLite 中，留空则默认使用内置 Key）
              </div>
            </div>
          </div>
          <div className="settings-card__input-row">
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="输入以 AIzaSy 开头的 Key..."
                value={apiKeyInput}
                onChange={setApiKeyInput}
                type="password"
                clearable
              />
            </div>
            <Button
              color="primary"
              size="small"
              fill="solid"
              onClick={handleSaveApiKey}
              style={{ borderRadius: '6px' }}
            >
              保存
            </Button>
          </div>
        </div>
      </div>

      {/* Streamlit AI Configuration */}
      <div className="section">
        <div className="section__title">AI 舆情分析引擎 (Streamlit)</div>
        <div className="settings-card glass-card">
          <div className="settings-card__row" style={{ cursor: 'default' }}>
            <span className="settings-card__icon settings-card__agent-icon">
              <AgentLogo />
            </span>
            <div className="settings-card__content">
              <div className="settings-card__label">Streamlit 部署地址</div>
              <div className="settings-card__desc">
                配置您部署在 Streamlit Cloud 的分析引擎地址，以便在行情详情页一键调用
              </div>
            </div>
          </div>
          <div className="settings-card__input-row">
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="https://xxx.streamlit.app"
                value={streamlitUrlInput}
                onChange={setStreamlitUrlInput}
                clearable
              />
            </div>
            <Button
              color="primary"
              size="small"
              fill="solid"
              onClick={() => {
                setStreamlitUrl(streamlitUrlInput);
                Toast.show({ icon: 'success', content: '引擎地址已保存' });
              }}
              style={{ borderRadius: '6px' }}
            >
              保存
            </Button>
          </div>
        </div>
      </div>

      {/* Cloud Sync Configuration */}
      <div className="section">
        <div className="section__title">多用户与云端协作 (Phase 2)</div>
        <div className="settings-card glass-card">
          <div className="settings-card__row" style={{ cursor: 'default' }}>
            <span className="settings-card__icon">☁️</span>
            <div className="settings-card__content">
              <div className="settings-card__label">团队同步凭证</div>
              <div className="settings-card__desc">
                输入您的花名代号以及团队的同步暗号，即可实现一键云端合并数据，永不丢失。
              </div>
            </div>
          </div>
          <div className="settings-card__input-row" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="您的代号 (如: Feng)"
                value={syncUserIdInput}
                onChange={setSyncUserIdInput}
                clearable
              />
            </div>
          </div>

          <div className="settings-card__divider" />
          <div className="settings-card__row" onClick={handleSyncUpload}>
            <span className="settings-card__icon">🚀</span>
            <div className="settings-card__content">
              <div className="settings-card__label">备份至云端</div>
              <div className="settings-card__desc">将本地数据一键推送到团队云端空间</div>
            </div>
            <span className="settings-card__arrow">›</span>
          </div>

          <div className="settings-card__divider" />
          <div className="settings-card__row" onClick={handleRestoreMyData}>
            <span className="settings-card__icon">🔄</span>
            <div className="settings-card__content">
              <div className="settings-card__label">恢复我的云端数据</div>
              <div className="settings-card__desc">仅拉取我自己的备份并覆盖到本地</div>
            </div>
            <span className="settings-card__arrow">›</span>
          </div>

          <div className="settings-card__divider" />
          <div className="settings-card__row" onClick={handleSyncDownload}>
            <span className="settings-card__icon">📥</span>
            <div className="settings-card__content">
              <div className="settings-card__label">拉取全员云端数据 (Admin)</div>
              <div className="settings-card__desc">拉取所有成员数据并在本地无损智能合并</div>
            </div>
            <span className="settings-card__arrow">›</span>
          </div>
        </div>
      </div>

      {/* Backup & Restore */}
      <div className="section">
        <div className="section__title">数据备份与冗余</div>
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
              <div className="settings-card__label">全量导入覆盖 (恢复)</div>
              <div className="settings-card__desc">从备份文件恢复数据 (将清空现有数据)</div>
            </div>
            <span className="settings-card__arrow">›</span>
          </div>
          <div className="settings-card__divider" />
          <div className="settings-card__row" onClick={handleMergeData}>
            <span className="settings-card__icon">🤝</span>
            <div className="settings-card__content">
              <div className="settings-card__label">合并团队数据 (JSON)</div>
              <div className="settings-card__desc">导入他人的导出的 JSON，并与本地数据合并</div>
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
          <div className="settings-card__divider" />
          <div className="settings-card__row" onClick={handleRestoreRedundantBackup}>
            <span className="settings-card__icon">🛡️</span>
            <div className="settings-card__content">
              <div className="settings-card__label">从冗余备份恢复 (IndexedDB)</div>
              <div className="settings-card__desc">
                {lastBackupTime ? (
                  <span className="text-profit">自动同步中，最后备份: {new Date(lastBackupTime).toLocaleString()}</span>
                ) : (
                  <span>暂无自动备份数据（写入数据时将自动触发）</span>
                )}
              </div>
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
          <div className="settings-about__logo">
            <AgentLogo />
          </div>
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
