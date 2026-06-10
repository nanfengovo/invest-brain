import { useState, useEffect } from 'react';
import { List, Dialog, Toast, Button, Selector, Input } from 'antd-mobile';
import { db } from '../db/database';
import { useAppStore } from '../stores/useAppStore';
import { useTradeStore } from '../stores/useTradeStore';
import { parseTradesFile } from '../utils/importTrades';
import { attachDecisionRecommendations } from '../utils/decisionMatcher';
import { restoreAutoBackup } from '../utils/autoBackup';
import { syncCloudAlerts } from '../utils/cloudAlerts';
import { createTradeDeduper } from '../utils/tradeDeduplication';
import {
  AI_PROVIDER_OPTIONS,
  AI_TEXT_MODEL_OPTIONS,
  AI_VISION_MODEL_OPTIONS,
  DEFAULT_AI_PROVIDER_CONFIG,
  getModelDisplayName,
  getProviderDisplayName,
} from '../utils/aiProviders';
import './SettingsPage.css';

const PERSONAL_SYNC_TABLES = [
  'assets',
  'informations',
  'information_asset_links',
  'information_sector_links',
  'decisions',
  'decision_info_links',
  'reviews',
  'viewpoints',
  'trades',
  'price_alerts',
];
const TEAM_SYNC_TABLES = [
  'assets',
  'informations',
  'information_asset_links',
  'information_sector_links',
  'decisions',
  'decision_info_links',
  'viewpoints',
  'trades',
];

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
    nvidiaApiKey,
    saveNvidiaApiKey,
    aiProviderConfig,
    saveAiProviderConfig,
    syncUserId,
    syncSecret,
    workspaceScope,
    setWorkspaceScope,
    saveSyncConfig,
    streamlitUrl,
    setStreamlitUrl,
    notificationConfig,
    saveNotificationConfig,
    marketDataConfig,
    saveMarketDataConfig,
    shareBackgroundConfig,
    saveShareBackgroundConfig
  } = useAppStore();

  const { stats, refreshAll } = useTradeStore();
  const [storageInfo, setStorageInfo] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState(geminiApiKey);
  const [nvidiaApiKeyInput, setNvidiaApiKeyInput] = useState(nvidiaApiKey);
  const [aiProviderInput, setAiProviderInput] = useState(aiProviderConfig);
  const [streamlitUrlInput, setStreamlitUrlInput] = useState(streamlitUrl);
  const [syncUserIdInput, setSyncUserIdInput] = useState(syncUserId);
  const [syncSecretInput, setSyncSecretInput] = useState(syncSecret);
  const [notificationInput, setNotificationInput] = useState(notificationConfig);
  const [marketDataInput, setMarketDataInput] = useState(marketDataConfig);
  const [shareBackgroundInput, setShareBackgroundInput] = useState(shareBackgroundConfig);
  const [autoSync, setAutoSync] = useState(localStorage.getItem('invest_auto_sync') === 'true');
  const [lastBackupTime, setLastBackupTime] = useState(localStorage.getItem('ib_last_autobackup_time'));

  const currentAuthor = (syncUserId || syncUserIdInput || '').trim() || '未标记';
  const workspaceLabel = workspaceScope === 'team' ? '团队工作区' : '个人工作区';

  useEffect(() => {
    setApiKeyInput(geminiApiKey);
  }, [geminiApiKey]);

  useEffect(() => {
    setNvidiaApiKeyInput(nvidiaApiKey);
  }, [nvidiaApiKey]);

  useEffect(() => {
    setAiProviderInput(aiProviderConfig);
  }, [aiProviderConfig]);

  useEffect(() => {
    setSyncUserIdInput(syncUserId);
    setSyncSecretInput(syncSecret);
  }, [syncUserId, syncSecret]);

  useEffect(() => {
    setStreamlitUrlInput(streamlitUrl);
  }, [streamlitUrl]);

  useEffect(() => {
    setNotificationInput(notificationConfig);
  }, [notificationConfig]);

  useEffect(() => {
    setMarketDataInput(marketDataConfig);
  }, [marketDataConfig]);

  useEffect(() => {
    setShareBackgroundInput(shareBackgroundConfig);
  }, [shareBackgroundConfig]);

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
        content: `全量恢复将清除当前所有数据并导入 "${file.name}"，包括本地配置、个人数据和团队镜像。它不是团队合并操作，此操作不可撤销。确定继续？`,
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
        const res = await db.importDB(text, true, {
          allowedTables: TEAM_SYNC_TABLES,
          workspaceScope: 'team',
          sourceScope: 'team',
          teamMirror: true,
          syncStatus: 'synced',
        });
        
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

        const decisions = await db.getDecisions();
        const prepared = attachDecisionRecommendations(trades, decisions);
        const recommendationCount = prepared.filter((item) => item.recommendation).length;
        let tradesToImport = trades;

        if (recommendationCount > 0) {
          const useRecommendations = await Dialog.confirm({
            title: '采用推荐决策？',
            content: `系统按交易标的、时间和决策生命周期，为 ${recommendationCount} 条记录找到最可能的决策。采用后仍可在交易记录中手动修改；不采用也会继续导入。`,
            confirmText: '采用推荐导入',
            cancelText: '不关联导入',
          });
          if (useRecommendations) {
            tradesToImport = prepared.map((item) => item.trade);
          }
        }

        Toast.show({ icon: 'loading', content: '正在导入...' });
        let successCount = 0;
        let duplicateCount = 0;
        let failCount = 0;
        const errors = [];
        const existingTrades = await db.getTrades(5000, 0, workspaceScope);
        const deduper = createTradeDeduper(existingTrades, { author: currentAuthor });

        for (const trade of tradesToImport) {
          try {
            const tradeToSave = {
              ...trade,
              author: trade.author || currentAuthor,
            };
            if (deduper.isDuplicate(tradeToSave)) {
              duplicateCount++;
              continue;
            }
            await db.upsertAsset({
              id: trade.asset_id,
              symbol: trade.symbol,
              name: trade.asset_name || '',
              type: trade.asset_type || 'STOCK',
              strike_price: trade.strike_price || null,
              expiry_date: trade.expiry_date || null,
              underlying_symbol: trade.underlying_symbol || trade.symbol || null,
              option_type: trade.option_type || null,
              multiplier: trade.multiplier || (trade.asset_type === 'OPTION' ? 100 : 1),
            });
            await db.addTrade(tradeToSave);
            successCount++;
          } catch (err) {
            failCount++;
            errors.push(`${trade.symbol}: ${err.message || '写入失败'}`);
          }
        }
        await refreshAll();

        if (failCount === 0) {
          if (successCount === 0 && duplicateCount > 0) {
            Toast.show({ icon: 'success', content: `没有新增记录，已跳过重复 ${duplicateCount} 条` });
            return;
          }
          const duplicateText = duplicateCount > 0 ? `，已跳过重复 ${duplicateCount} 条` : '';
          Toast.show({ icon: 'success', content: `成功导入 ${successCount} 条记录${duplicateText}` });
        } else if (successCount > 0) {
          const duplicateText = duplicateCount > 0 ? `，跳过重复 ${duplicateCount} 条` : '';
          Toast.show({ icon: 'success', content: `导入完成: 成功 ${successCount} 条, 失败 ${failCount} 条${duplicateText}` });
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
      title: '⚠️ 清除核心业务数据',
      content: '此操作将永久删除交易、持仓、情报、观点、决策、复盘和价格提醒，但会保留 API Key、同步暗号、通知、市场数据和分享背景配置。请确保已备份数据。',
      closeOnAction: true,
      actions: [
        { key: 'cancel', text: '取消' },
        { 
          key: 'clear', 
          text: '确认清除业务数据', 
          danger: true,
          onClick: async () => {
            try {
              Toast.show({ icon: 'loading', content: '正在清除核心业务数据...' });
              await db.clearCoreData();
              await refreshAll();
              Toast.show({ icon: 'success', content: '核心业务数据已清除，配置已保留' });
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

  async function handleSaveAiProviderConfig() {
    try {
      const normalizedConfig = { ...DEFAULT_AI_PROVIDER_CONFIG, ...(aiProviderInput || {}) };
      await saveAiProviderConfig(normalizedConfig);
      await saveNvidiaApiKey(nvidiaApiKeyInput);
      setShareBackgroundInput((current) => ({
        ...current,
        nvidiaApiKey: String(nvidiaApiKeyInput || '').trim() || current.nvidiaApiKey || '',
      }));
      Toast.show({
        icon: 'success',
        content: `AI 配置已保存：${getProviderDisplayName(normalizedConfig.provider)} / ${getModelDisplayName(normalizedConfig.textModel)}`,
      });
    } catch (e) {
      Toast.show({ icon: 'fail', content: '保存失败' });
    }
  }

  async function handleSaveSyncConfig() {
    const normalizedUserId = syncUserIdInput.trim();
    const normalizedSecret = syncSecretInput.trim();

    if (!normalizedUserId || !normalizedSecret) {
      Toast.show({ icon: 'fail', content: '请填写代号和同步暗号' });
      return;
    }

    try {
      await saveSyncConfig(normalizedUserId, normalizedSecret);
      await syncCloudAlerts({
        notificationConfig: notificationInput,
        marketDataConfig: marketDataInput,
      });
      Toast.show({ icon: 'success', content: '云端配置已保存' });
    } catch (e) {
      Toast.show({ icon: 'fail', content: '保存失败' });
    }
  }

  async function handleSaveNotificationConfig() {
    try {
      await saveNotificationConfig(notificationInput);
      await syncCloudAlerts({
        notificationConfig: notificationInput,
        marketDataConfig: marketDataInput,
      });
      Toast.show({ icon: 'success', content: '提醒通道已保存' });
    } catch {
      Toast.show({ icon: 'fail', content: '保存失败' });
    }
  }

  async function handleTestNotification() {
    try {
      if (notificationInput.browserEnabled && 'Notification' in window) {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        if (Notification.permission === 'granted') {
          new Notification('InvestBrain 测试提醒', {
            body: '浏览器通知通道可用',
          });
        }
      }

      const channels = [
        notificationInput.emailEnabled ? 'email' : null,
        notificationInput.feishuEnabled ? 'feishu' : null,
      ].filter(Boolean);

      if (channels.length === 0) {
        Toast.show({ icon: 'success', content: '本地浏览器提醒已测试' });
        return;
      }

      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'InvestBrain 测试提醒',
          body: '这是一条来自价格提醒配置页的测试消息。',
          channels,
          feishuWebhook: notificationInput.feishuWebhook,
          email: {
            apiKey: notificationInput.emailApiKey,
            from: notificationInput.emailFrom,
            to: notificationInput.emailTo,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '发送失败');
      Toast.show({ icon: 'success', content: '测试消息已发送' });
    } catch (e) {
      Toast.show({ icon: 'fail', content: e.message || '测试失败' });
    }
  }

  async function handleSaveMarketDataConfig() {
    const normalizedMarketData = {
      ...marketDataInput,
      marketDataToken: String(marketDataInput.marketDataToken || '').trim(),
      tradierToken: String(marketDataInput.tradierToken || '').trim(),
      polygonToken: String(marketDataInput.polygonToken || '').trim(),
      longbridgeAppKey: String(marketDataInput.longbridgeAppKey || '').trim(),
      longbridgeAppSecret: String(marketDataInput.longbridgeAppSecret || '').trim(),
      longbridgeAccessToken: String(marketDataInput.longbridgeAccessToken || '').trim(),
    };

    try {
      await saveMarketDataConfig(normalizedMarketData);
      setMarketDataInput(normalizedMarketData);
      await syncCloudAlerts({
        notificationConfig: notificationInput,
        marketDataConfig: normalizedMarketData,
      });
      Toast.show({ icon: 'success', content: '行情数据源已保存' });
    } catch {
      Toast.show({ icon: 'fail', content: '保存失败' });
    }
  }

  async function handleSaveShareBackgroundConfig() {
    try {
      await saveShareBackgroundConfig(shareBackgroundInput);
      Toast.show({ icon: 'success', content: '分享背景配置已保存' });
    } catch {
      Toast.show({ icon: 'fail', content: '保存失败' });
    }
  }

  async function handleTestSyncConnection() {
    const normalizedSecret = syncSecretInput.trim();

    if (!normalizedSecret) {
      Toast.show({ icon: 'fail', content: '请先填写同步暗号' });
      return;
    }

    try {
      Toast.show({ icon: 'loading', content: '正在测试云端连接...', duration: 0 });

      const res = await fetch('/api/sync-download?userId=__ib_connection_test__', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${encodeURIComponent(normalizedSecret)}`
        }
      });

      let responseData;
      try {
        responseData = await res.json();
      } catch (e) {
        throw new Error('服务器响应异常，请检查部署状态');
      }

      if (!res.ok) {
        throw new Error(responseData?.error || '连接测试失败');
      }

      Toast.clear();
      Toast.show({ icon: 'success', content: '云端连接正常' });
    } catch (e) {
      Toast.clear();
      Toast.show({ icon: 'fail', content: e.message });
    }
  }

  async function handleSyncUpload(scope = 'personal') {
    if (!syncUserId || !syncSecret) {
      Toast.show({ icon: 'fail', content: '请先填写并保存同步凭证' });
      return;
    }
    const scopeLabel = scope === 'team' ? '团队空间' : '个人云端备份';
    try {
      Toast.show({ icon: 'loading', content: '标记当前提交人...', duration: 0 });
      await db.backfillTradeAuthor(syncUserId);
      await refreshAll();

      Toast.show({
        icon: 'loading',
        content: scope === 'team' ? '打包我的交易发布到团队...' : '打包我的个人工作区...',
        duration: 0,
      });
      const exportData = await db.exportTradeWorkspaceDump({
        author: syncUserId,
        scope: 'personal',
        targetScope: scope,
      });

      const tradeCount = exportData?.tables?.trades?.length || 0;
      const infoCount = exportData?.tables?.informations?.length || 0;
      const decisionCount = exportData?.tables?.decisions?.length || 0;
      const viewpointCount = exportData?.tables?.viewpoints?.length || 0;
      const totalCount = tradeCount + infoCount + decisionCount + viewpointCount;
      if (totalCount === 0) {
        Toast.clear();
        Toast.show({
          content: scope === 'team'
            ? '没有可发布到团队的数据，请先标记情报、决策或确认有个人交易记录'
            : '当前花名下仍没有可备份数据；已尝试认领未标记记录，请确认个人工作区有交易、情报、决策或观点',
        });
        return;
      }

      Toast.show({ icon: 'loading', content: `上传至${scopeLabel}...`, duration: 0 });
      const res = await fetch('/api/sync-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${encodeURIComponent(syncSecret)}`
        },
        body: JSON.stringify({
          userId: syncUserId,
          scope,
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

      await db.markWorkspaceSyncStatus({
        author: syncUserId,
        scope: 'personal',
        targetScope: scope,
      });
      await refreshAll();

      Toast.clear();
      Toast.show({
        icon: 'success',
        content: scope === 'team'
          ? `已发布到团队：交易 ${tradeCount}，情报 ${infoCount}，决策 ${decisionCount}，观点 ${viewpointCount}`
          : `个人云端备份已完成（${totalCount} 条）`,
      });
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
      Toast.show({ icon: 'loading', content: '拉取团队空间数据...', duration: 0 });
      const res = await fetch('/api/sync-download?scope=team', {
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

      Toast.show({ icon: 'loading', content: `刷新 ${responseData.usersFound} 位成员的团队镜像...`, duration: 0 });
      
      const jsonString = JSON.stringify(responseData.mergedData);
      await db.clearWorkspace('team');
      await db.importDB(jsonString, true, {
        allowedTables: TEAM_SYNC_TABLES,
        workspaceScope: 'team',
        sourceScope: 'team',
        teamMirror: true,
        syncStatus: 'synced',
      });
      
      await refreshAll();
      Toast.clear();
      Toast.show({ icon: 'success', content: '团队数据已更新，可切换到团队工作区查看' });
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
      const res = await fetch(`/api/sync-download?scope=personal&userId=${encodeURIComponent(syncUserIdInput)}`, {
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

      const confirmed = await Dialog.confirm({
        title: '确认恢复个人云端备份？',
        content: '恢复会把云端同 ID 的个人记录合并到本机；如果本机和云端都改过同一条记录，云端记录可能覆盖本机内容。团队镜像和私密配置不会被恢复覆盖。',
        confirmText: '确认恢复',
        cancelText: '取消',
      });
      if (!confirmed) {
        Toast.clear();
        return;
      }

      Toast.show({ icon: 'loading', content: '恢复并合并数据...', duration: 0 });
      
      const jsonString = JSON.stringify(responseData.mergedData);
      await db.importDB(jsonString, true, {
        allowedTables: PERSONAL_SYNC_TABLES,
        workspaceScope: 'personal',
        sourceScope: 'personal',
        currentAuthor: syncUserIdInput,
        restrictAuthor: syncUserIdInput,
      });
      
      await refreshAll();
      Toast.clear();
      Toast.show({ icon: 'success', content: '您的数据已成功恢复' });
    } catch (e) {
      Toast.clear();
      Toast.show({ icon: 'fail', content: e.message });
    }
  }

  async function handleWithdrawTeamData() {
    if (!syncUserId || !syncSecret) {
      Toast.show({ icon: 'fail', content: '请先填写并保存同步凭证' });
      return;
    }
    const confirmed = await Dialog.confirm({
      title: '撤回团队发布？',
      content: '将从云端团队空间删除当前花名发布的数据。其他成员下次拉取团队空间后，将不再看到您的团队镜像数据；个人云端备份不会受影响。',
      confirmText: '确认撤回',
      cancelText: '取消',
    });
    if (!confirmed) return;
    try {
      Toast.show({ icon: 'loading', content: '正在撤回团队发布...', duration: 0 });
      const res = await fetch('/api/sync-upload?action=withdraw-team&scope=team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${encodeURIComponent(syncSecret)}`
        },
        body: JSON.stringify({
          userId: syncUserId,
          scope: 'team',
        }),
      });
      const responseData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseData?.error || '撤回失败');
      Toast.clear();
      Toast.show({ icon: 'success', content: responseData?.message || '已撤回团队发布' });
    } catch (e) {
      Toast.clear();
      Toast.show({ icon: 'fail', content: e.message || '撤回团队发布失败' });
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
              className="settings-card__primary-action"
              color="primary"
              size="small"
              fill="solid"
              onClick={handleSaveApiKey}
            >
              保存
            </Button>
          </div>
        </div>
        <div className="settings-card glass-card">
          <div className="settings-card__row" style={{ cursor: 'default' }}>
            <span className="settings-card__icon">🧠</span>
            <div className="settings-card__content">
              <div className="settings-card__label">统一 AI 路由与 NVIDIA API Key</div>
              <div className="settings-card__desc">
                摘要、翻译、OCR、交易体检会优先使用本地配置；留空则使用服务端环境变量。每次调用都会返回实际使用的模型。
              </div>
            </div>
          </div>
          <div className="settings-card__input-row settings-card__input-row--stacked settings-ai-router">
            <div className="settings-ai-router__group settings-ai-router__group--provider">
              <div className="settings-ai-router__group-head">
                <span>路由策略</span>
                <em>{getProviderDisplayName(aiProviderInput.provider || 'auto')}</em>
              </div>
              <Selector
                className="settings-ai-router__selector settings-ai-router__selector--provider"
                columns={3}
                options={AI_PROVIDER_OPTIONS}
                value={[aiProviderInput.provider || 'auto']}
                onChange={(value) => {
                  if (!value.length) return;
                  setAiProviderInput((current) => ({ ...current, provider: value[0] }));
                }}
              />
            </div>
            <div className="settings-ai-router__group">
              <div className="settings-ai-router__group-head">
                <span>文本 / 翻译 / 诊断</span>
                <em>{getModelDisplayName(aiProviderInput.textModel || DEFAULT_AI_PROVIDER_CONFIG.textModel)}</em>
              </div>
              <Selector
                className="settings-ai-router__selector settings-ai-router__selector--model"
                columns={2}
                options={AI_TEXT_MODEL_OPTIONS.map((item) => ({
                  label: item.label,
                  value: item.value,
                  description: `${item.provider} · ${item.description}`,
                }))}
                value={[aiProviderInput.textModel || DEFAULT_AI_PROVIDER_CONFIG.textModel]}
                onChange={(value) => {
                  if (!value.length) return;
                  setAiProviderInput((current) => ({ ...current, textModel: value[0] }));
                }}
              />
            </div>
            <div className="settings-ai-router__group">
              <div className="settings-ai-router__group-head">
                <span>视觉 / OCR</span>
                <em>{getModelDisplayName(aiProviderInput.visionModel || DEFAULT_AI_PROVIDER_CONFIG.visionModel)}</em>
              </div>
              <Selector
                className="settings-ai-router__selector settings-ai-router__selector--model"
                columns={2}
                options={AI_VISION_MODEL_OPTIONS.map((item) => ({
                  label: item.label,
                  value: item.value,
                  description: `${item.provider} · ${item.description}`,
                }))}
                value={[aiProviderInput.visionModel || DEFAULT_AI_PROVIDER_CONFIG.visionModel]}
                onChange={(value) => {
                  if (!value.length) return;
                  setAiProviderInput((current) => ({ ...current, visionModel: value[0] }));
                }}
              />
            </div>
            <div className="settings-ai-router__group settings-ai-router__group--key">
              <div className="settings-ai-router__group-head">
                <span>NVIDIA API Key</span>
                <em>{nvidiaApiKeyInput ? '本地 Key 优先' : '内置 / 服务端 Key'}</em>
              </div>
              <div className="settings-card__input-wrapper">
                <Input
                  placeholder="nvapi-...（留空则使用内置/服务端 Key）"
                  value={nvidiaApiKeyInput}
                  onChange={setNvidiaApiKeyInput}
                  type="password"
                  clearable
                />
              </div>
            </div>
          </div>
          <div className="settings-card__actions-row">
            <Button
              className="settings-card__primary-action"
              color="primary"
              size="small"
              fill="solid"
              onClick={handleSaveAiProviderConfig}
            >
              保存 AI 路由
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
              className="settings-card__primary-action"
              color="primary"
              size="small"
              fill="solid"
              onClick={() => {
                setStreamlitUrl(streamlitUrlInput);
                Toast.show({ icon: 'success', content: '引擎地址已保存' });
              }}
            >
              保存
            </Button>
          </div>
        </div>
      </div>

      {/* Share Poster Background Configuration */}
      <div className="section">
        <div className="section__title">分享图背景生成</div>
        <div className="settings-card glass-card">
          <div className="settings-card__row" style={{ cursor: 'default' }}>
            <span className="settings-card__icon">🖼️</span>
            <div className="settings-card__content">
              <div className="settings-card__label">背景来源与 NVIDIA 模型</div>
              <div className="settings-card__desc">
                分享时可选择本地背景、上传图片或用 NVIDIA AI 生成背景；标题、收益和期权信息仍由本地 Canvas 绘制。
              </div>
            </div>
          </div>
          <div className="settings-card__input-row settings-card__input-row--stacked">
            <Selector
              options={[
                { label: '本地优先', value: 'local' },
                { label: 'NVIDIA AI', value: 'nvidia' },
              ]}
              value={[shareBackgroundInput.provider || 'local']}
              onChange={(value) => {
                if (!value.length) return;
                setShareBackgroundInput((current) => ({ ...current, provider: value[0] }));
              }}
            />
            <Selector
              options={[
                { label: 'Qwen Image 2512', value: 'qwen-image-2512' },
                { label: 'Qwen Image', value: 'qwen-image' },
                { label: 'FLUX.2 Klein 4B', value: 'flux.2-klein-4b' },
                { label: 'SD 3.5 Large', value: 'stabilityai/stable-diffusion-3.5-large' },
              ]}
              value={[shareBackgroundInput.defaultModel || 'qwen-image-2512']}
              onChange={(value) => {
                if (!value.length) return;
                setShareBackgroundInput((current) => ({ ...current, defaultModel: value[0] }));
              }}
            />
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="NVIDIA API Key（可选；留空则使用服务端环境变量）"
                type="password"
                value={shareBackgroundInput.nvidiaApiKey || ''}
                onChange={(value) => setShareBackgroundInput((current) => ({ ...current, nvidiaApiKey: value }))}
                clearable
              />
            </div>
          </div>
          <div className="settings-card__actions-row">
            <Button className="settings-card__primary-action" color="primary" size="small" fill="solid" onClick={handleSaveShareBackgroundConfig}>
              保存背景配置
            </Button>
          </div>
        </div>
      </div>

      {/* Market Data & Alerts */}
      <div className="section">
        <div className="section__title">行情数据源与价格提醒</div>
        <div className="settings-card glass-card">
          <div className="settings-card__row" style={{ cursor: 'default' }}>
            <span className="settings-card__icon">📡</span>
            <div className="settings-card__content">
              <div className="settings-card__label">期权链数据源</div>
              <div className="settings-card__desc">
                Auto 会优先使用 MarketData.app，其次 Tradier、Polygon、Longbridge；Yahoo 仅作为免费实验兜底，盘中实时期权价仍取决于 OPRA 权限。
              </div>
            </div>
          </div>
          <div className="settings-card__input-row settings-card__input-row--stacked">
            <Selector
              options={[
                { label: 'Auto', value: 'auto' },
                { label: 'MarketData.app', value: 'marketdata' },
                { label: 'Tradier', value: 'tradier' },
                { label: 'Polygon', value: 'polygon' },
                { label: 'Longbridge', value: 'longbridge' },
                { label: 'Yahoo(实验)', value: 'yahoo' },
              ]}
              value={[marketDataInput.optionProvider || 'auto']}
              onChange={(value) => {
                if (!value.length) return;
                setMarketDataInput((current) => ({ ...current, optionProvider: value[0] }));
              }}
            />
            <div className="settings-card__provider-note">
              <strong>MarketData.app 建议优先使用。</strong>
              免费层约 100 次/日 API Credits，期权数据延迟约 24h，适合复盘和低频监控；试用或付费套餐可升级更低延迟/实时 OPRA。Longbridge 可增强公司基础资料和股票报价，期权报价需要 OPRA OpenAPI 权限。
            </div>
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="MarketData.app Token（推荐）"
                type="password"
                value={marketDataInput.marketDataToken || ''}
                onChange={(value) => setMarketDataInput((current) => ({ ...current, marketDataToken: value }))}
                clearable
              />
            </div>
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="Tradier API Token（可选）"
                type="password"
                value={marketDataInput.tradierToken || ''}
                onChange={(value) => setMarketDataInput((current) => ({ ...current, tradierToken: value }))}
                clearable
              />
            </div>
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="Polygon API Key（可选）"
                type="password"
                value={marketDataInput.polygonToken || ''}
                onChange={(value) => setMarketDataInput((current) => ({ ...current, polygonToken: value }))}
                clearable
              />
            </div>
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="Longbridge App Key（可选，公司画像增强）"
                type="password"
                value={marketDataInput.longbridgeAppKey || ''}
                onChange={(value) => setMarketDataInput((current) => ({ ...current, longbridgeAppKey: value }))}
                clearable
              />
            </div>
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="Longbridge App Secret（可选）"
                type="password"
                value={marketDataInput.longbridgeAppSecret || ''}
                onChange={(value) => setMarketDataInput((current) => ({ ...current, longbridgeAppSecret: value }))}
                clearable
              />
            </div>
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="Longbridge Access Token（可选）"
                type="password"
                value={marketDataInput.longbridgeAccessToken || ''}
                onChange={(value) => setMarketDataInput((current) => ({ ...current, longbridgeAccessToken: value }))}
                clearable
              />
            </div>
          </div>
          <div className="settings-card__actions-row">
            <Button className="settings-card__primary-action" color="primary" size="small" fill="solid" onClick={handleSaveMarketDataConfig}>
              保存数据源
            </Button>
          </div>

          <div className="settings-card__divider" />
          <div className="settings-card__row" style={{ cursor: 'default' }}>
            <span className="settings-card__icon">🔔</span>
            <div className="settings-card__content">
              <div className="settings-card__label">价格提醒通道</div>
              <div className="settings-card__desc">
                浏览器提醒在 App 打开时触发；邮件和飞书由 Vercel API 发送。
              </div>
            </div>
          </div>
          <div className="settings-card__input-row settings-card__input-row--stacked">
            <Selector
              options={[
                { label: '浏览器通知', value: 'browser' },
                { label: '邮件', value: 'email' },
                { label: '飞书', value: 'feishu' },
              ]}
              multiple
              value={[
                notificationInput.browserEnabled ? 'browser' : null,
                notificationInput.emailEnabled ? 'email' : null,
                notificationInput.feishuEnabled ? 'feishu' : null,
              ].filter(Boolean)}
              onChange={(value) => {
                setNotificationInput((current) => ({
                  ...current,
                  browserEnabled: value.includes('browser'),
                  emailEnabled: value.includes('email'),
                  feishuEnabled: value.includes('feishu'),
                }));
              }}
            />
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="Resend API Key（邮件启用时必填）"
                type="password"
                value={notificationInput.emailApiKey || ''}
                onChange={(value) => setNotificationInput((current) => ({ ...current, emailApiKey: value }))}
                clearable
              />
            </div>
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="发件人，如 alerts@yourdomain.com"
                value={notificationInput.emailFrom || ''}
                onChange={(value) => setNotificationInput((current) => ({ ...current, emailFrom: value }))}
                clearable
              />
            </div>
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="收件人，可用逗号分隔"
                value={notificationInput.emailTo || ''}
                onChange={(value) => setNotificationInput((current) => ({ ...current, emailTo: value }))}
                clearable
              />
            </div>
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="飞书机器人 Webhook URL"
                type="password"
                value={notificationInput.feishuWebhook || ''}
                onChange={(value) => setNotificationInput((current) => ({ ...current, feishuWebhook: value }))}
                clearable
              />
            </div>
          </div>
          <div className="settings-card__actions-row">
            <Button className="settings-card__primary-action" color="primary" size="small" fill="solid" onClick={handleSaveNotificationConfig}>
              保存提醒配置
            </Button>
            <Button color="primary" size="small" fill="outline" onClick={handleTestNotification}>
              测试通道
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
              <div className="settings-card__label">多用户工作区</div>
              <div className="settings-card__desc">
                当前：{workspaceLabel}。个人工作区用于记录和编辑；团队工作区用于查看所有成员镜像数据。
              </div>
            </div>
          </div>
          <div className="settings-card__input-row settings-card__input-row--stacked">
            <Selector
              options={[
                { label: '个人工作区', value: 'personal' },
                { label: '团队工作区', value: 'team' },
              ]}
              value={[workspaceScope]}
              onChange={async (value) => {
                const nextScope = value[0] || 'personal';
                setWorkspaceScope(nextScope);
                await refreshAll();
                Toast.show({
                  icon: 'success',
                  content: nextScope === 'team' ? '已切换到团队工作区' : '已切换到个人工作区',
                });
              }}
            />
          </div>
          <div className="settings-card__divider" />
          <div className="settings-card__row" style={{ cursor: 'default' }}>
            <span className="settings-card__icon">🔐</span>
            <div className="settings-card__content">
              <div className="settings-card__label">同步身份与暗号</div>
              <div className="settings-card__desc">
                新交易、情报、决策和观点会自动标记当前花名；团队发布只提交此花名下的个人记录和已标记团队可见的内容。
              </div>
            </div>
          </div>
          <div className="settings-card__input-row settings-card__input-row--stacked">
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="您的代号 (如: Feng)"
                value={syncUserIdInput}
                onChange={setSyncUserIdInput}
                clearable
              />
            </div>
            <div className="settings-card__input-wrapper">
              <Input
                placeholder="团队同步暗号"
                type="password"
                value={syncSecretInput}
                onChange={setSyncSecretInput}
                clearable
              />
            </div>
          </div>
          <div className="settings-card__actions-row">
            <Button
              className="settings-card__primary-action"
              color="primary"
              size="small"
              fill="solid"
              onClick={handleSaveSyncConfig}
            >
              保存凭证
            </Button>
            <Button
              color="primary"
              size="small"
              fill="outline"
              onClick={handleTestSyncConnection}
            >
              测试连接
            </Button>
          </div>

          <div className="settings-card__divider" />
          <div className="settings-card__row" onClick={() => handleSyncUpload('personal')}>
            <span className="settings-card__icon">🚀</span>
            <div className="settings-card__content">
              <div className="settings-card__label">备份我的云端数据</div>
              <div className="settings-card__desc">保存个人工作区数据；不会上传 API Key、同步暗号和通知配置，也不会自动发布团队</div>
            </div>
            <span className="settings-card__arrow">›</span>
          </div>

          <div className="settings-card__divider" />
          <div className="settings-card__row" onClick={() => handleSyncUpload('team')}>
            <span className="settings-card__icon">🤝</span>
            <div className="settings-card__content">
              <div className="settings-card__label">同步到团队空间</div>
              <div className="settings-card__desc">发布当前花名的交易，以及已标记团队可见的情报、决策和观点</div>
            </div>
            <span className="settings-card__arrow">›</span>
          </div>

          <div className="settings-card__divider" />
          <div className="settings-card__row" onClick={handleWithdrawTeamData}>
            <span className="settings-card__icon">↩</span>
            <div className="settings-card__content">
              <div className="settings-card__label">撤回我的团队发布</div>
              <div className="settings-card__desc">从云端团队空间移除当前花名发布的数据，不影响个人云端备份</div>
            </div>
            <span className="settings-card__arrow">›</span>
          </div>

          <div className="settings-card__divider" />
          <div className="settings-card__row" onClick={handleRestoreMyData}>
            <span className="settings-card__icon">🔄</span>
            <div className="settings-card__content">
              <div className="settings-card__label">恢复我的云端数据</div>
              <div className="settings-card__desc">仅拉取我自己的个人备份并合并到个人工作区；同 ID 记录可能覆盖本机版本</div>
            </div>
            <span className="settings-card__arrow">›</span>
          </div>

          <div className="settings-card__divider" />
          <div className="settings-card__row" onClick={handleSyncDownload}>
            <span className="settings-card__icon">📥</span>
            <div className="settings-card__content">
              <div className="settings-card__label">拉取团队空间数据</div>
              <div className="settings-card__desc">刷新团队镜像数据，不覆盖个人工作区和私密配置</div>
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
              <div className="settings-card__desc">从备份文件恢复整个数据库，会覆盖本地配置；不是团队合并</div>
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
              <div className="settings-card__label text-loss">清除核心业务数据</div>
              <div className="settings-card__desc">删除交易、情报、决策、复盘和提醒，保留配置</div>
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
