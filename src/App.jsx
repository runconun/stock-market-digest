import { useState, useEffect, useRef, useCallback } from "react";

const getBangkokTime = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));

const formatDateForDisplay = (date) => date.toLocaleDateString("en-GB", {
  day: "2-digit", month: "long", year: "numeric"
});

const formatDateForInput = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const inputToDisplay = (val) => {
  const [y, m, d] = val.split("-");
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${d} ${months[parseInt(m)-1]} ${y}`;
};

const getNextFetchTime = () => {
  const now = getBangkokTime();
  const target = new Date(now);
  target.setHours(17, 30, 0, 0);
  if (now >= target) target.setDate(target.getDate() + 1);
  return target;
};

export default function SETDigest() {
  const [digest, setDigest] = useState("");
  const [status, setStatus] = useState("idle");
  const [lastFetched, setLastFetched] = useState(null);
  const [copied, setCopied] = useState(false);
  const [openedAdmin, setOpenedAdmin] = useState(null);
  const [countdown, setCountdown] = useState("");
  const [autoFetchEnabled, setAutoFetchEnabled] = useState(true);
  const [selectedDate, setSelectedDate] = useState(formatDateForInput(getBangkokTime()));
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  const fetchDigest = useCallback(async (dateStr) => {
    setStatus("loading");
    setDigest("");
    const displayDate = inputToDisplay(dateStr);
    try {
      const res = await fetch("/.netlify/functions/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: displayDate })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      if (data.text === "NO_DATA_TODAY" || data.text?.includes("NO_DATA_TODAY")) {
        setStatus("no_data");
      } else {
        setDigest(data.text);
        setStatus("success");
        setLastFetched(displayDate);
      }
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }, []);

  // Auto-fetch scheduler (always uses today)
  useEffect(() => {
    if (!autoFetchEnabled) { clearTimeout(timerRef.current); return; }
    const schedule = () => {
      const ms = getNextFetchTime() - getBangkokTime();
      timerRef.current = setTimeout(() => {
        const today = formatDateForInput(getBangkokTime());
        setSelectedDate(today);
        fetchDigest(today);
        schedule();
      }, ms);
    };
    schedule();
    return () => clearTimeout(timerRef.current);
  }, [autoFetchEnabled, fetchDigest]);

  // Countdown
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, getNextFetchTime() - getBangkokTime());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => clearInterval(countdownRef.current);
  }, []);

  const cleanDigest = (text) => text
    .split(/\n\n+/)
    .map(p => p.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanDigest(digest)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handlePost = (url, label) => {
    navigator.clipboard.writeText(cleanDigest(digest)).then(() => {
      setOpenedAdmin(label);
      setTimeout(() => setOpenedAdmin(null), 3000);
      window.open(url, "_blank");
    });
  };

  const now = getBangkokTime();
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0f1e 0%, #0d1a2e 60%, #0a1520 100%)",
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      color: "#e8edf5",
    }}>
      {/* Header */}
      <div style={{
        background: "rgba(255,255,255,0.03)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "18px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "10px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "8px",
            background: "linear-gradient(135deg, #1a6b4a, #2d9a6e)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "16px", fontWeight: "700", color: "#fff",
          }}>S</div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "600" }}>SET Market Digest</div>
            <div style={{ fontSize: "10px", color: "#6b7fa3", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              PTT Investor Relations · Daily EN
            </div>
          </div>
        </div>
        <div style={{ fontSize: "12px", color: "#6b7fa3" }}>
          Bangkok · {formatDateForDisplay(now)} · {timeStr}
        </div>
      </div>

      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "28px 20px" }}>

        {/* Auto-fetch bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "10px", padding: "12px 16px", marginBottom: "16px",
          flexWrap: "wrap", gap: "8px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "7px", height: "7px", borderRadius: "50%",
              background: autoFetchEnabled ? "#2d9a6e" : "#3a4558",
              boxShadow: autoFetchEnabled ? "0 0 6px #2d9a6e" : "none",
            }} />
            <span style={{ fontSize: "12px", color: "#8a9bb8" }}>Auto-fetch at 17:30 ICT daily</span>
            <button onClick={() => setAutoFetchEnabled(v => !v)} style={{
              fontSize: "10px", padding: "2px 10px", borderRadius: "20px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: autoFetchEnabled ? "rgba(45,154,110,0.15)" : "rgba(255,255,255,0.04)",
              color: autoFetchEnabled ? "#2d9a6e" : "#6b7fa3",
              cursor: "pointer", fontWeight: "700",
            }}>{autoFetchEnabled ? "ON" : "OFF"}</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: "#4a5568" }}>Next in</span>
            <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: "600", color: "#8a9bb8", letterSpacing: "0.05em" }}>
              {countdown}
            </span>
          </div>
        </div>

        {/* Date picker + Fetch button */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            max={formatDateForInput(getBangkokTime())}
            style={{
              padding: "13px 14px", borderRadius: "10px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#e8edf5", fontSize: "13px",
              cursor: "pointer", outline: "none",
              colorScheme: "dark",
            }}
          />
          <button
            onClick={() => fetchDigest(selectedDate)}
            disabled={status === "loading"}
            style={{
              flex: 1, padding: "13px",
              background: status === "loading" ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #1a6b4a, #2d9a6e)",
              border: "none", borderRadius: "10px",
              color: status === "loading" ? "#6b7fa3" : "#fff",
              fontSize: "13px", fontWeight: "600", cursor: status === "loading" ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            }}>
            {status === "loading" ? (
              <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> Searching ryt9…</>
            ) : "⬇  Fetch Digest"}
          </button>
        </div>

        {/* Result */}
        {status === "success" && digest && (
          <div style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: "12px", overflow: "hidden",
          }}>
            <div style={{
              padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#2d9a6e", boxShadow: "0 0 5px #2d9a6e" }} />
                <span style={{ fontSize: "11px", color: "#8a9bb8", fontWeight: "500" }}>
                  SET Close · {lastFetched}
                </span>
              </div>
              <button onClick={handleCopy} style={{
                padding: "5px 14px", borderRadius: "6px",
                background: copied ? "rgba(45,154,110,0.2)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${copied ? "rgba(45,154,110,0.4)" : "rgba(255,255,255,0.1)"}`,
                color: copied ? "#2d9a6e" : "#a8bdd4",
                fontSize: "11px", fontWeight: "600", cursor: "pointer", transition: "all 0.2s",
              }}>{copied ? "✓ Copied" : "Copy"}</button>
            </div>
            <div style={{ padding: "22px" }}>
              {digest
                .split(/\n\n+/)
                .map(para => para.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
                .filter(Boolean)
                .map((para, i, arr) => (
                  <p key={i} style={{
                    margin: i < arr.length - 1 ? "0 0 14px" : "0",
                    fontSize: "14px", lineHeight: "1.85", color: "#cdd8ea",
                  }}>{para}</p>
                ))}
            </div>
          </div>
        )}

        {/* Post buttons — shown only when digest is ready */}
        {status === "success" && digest && (
          <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
            <button
              onClick={() => handlePost("https://ir.stockradars.co/ir-ptt-console/content", "admin")}
              style={{
                flex: 1, padding: "11px 14px", borderRadius: "10px",
                background: openedAdmin === "admin" ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.08)",
                border: `1px solid ${openedAdmin === "admin" ? "rgba(59,130,246,0.5)" : "rgba(59,130,246,0.2)"}`,
                color: openedAdmin === "admin" ? "#93c5fd" : "#7aabf7",
                fontSize: "12px", fontWeight: "600", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                transition: "all 0.2s",
              }}>
              {openedAdmin === "admin" ? "✓ Copied & Opened" : "↗ Post to Stock Radar Admin"}
            </button>
            <button
              onClick={() => handlePost("https://ir.stockradars.co/ir-ptt-group-console/message", "mgmt")}
              style={{
                flex: 1, padding: "11px 14px", borderRadius: "10px",
                background: openedAdmin === "mgmt" ? "rgba(168,85,247,0.2)" : "rgba(168,85,247,0.08)",
                border: `1px solid ${openedAdmin === "mgmt" ? "rgba(168,85,247,0.5)" : "rgba(168,85,247,0.2)"}`,
                color: openedAdmin === "mgmt" ? "#d8b4fe" : "#c084fc",
                fontSize: "12px", fontWeight: "600", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                transition: "all 0.2s",
              }}>
              {openedAdmin === "mgmt" ? "✓ Copied & Opened" : "↗ Post to Stock Radar Management"}
            </button>
          </div>
        )}

        {status === "no_data" && (
          <div style={{
            textAlign: "center", padding: "44px 20px",
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px",
          }}>
            <div style={{ fontSize: "28px", marginBottom: "10px" }}>🕐</div>
            <div style={{ fontSize: "13px", color: "#8a9bb8", fontWeight: "500" }}>No data found for {inputToDisplay(selectedDate)}</div>
            <div style={{ fontSize: "11px", color: "#3a4558", marginTop: "5px" }}>
              Market closes 17:00 · News available after 17:30 ICT · Weekdays only
            </div>
          </div>
        )}

        {status === "error" && (
          <div style={{
            textAlign: "center", padding: "44px 20px",
            background: "rgba(200,50,50,0.05)", border: "1px solid rgba(200,50,50,0.15)", borderRadius: "12px",
          }}>
            <div style={{ fontSize: "28px", marginBottom: "10px" }}>⚠️</div>
            <div style={{ fontSize: "13px", color: "#e07070", fontWeight: "500" }}>Failed to fetch digest</div>
            <div style={{ fontSize: "11px", color: "#6b7fa3", marginTop: "5px" }}>Check your connection and try again</div>
          </div>
        )}

        {status === "idle" && (
          <div style={{
            textAlign: "center", padding: "44px 20px",
            background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.07)", borderRadius: "12px",
          }}>
            <div style={{ fontSize: "12px", color: "#3a4558" }}>
              Select a date and press Fetch · Auto-fetch runs daily at 17:30 ICT
            </div>
          </div>
        )}

        <div style={{ marginTop: "14px", fontSize: "10px", color: "#1e2a3a", textAlign: "center" }}>
          Source: ryt9.com · Keyword: ภาวะตลาดหุ้นไทย · Auto 17:30 ICT
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
