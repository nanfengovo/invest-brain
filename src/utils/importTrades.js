import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

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
          direction: headers.findIndex(h => /方向|买卖|动作|action|side/i.test(h)),
          quantity: headers.findIndex(h => /数量|成交量|qty|quantity/i.test(h)),
          price: headers.findIndex(h => /价格|成交价|均价|price/i.test(h)),
          fee: headers.findIndex(h => /手续费|佣金|fee|commission/i.test(h)),
          account: headers.findIndex(h => /账户|券商|account/i.test(h)),
          time: headers.findIndex(h => /时间|日期|date|time/i.test(h))
        };

        if (mappings.symbol === -1 || mappings.direction === -1 || mappings.quantity === -1 || mappings.price === -1) {
          throw new Error('表格必须包含：代码、买卖方向、数量、价格 的列名');
        }

        const trades = [];
        const now = Math.floor(Date.now() / 1000);

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
            const parsedTime = Date.parse(row[mappings.time]);
            if (!isNaN(parsedTime)) {
              tradeTime = Math.floor(parsedTime / 1000);
            }
          }

          // Build trade object
          const trade = {
            id: uuidv4(),
            asset_id: `STOCK_${String(row[mappings.symbol]).trim().toUpperCase()}`,
            symbol: String(row[mappings.symbol]).trim().toUpperCase(),
            asset_name: row[mappings.name] ? String(row[mappings.name]).trim() : '',
            asset_type: 'STOCK',
            direction,
            quantity: Math.abs(parseFloat(row[mappings.quantity]) || 0),
            price: Math.abs(parseFloat(row[mappings.price]) || 0),
            fee: Math.abs(parseFloat(row[mappings.fee]) || 0),
            account: row[mappings.account] ? String(row[mappings.account]).trim() : '导入记录',
            trade_time: tradeTime,
            note: '从表格导入'
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
