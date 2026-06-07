import { useState } from 'react';
import './AssetLogo.css';

function getLogoUrl(symbol) {
  const cleanSymbol = String(symbol || '').trim().toUpperCase();
  if (!cleanSymbol || !/^[A-Z0-9.-]{1,12}$/.test(cleanSymbol)) return null;
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(cleanSymbol)}.png`;
}

export default function AssetLogo({ symbol, className = '' }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = getLogoUrl(symbol);
  const fallback = String(symbol || '?').trim().slice(0, 2).toUpperCase() || '?';

  if (!logoUrl || failed) {
    return <span className={`asset-logo asset-logo--fallback ${className}`}>{fallback}</span>;
  }

  return (
    <span className={`asset-logo ${className}`}>
      <img src={logoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </span>
  );
}
