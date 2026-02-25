import { useState, useEffect } from "preact/hooks";
import { adminAuditLog } from "../../signals/admin.js";
import { wsSend } from "../../hooks/useServiceWorker.js";
import { IconFileText } from "../common/Icons.js";

const PAGE_SIZE = 20;

export function AuditLog() {
  const [entries, setEntries] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  // Watch signal for incoming responses
  const auditData = adminAuditLog.value;

  useEffect(() => {
    if (auditData === null) return;
    if (auditData.offset === 0) {
      setEntries(auditData.entries);
    } else {
      setEntries((prev) => [...prev, ...auditData.entries]);
    }
    setHasMore(auditData.entries.length === PAGE_SIZE);
    setLoading(false);
  }, [auditData]);

  const load = () => {
    setLoading(true);
    setOffset(0);
    adminAuditLog.value = null;
    wsSend({ type: "admin_get_audit_log", payload: { limit: PAGE_SIZE, offset: 0 } });
  };

  const loadMore = () => {
    const nextOffset = entries.length;
    setOffset(nextOffset);
    wsSend({ type: "admin_get_audit_log", payload: { limit: PAGE_SIZE, offset: nextOffset } });
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && entries.length === 0) return <p class="loading">Loading audit log...</p>;

  return (
    <div class="audit-log">
      {entries.length === 0 ? (
        <p class="empty">No audit entries.</p>
      ) : (
        <div class="audit-log-entries">
          {entries.map((entry, i) => (
            <div key={i} class="audit-entry">
              <span class="audit-time">
                {new Date(entry.timestamp).toLocaleString()}
              </span>
              <span class={`audit-event badge event-${entry.event}`}>
                {entry.event}
              </span>
              {entry.userId != null && (
                <span class="audit-user">uid:{entry.userId}</span>
              )}
              {entry.data && (
                <span class="audit-data">
                  {Object.entries(entry.data)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ")}
                </span>
              )}
            </div>
          ))}
          {hasMore && (
            <button
              class="btn btn-sm load-more-btn"
              onClick={loadMore}
              disabled={loading}
            >
              {loading ? "Loading..." : "Load More"}
            </button>
          )}
        </div>
      )}
      <button class="back-btn" onClick={load}>
        <IconFileText size={14} /> Refresh
      </button>
    </div>
  );
}
