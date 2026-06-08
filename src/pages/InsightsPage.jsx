import { useState, useEffect } from 'react';
import { NavBar, Button, Selector, Toast, SpinLoading } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
import { getAiErrorMessage } from '../utils/aiErrorMessages';
import { calculateInsightStats } from '../utils/insightStats';
import { buildAiRequestBody, buildAiRequestHeaders, getAiUsageLabel } from '../utils/aiProviders';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import './InsightsPage.css';

export default function InsightsPage() {
  const navigate = useNavigate();
  const { getTradingInsights } = useTradeStore();
  const { geminiApiKey, nvidiaApiKey, aiProviderConfig } = useAppStore();

  const [timeRange, setTimeRange] = useState(['30']);
  const [loadingData, setLoadingData] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [stats, setStats] = useState(null);
  const [insightResult, setInsightResult] = useState(null);

  // Load objective data when time range changes
  useEffect(() => {
    loadObjectiveData();
  }, [timeRange]);

  const loadObjectiveData = async () => {
    setLoadingData(true);
    const range = timeRange[0];
    const days = range === 'all' ? 'all' : parseInt(range, 10);
    
    const res = await getTradingInsights(days);
    if (res.success && res.data) {
      calculateStats(res.data);
    } else {
      Toast.show({ icon: 'fail', content: '数据加载失败' });
    }
    setLoadingData(false);
  };

  const calculateStats = (data) => {
    setStats(calculateInsightStats(data));
    // Clear previous AI result if time range changes
    setInsightResult(null);
  };

  const generateAIInsight = async () => {
    if (!stats || !stats.rawData || stats.rawData.length === 0) {
      Toast.show({ icon: 'fail', content: '所选时段没有足够的闭环数据' });
      return;
    }

    setAnalyzing(true);
    const toast = Toast.show({
      icon: 'loading',
      content: 'AI 资深交易风控官正在诊断中...',
      duration: 0,
    });

    try {
      const response = await fetch('/api/analyze-personality', {
        method: 'POST',
        headers: buildAiRequestHeaders({ geminiApiKey, nvidiaApiKey }),
        body: JSON.stringify(buildAiRequestBody(aiProviderConfig, { data: stats.rawData }))
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setInsightResult(result);
      toast.close();
      Toast.show({
        icon: 'success',
        content: `诊断完成${getAiUsageLabel(result) ? ` · ${getAiUsageLabel(result)}` : ''}`,
      });
    } catch (err) {
      console.error('AI Diagnosis Error:', err);
      toast.close();
      Toast.show({ icon: 'fail', content: getAiErrorMessage(err, 'insights') });
    } finally {
      setAnalyzing(false);
    }
  };

  const formatCurrency = (num) => {
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const radarData = insightResult ? [
    { subject: '执行力', A: insightResult.radarData.execution, fullMark: 100 },
    { subject: '情绪控制', A: insightResult.radarData.emotion, fullMark: 100 },
    { subject: '客观胜率', A: insightResult.radarData.winRate, fullMark: 100 },
    { subject: '盈亏认知', A: insightResult.radarData.riskReward, fullMark: 100 },
    { subject: '认知深度', A: insightResult.radarData.cognition, fullMark: 100 },
    { subject: '专注度', A: insightResult.radarData.focus, fullMark: 100 },
  ] : [];

  return (
    <div className="insights-page">
      <NavBar onBack={() => navigate(-1)}>AI 交易体检</NavBar>
      
      <div className="insights-page__content">
        {/* ── Time Filter ── */}
        <div className="insights-page__filter glass-card">
          <Selector
            options={[
              { label: '近 30 天', value: '30' },
              { label: '近 90 天', value: '90' },
              { label: '本年度', value: '365' },
              { label: '全部数据', value: 'all' },
            ]}
            value={timeRange}
            onChange={(arr) => arr.length > 0 && setTimeRange(arr)}
          />
        </div>

        {/* ── Objective Stats ── */}
        <div className="insights-page__stats glass-card">
          <h3 className="insights-page__section-title">客观数据统计</h3>
          {loadingData ? (
            <div className="insights-page__loading">
              <SpinLoading color="primary" />
            </div>
          ) : stats ? (
            <div className="insights-page__stats-grid">
              <div className="insights-page__stat-item">
                <div className="insights-page__stat-value text-mono">{stats.winRate}%</div>
                <div className="insights-page__stat-label">总体胜率</div>
              </div>
              <div className="insights-page__stat-item">
                <div className="insights-page__stat-value text-mono">{stats.pnlRatio}</div>
                <div className="insights-page__stat-label">盈亏比</div>
              </div>
              <div className="insights-page__stat-item">
                <div className="insights-page__stat-value text-mono">{stats.total}</div>
                <div className="insights-page__stat-label">闭环决策数</div>
              </div>
              <div className="insights-page__stat-item insights-page__stat-item--full">
                <div className={`insights-page__stat-value text-mono ${stats.totalProfit - stats.totalLoss >= 0 ? 'profit' : 'loss'}`}>
                  ${formatCurrency(stats.totalProfit - stats.totalLoss)}
                </div>
                <div className="insights-page__stat-label">总净利润 (已闭环)</div>
              </div>
            </div>
          ) : (
            <div className="insights-page__empty">当前时段暂无已复盘的闭环数据</div>
          )}
        </div>

        {/* ── AI Generate Button ── */}
        {stats && !insightResult && (
          <div className="insights-page__action">
            <Button 
              block 
              color="primary" 
              size="large" 
              onClick={generateAIInsight}
              loading={analyzing}
              className="insights-page__generate-btn"
            >
              ✨ 召唤 AI 风控官进行诊断
            </Button>
          </div>
        )}

        {/* ── AI Insight Result ── */}
        {insightResult && (
          <div className="insights-page__result glass-card">
            <h3 className="insights-page__section-title">AI 诊断报告</h3>
            {getAiUsageLabel(insightResult) && (
              <div className="insights-page__model-chip">
                诊断模型：{getAiUsageLabel(insightResult)}
              </div>
            )}
            
            <div className="insights-page__personality">
              <span className="insights-page__personality-label">交易性格诊断：</span>
              <span className="insights-page__personality-tag">{insightResult.personality}</span>
            </div>

            <div className="insights-page__radar-container">
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.2)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name="得分"
                    dataKey="A"
                    stroke="var(--color-accent)"
                    fill="var(--color-accent)"
                    fillOpacity={0.5}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="insights-page__analysis">
              <h4>深度点评</h4>
              <p>{insightResult.analysis}</p>
            </div>

            <div className="insights-page__advice">
              <h4>行动建议</h4>
              <ul>
                {insightResult.advice.map((item, index) => (
                  <li key={index}>
                    <span className="insights-page__advice-icon">💡</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <Button 
              block 
              onClick={generateAIInsight}
              loading={analyzing}
              className="insights-page__re-generate-btn"
            >
              重新诊断
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
