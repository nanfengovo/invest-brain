import './LoadingSpinner.css';

export default function LoadingSpinner({ text = '加载中...' }) {
  return (
    <div className="loading-spinner">
      <div className="loading-spinner__dots">
        <span className="loading-spinner__dot" />
        <span className="loading-spinner__dot" />
        <span className="loading-spinner__dot" />
      </div>
      {text && <span className="loading-spinner__text">{text}</span>}
    </div>
  );
}
