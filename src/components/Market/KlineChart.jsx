import React, { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import { useAppStore } from '../../stores/useAppStore';

export default function KlineChart({ data, interval }) {
  const { colorConvention, theme } = useAppStore();
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const hasData = Boolean(data && data.length > 0);
  
  // data format from api: [dateStr, open, close, low, high, volume]
  const option = useMemo(() => {
    if (!data || data.length === 0) return {};

    const upColor = colorConvention === 'red-up-green-down' ? '#ff4d6a' : '#00d4aa';
    const downColor = colorConvention === 'red-up-green-down' ? '#00d4aa' : '#ff4d6a';
    const isDark = theme === 'dark';
    const textColor = isDark ? '#8899aa' : '#64748b';
    const splitLineColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const isYearly = interval === '1y';

    const dates = data.map(item => item[0]);
    // ECharts expects: [open, close, lowest, highest]
    const klineData = data.map(item => [item[1], item[2], item[3], item[4]]);
    const volumes = data.map((item, index) => [index, item[5], item[1] > item[2] ? -1 : 1]); // -1 for down, 1 for up

    // Calculate MA5, MA10, MA20
    const calculateMA = (dayCount) => {
      const result = [];
      for (let i = 0, len = klineData.length; i < len; i++) {
        if (i < dayCount) {
          result.push('-');
          continue;
        }
        let sum = 0;
        for (let j = 0; j < dayCount; j++) {
          sum += klineData[i - j][1]; // close price
        }
        result.push((sum / dayCount).toFixed(2));
      }
      return result;
    };

    return {
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: { 
          type: 'cross',
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.3)',
            width: 1,
            type: 'dashed'
          }
        },
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 12,
        extraCssText: 'backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-radius: 12px; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.5); border: 1px solid rgba(255, 255, 255, 0.1);',
        position: function (pos, params, dom, rect, size) {
          const x = pos[0];
          const y = pos[1];
          const viewWidth = size.viewSize[0];
          const viewHeight = size.viewSize[1];
          const tooltipWidth = size.contentSize[0];
          const tooltipHeight = size.contentSize[1];
          
          let left = x + 15;
          let top = y - tooltipHeight / 2;
          
          if (left + tooltipWidth > viewWidth) {
            left = x - tooltipWidth - 15;
          }
          if (left < 0) left = 10;
          
          if (top + tooltipHeight > viewHeight) {
            top = viewHeight - tooltipHeight - 10;
          }
          if (top < 10) top = 10;
          
          return [left, top];
        },
        formatter: function (params) {
          if (!params || params.length === 0) return '';
          
          const date = params[0].axisValue;
          const dateLabel = isYearly ? `${date} 年` : date;
          let html = `<div style="font-family: sans-serif; font-size: 11px; color: #e2e8f0; min-width: 150px; line-height: 1.5;">`;
          html += `<div style="font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; margin-bottom: 6px; color: #94a3b8; font-family: monospace;">${dateLabel}</div>`;
          
          let kline = null;
          let ma5 = null;
          let ma20 = null;
          let volume = null;
          
          params.forEach(p => {
            if (p.seriesName === 'K Line') {
              kline = p;
            } else if (p.seriesName === 'MA5') {
              ma5 = p;
            } else if (p.seriesName === 'MA20') {
              ma20 = p;
            } else if (p.seriesName === 'Volume') {
              volume = p;
            }
          });
          
          if (kline && kline.value) {
            let open, close, low, high;
            if (kline.value.length >= 5) {
              open = parseFloat(kline.value[1]);
              close = parseFloat(kline.value[2]);
              low = parseFloat(kline.value[3]);
              high = parseFloat(kline.value[4]);
            } else {
              open = parseFloat(kline.value[0]);
              close = parseFloat(kline.value[1]);
              low = parseFloat(kline.value[2]);
              high = parseFloat(kline.value[3]);
            }
            
            const isUp = close >= open;
            const color = isUp ? upColor : downColor;
            const dot = `<span style="display:inline-block;margin-right:6px;border-radius:10px;width:7px;height:7px;background-color:${color};"></span>`;
            
            html += `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
              <span style="color: #94a3b8;">${dot}开盘 (Open)</span>
              <span style="font-weight: 600; font-family: monospace;">${open.toFixed(2)}</span>
            </div>`;
            html += `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
              <span style="color: #94a3b8;">${dot}收盘 (Close)</span>
              <span style="font-weight: 600; color: ${color}; font-family: monospace;">${close.toFixed(2)}</span>
            </div>`;
            html += `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
              <span style="color: #94a3b8;">${dot}最低 (Low)</span>
              <span style="font-weight: 600; font-family: monospace;">${low.toFixed(2)}</span>
            </div>`;
            html += `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
              <span style="color: #94a3b8;">${dot}最高 (High)</span>
              <span style="font-weight: 600; font-family: monospace;">${high.toFixed(2)}</span>
            </div>`;
          }
          
          if (volume && volume.value !== undefined) {
            let volVal = typeof volume.value === 'object' && volume.value !== null ? volume.value.value : volume.value;
            if (Array.isArray(volVal)) {
              volVal = volVal[1];
            }
            if (volVal !== undefined && volVal !== null) {
              const formattedVol = Number(volVal).toLocaleString();
              const dot = `<span style="display:inline-block;margin-right:6px;border-radius:10px;width:7px;height:7px;background-color:#64748b;"></span>`;
              html += `<div style="display: flex; justify-content: space-between; margin-top: 5px; margin-bottom: 5px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 5px;">
                <span style="color: #94a3b8;">${dot}成交量 (Vol)</span>
                <span style="font-weight: 600; font-family: monospace;">${formattedVol}</span>
              </div>`;
            }
          }
          
          if (ma5 && ma5.value !== undefined) {
            let val = Array.isArray(ma5.value) ? ma5.value[1] : ma5.value;
            if (val !== undefined && val !== '-' && val !== null) {
              const dot = `<span style="display:inline-block;margin-right:6px;border-radius:10px;width:7px;height:7px;background-color:#f59e0b;"></span>`;
              html += `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span style="color: #94a3b8;">${dot}${isYearly ? '5年均线' : 'MA5'}</span>
                <span style="font-weight: 600; color: #f59e0b; font-family: monospace;">${Number(val).toFixed(2)}</span>
              </div>`;
            }
          }
          
          if (ma20 && ma20.value !== undefined) {
            let val = Array.isArray(ma20.value) ? ma20.value[1] : ma20.value;
            if (val !== undefined && val !== '-' && val !== null) {
              const dot = `<span style="display:inline-block;margin-right:6px;border-radius:10px;width:7px;height:7px;background-color:#818cf8;"></span>`;
              html += `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span style="color: #94a3b8;">${dot}${isYearly ? '20年均线' : 'MA20'}</span>
                <span style="font-weight: 600; color: #818cf8; font-family: monospace;">${Number(val).toFixed(2)}</span>
              </div>`;
            }
          }
          
          html += '</div>';
          return html;
        }
      },
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
        label: { backgroundColor: '#777' }
      },
      grid: [
        { left: '2%', right: '2%', top: '5%', height: '65%' },
        { left: '2%', right: '2%', top: '75%', height: '20%' }
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          scale: true,
          boundaryGap: false,
          axisLine: { onZero: false, lineStyle: { color: splitLineColor } },
          splitLine: { show: false },
          min: 'dataMin',
          max: 'dataMax',
          axisLabel: {
            color: textColor,
            fontSize: 10,
            margin: 8,
            formatter: (value) => (isYearly ? String(value).slice(0, 4) : String(value)),
          },
        },
        {
          type: 'category',
          gridIndex: 1,
          data: dates,
          scale: true,
          boundaryGap: false,
          axisLine: { onZero: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          min: 'dataMin',
          max: 'dataMax'
        }
      ],
      yAxis: [
        {
          scale: true,
          position: 'right',
          splitArea: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: true, lineStyle: { color: splitLineColor } },
          axisLabel: { color: textColor, fontSize: 10, inside: true, margin: 4 },
        },
        {
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false }
        }
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          start: isYearly ? 0 : 50,
          end: 100
        }
      ],
      series: [
        {
          name: 'K Line',
          type: 'candlestick',
          data: klineData,
          itemStyle: {
            color: upColor,
            color0: downColor,
            borderColor: upColor,
            borderColor0: downColor
          }
        },
        {
          name: 'MA5',
          type: 'line',
          data: calculateMA(5),
          smooth: true,
          showSymbol: false,
          lineStyle: { opacity: 0.5, width: 1, color: '#f59e0b' }
        },
        {
          name: 'MA20',
          type: 'line',
          data: calculateMA(20),
          smooth: true,
          showSymbol: false,
          lineStyle: { opacity: 0.5, width: 1, color: '#818cf8' }
        },
        {
          name: 'Volume',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes.map(item => {
            return {
              value: item[1],
              itemStyle: { color: item[2] === 1 ? upColor : downColor }
            };
          })
        }
      ]
    };
  }, [data, colorConvention, theme, interval]);

  useEffect(() => {
    if (!hasData || !chartRef.current) return undefined;

    const chart = echarts.init(chartRef.current, null, { renderer: 'canvas' });
    chartInstanceRef.current = chart;

    const resize = () => {
      if (!chart.isDisposed()) chart.resize();
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;

    resizeObserver?.observe(chartRef.current);
    window.addEventListener('resize', resize);
    requestAnimationFrame(resize);

    return () => {
      window.removeEventListener('resize', resize);
      resizeObserver?.disconnect();
      if (!chart.isDisposed()) chart.dispose();
      chartInstanceRef.current = null;
    };
  }, [hasData]);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!hasData || !chart || chart.isDisposed() || !option || Object.keys(option).length === 0) {
      return;
    }

    chart.hideLoading();
    chart.setOption(option, { notMerge: true, lazyUpdate: false });
    requestAnimationFrame(() => {
      if (!chart.isDisposed()) chart.resize();
    });
  }, [hasData, option]);

  if (!data || data.length === 0) {
    return (
      <div className="kline-placeholder">
        <strong>暂无可用图表数据</strong>
        <span>行情源未返回 K 线，稍后会自动重试。</span>
      </div>
    );
  }

  return <div ref={chartRef} className="kline-chart" aria-label="K 线图" />;
}
