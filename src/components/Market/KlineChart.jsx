import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useAppStore } from '../../stores/useAppStore';

export default function KlineChart({ data, interval }) {
  const { colorConvention, theme } = useAppStore();
  
  // data format from api: [dateStr, open, close, low, high, volume]
  const option = useMemo(() => {
    if (!data || data.length === 0) return {};

    const upColor = colorConvention === 'red-up-green-down' ? '#ff4d6a' : '#00d4aa';
    const downColor = colorConvention === 'red-up-green-down' ? '#00d4aa' : '#ff4d6a';
    const isDark = theme === 'dark';
    const textColor = isDark ? '#8899aa' : '#64748b';
    const splitLineColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

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
        axisPointer: { type: 'cross' },
        backgroundColor: isDark ? 'rgba(19, 26, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: splitLineColor,
        textStyle: { color: isDark ? '#e8ecf1' : '#1e293b', fontSize: 12 },
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
          axisLabel: { color: textColor, fontSize: 10, margin: 8 },
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
          start: 50,
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

  if (!data || data.length === 0) {
    return <div className="kline-placeholder">Loading chart...</div>;
  }

  return (
    <ReactECharts 
      option={option} 
      style={{ height: '350px', width: '100%' }} 
      notMerge={true}
      lazyUpdate={true}
    />
  );
}
