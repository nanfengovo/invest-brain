export const STOCK_FIELD_HELP = {
  marketCap: {
    label: '市值',
    detail: '公司股票总市值。通常越大代表行业地位越稳，但增长弹性可能下降。',
  },
  floatMarketCap: {
    label: '流通市值',
    detail: '流通股本乘以当前价格。相比总市值，它更接近市场中真实可交易筹码的规模。',
  },
  enterpriseValue: {
    label: '企业价值',
    detail: '市值加债务再扣现金，更接近收购整家公司需要支付的经济价值。',
  },
  trailingPE: {
    label: 'TTM PE',
    detail: '过去 12 个月市盈率。越高通常代表市场给更高成长预期，也可能意味着估值压力。',
  },
  forwardPE: {
    label: 'Forward PE',
    detail: '基于未来盈利预测的市盈率，用来观察市场对未来利润的定价。',
  },
  priceToBook: {
    label: 'PB',
    detail: '市净率。资产型公司常用，半导体这类周期成长行业需要结合盈利周期判断。',
  },
  epsTtm: {
    label: 'TTM EPS',
    detail: '过去 12 个月每股收益。PE 的分母就是 EPS，盈利周期变化会直接影响估值。',
  },
  bps: {
    label: 'BPS',
    detail: '每股净资产。PB 的分母就是 BPS，适合观察资产基础和净资产定价。',
  },
  beta: {
    label: 'Beta',
    detail: '相对大盘的波动敏感度。大于 1 表示波动通常比大盘更强。',
  },
  revenueGrowth: {
    label: '营收增长',
    detail: '公司营收同比增长率。正增长说明业务扩张，负增长可能意味着周期下行或竞争压力。',
  },
  profitMargins: {
    label: '净利率',
    detail: '每 1 元营收最终留下多少净利润，衡量商业模式和成本控制。',
  },
  returnOnEquity: {
    label: 'ROE',
    detail: '净资产收益率。衡量股东资本使用效率，越高通常越好，但要警惕高杠杆推高 ROE。',
  },
  freeCashflow: {
    label: '自由现金流',
    detail: '经营现金流扣除资本开支后的现金，代表公司可支配的真实现金创造能力。',
  },
  totalShares: {
    label: '总股本',
    detail: '公司发行在外的总股份数量。配合股价可估算总市值。',
  },
  circulatingShares: {
    label: '流通股本',
    detail: '市场上可自由交易的股份数量。流通股越少，筹码集中时价格波动可能更剧烈。',
  },
  lotSize: {
    label: '每手股数',
    detail: '交易所定义的一手交易数量。美股通常 1 股即可交易，港股常见为 100/500/1000 股一手。',
  },
  employees: {
    label: '员工数',
    detail: '公司披露或数据源估算的全职员工规模，用来观察业务体量和组织杠杆。',
  },
  listingDate: {
    label: '上市日期',
    detail: '公司首次公开上市或主要市场上市时间。老牌公司和新上市公司在信息披露、估值弹性上常有差异。',
  },
  founded: {
    label: '成立时间',
    detail: '公司成立年份或日期。结合上市日期可以观察公司从创立到资本市场成熟的周期。',
  },
  website: {
    label: '公司官网',
    detail: '公司官方网站，适合继续核对 IR、业务线、财报和新闻稿。',
  },
};

export const OPTION_FIELD_HELP = {
  contract: {
    label: '合约',
    detail: '期权唯一合约代码，包含底层股票、到期日、Call/Put 和行权价。',
  },
  bidAsk: {
    label: 'Bid / Ask',
    detail: '买一价和卖一价。价差越大，成交滑点越高，市价单越危险。',
  },
  mark: {
    label: 'Mark',
    detail: '通常取买一/卖一中间价，适合估算持仓价值，但不保证一定能成交。',
  },
  last: {
    label: 'Last',
    detail: '最近一笔成交价。流动性差的期权里可能很旧，不能单独当实时公允价。',
  },
  volume: {
    label: 'Volume',
    detail: '当天成交量。成交量越低，越容易出现买卖价差大和卖不出去的问题。',
  },
  openInterest: {
    label: 'OI',
    detail: '未平仓合约数。OI 越高通常代表这个行权价/到期日更活跃。',
  },
  impliedVolatility: {
    label: 'IV',
    detail: '隐含波动率。买方付出的“波动率溢价”，财报前常升高，财报后可能 IV Crush。',
  },
  delta: {
    label: 'Delta',
    detail: '标的价格变动 1 美元时期权价格大致变化多少。Call 通常为正，Put 通常为负。',
  },
  gamma: {
    label: 'Gamma',
    detail: 'Delta 的变化速度。末日期权 Gamma 很高，方向对时暴涨，方向错时也会极速归零。',
  },
  theta: {
    label: 'Theta',
    detail: '时间价值每天衰减的近似金额。买方通常为负，越接近到期衰减越痛。',
  },
  vega: {
    label: 'Vega',
    detail: '隐含波动率变化 1 个百分点时期权价格的敏感度。高 Vega 合约更怕 IV 回落。',
  },
  intrinsicValue: {
    label: '内在价值',
    detail: '期权立即行权理论上已有的价值。Call 为股价减行权价，Put 为行权价减股价。',
  },
  extrinsicValue: {
    label: '外在价值',
    detail: '期权价格中超过内在价值的部分，主要来自时间价值和波动率预期。',
  },
  moneyness: {
    label: '价内/价外',
    detail: 'ITM 表示已有内在价值，OTM 表示暂时全靠时间和波动率价值支撑。',
  },
};

export function getFieldHelp(group, key) {
  const source = group === 'option' ? OPTION_FIELD_HELP : STOCK_FIELD_HELP;
  return source[key] || {
    label: key,
    detail: '这个字段来自行情数据源，后续可继续补充更细的解释。',
  };
}
