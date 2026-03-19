export default function StatCard({ title, value, hint, tone = 'default', icon = null }) {
  return (
    <div className={`card stat-card tone-${tone}`}>
      <div className="stat-card-head">
        <span className="stat-card-title">{title}</span>
        {icon ? <span className="stat-card-icon">{icon}</span> : null}
      </div>
      <div className="stat-card-value">{value}</div>
      {hint ? <div className="stat-card-hint">{hint}</div> : null}
    </div>
  );
}
