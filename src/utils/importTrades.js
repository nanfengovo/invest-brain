import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { toIsoDateTime } from './time';
import { buildOptionAssetId, normalizeOptionTrade } from './optionsMarket';

/**
 * Parse an Excel or CSV file and convert it to trade records
 * @param {File} file - The file to parse
 * @returns {Promise<Array>} Array of trade objects ready for DB
 */
export async function parseTradesFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Assume first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (rawData.length < 2) {
          throw new Error('表格数据为空或无有效行');
        }

        // Identify columns (naive mapping)
        const headers = rawData[0].map(h => String(h).trim().toLowerCase());
        const mappings = {
          symbol: headers.findIndex(h => /代码|symbol|ticker/i.test(h)),
          name: headers.findIndex(h => /名称|name/i.test(h)),
          assetType: headers.findIndex(h => /资产类型|类型|asset.?type|security.?type/i.test(h)),
          direction: headers.findIndex(h => /方向|买卖|动作|action|side/i.test(h)),
          quantity: headers.findIndex(h => /数量|成交量|qty|quantity/i.test(h)),
          price: headers.findIndex(h => /价格|成交价|均价|price/i.test(h)),
          fee: headers.findIndex(h => /手续费|佣金|fee|commission/i.test(h)),
          account: headers.findIndex(h => /账户|券商|account/i.test(h)),
          time: headers.findIndex(h => /时间|日期|date|time/i.test(h)),
          strike: headers.findIndex(h => /行权价|strike/i.test(h)),
          expiry: headers.findIndex(h => /到期|expiry|expiration|expire/i.test(h)),
          optionType: headers.findIndex(h => /call|put|认购|认沽|期权类型|option.?type/i.test(h)),
          contractSymbol: headers.findIndex(h => /合约|contract/i.test(h))
        };

        if (mappings.symbol === -1 || mappings.direction === -1 || mappings.quantity === -1 || mappings.price === -1) {
          throw new Error('表格必须包含：代码、买卖方向、数量、价格 的列名');
        }

        const trades = [];
        const now = new Date();

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row[mappings.symbol]) continue; // Skip empty rows

          // Parse direction
          const dirStr = String(row[mappings.direction] || '').toUpperCase();
          let direction = 'BUY';
          if (/卖|SELL|S/i.test(dirStr)) direction = 'SELL';

          // Parse time
          let tradeTime = now;
          if (row[mappings.time]) {
            const parsedTime = parseDateCell(row[mappings.time]);
            if (parsedTime) {
              tradeTime = parsedTime;
            }
          }
          const assetTypeCell = mappings.assetType >= 0 ? String(row[mappings.assetType] || '').toUpperCase() : '';
          const contractCell = mappings.contractSymbol >= 0 ? String(row[mappings.contractSymbol] || '').toUpperCase() : '';
          const hasStrikeValue = mappings.strike >= 0 && row[mappings.strike] !== null && row[mappings.strike] !== undefined && row[mappings.strike] !== '';
          const isOption = /期权|OPTION|CALL|PUT|认购|认沽/.test(assetTypeCell) || /CALL|PUT/.test(contractCell) || hasStrikeValue;
          const optionTypeCell = mappings.optionType >= 0 ? String(row[mappings.optionType] || '').toUpperCase() : contractCell;
          const rawOptionType = isOption
            ? (/PUT|认沽/.test(optionTypeCell) ? 'PUT' : 'CALL')
            : null;
          const rawExpiryDate = isOption && mappings.expiry >= 0
            ? parseDateCell(row[mappings.expiry])?.toISOString().slice(0, 10)
            : null;
          const rawStrikePrice = isOption && mappings.strike >= 0
            ? Math.abs(parseFloat(row[mappings.strike]) || 0)
            : null;
          const symbol = String(row[mappings.symbol]).trim().toUpperCase();
          const normalizedOption = isOption ? normalizeOptionTrade({
            symbol,
            contract_symbol: contractCell,
            option_type: rawOptionType,
            expiry_date: rawExpiryDate,
            strike_price: rawStrikePrice,
          }) : null;
          const optionType = normalizedOption?.option_type || rawOptionType;
          const expiryDate = normalizedOption?.expiry_date || rawExpiryDate;
          const strikePrice = normalizedOption?.strike_price || rawStrikePrice;
          const assetId = isOption
            ? (normalizedOption?.asset_id || buildOptionAssetId({
                underlying: symbol,
                expiration: expiryDate,
                strike: strikePrice,
                optionType,
                contractSymbol: contractCell,
              }))
            : symbol;

          // Build trade object
          const trade = {
            id: uuidv4(),
            asset_id: assetId,
            symbol: normalizedOption?.underlying || symbol,
            asset_name: row[mappings.name] ? String(row[mappings.name]).trim() : '',
            asset_type: isOption ? 'OPTION' : 'STOCK',
            direction,
            quantity: Math.abs(parseFloat(row[mappings.quantity]) || 0),
            price: Math.abs(parseFloat(row[mappings.price]) || 0),
            fee: Math.abs(parseFloat(row[mappings.fee]) || 0),
            account: row[mappings.account] ? String(row[mappings.account]).trim() : '导入记录',
            trade_time: toIsoDateTime(tradeTime),
            note: '从表格导入',
            underlying_symbol: isOption ? (normalizedOption?.underlying || symbol) : null,
            strike_price: strikePrice,
            expiry_date: expiryDate,
            option_type: optionType,
            contract_symbol: isOption ? (normalizedOption?.contract_symbol || contractCell || null) : null,
            multiplier: isOption ? (normalizedOption?.multiplier || 100) : 1,
          };

          if (trade.quantity > 0 && trade.price > 0) {
            trades.push(trade);
          }
        }

        resolve(trades);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsArrayBuffer(file);
  });
}

function parseDateCell(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0));
    }
  }
  const parsedTime = Date.parse(value);
  if (!Number.isNaN(parsedTime)) return new Date(parsedTime);
  return null;
}
