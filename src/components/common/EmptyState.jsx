/**
 * EmptyState — Centered placeholder for empty lists/pages.
 *
 * Uses the `.empty-state` utility classes defined in the global
 * design system (index.css) so no component-level CSS is needed.
 */

export default function EmptyState({
  icon = '📊',
  title,
  subtitle,
  action,
}) {
  return (
    <div className="empty-state animate-fade-in">
      <div className="empty-state__icon">{icon}</div>
      {title && <div className="empty-state__title">{title}</div>}
      {subtitle && <div className="empty-state__subtitle">{subtitle}</div>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
