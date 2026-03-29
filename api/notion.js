// /api/notion.js — Vercel Serverless Function
// Fetches active calls & history from Notion, filtered by your Telegram group chat_id
// Set NOTION_API_KEY in Vercel environment variables (never expose in frontend!)

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const CHAT_ID = "-1001758884916"; // Your Telegram group chat_id

// Notion database IDs (from your workspace)
const ALERTS_DB_ID = "e756c4cf39eb48caa461a3faca6f8ab0";   // MungBot Alerts (active calls)
const HISTORY_DB_ID = "47f287ad128844b0b4911c6e6f983b16";  // MungBot Call History (closed)

const NOTION_VERSION = "2022-06-28";

async function queryNotionDB(databaseId, filter) {
  const body = { page_size: 100 };
  if (filter) body.filter = filter; // only include filter if provided

  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error ${res.status}: ${err}`);
  }

  return res.json();
}

function parseActiveCalls(pages) {
  return pages
    .filter((p) => {
      // Filter by chat_id inside the `target` JSON field
      const target = p.properties?.target?.rich_text?.[0]?.plain_text || "";
      try {
        const parsed = JSON.parse(target);
        return String(parsed.chat_id) === CHAT_ID;
      } catch {
        return false;
      }
    })
    .map((p) => {
      const target = JSON.parse(p.properties?.target?.rich_text?.[0]?.plain_text || "{}");
      return {
        id: p.id,
        symbol: p.properties?.symbol?.rich_text?.[0]?.plain_text || "",
        direction: p.properties?.direction?.rich_text?.[0]?.plain_text || "",
        active: p.properties?.active?.checkbox || false,
        entry: target.entry ?? null,
        tp: target.tp ?? null,
        sl: target.sl ?? null,
        username: target.username || "",
        status: target.status || "",
        createdAt: p.created_time,
      };
    })
    .filter((c) => c.active); // only active
}

function parseHistory(pages) {
  return pages
    .filter((p) => {
      const chatId = p.properties?.chat_id?.rich_text?.[0]?.plain_text || "";
      return chatId === CHAT_ID;
    })
    .map((p) => ({
      id: p.id,
      name: p.properties?.Name?.title?.[0]?.plain_text || "",
      symbol: p.properties?.symbol?.rich_text?.[0]?.plain_text || "",
      callType: p.properties?.call_type?.select?.name || "",
      entry: p.properties?.entry?.rich_text?.[0]?.plain_text || "",
      tp: p.properties?.tp?.rich_text?.[0]?.plain_text || "",
      sl: p.properties?.sl?.rich_text?.[0]?.plain_text || "",
      pnlPct: p.properties?.pnl_pct?.rich_text?.[0]?.plain_text || "",
      result: p.properties?.result?.select?.name || "",
      closedDate: p.properties?.closed_date?.date?.start || null,
      month: p.properties?.month?.rich_text?.[0]?.plain_text || "",
      username: p.properties?.username?.rich_text?.[0]?.plain_text || "",
    }));
}

function calcStats(history) {
  const closed = history.filter((h) => h.result === "tp_hit" || h.result === "sl_hit");
  const wins = closed.filter((h) => h.result === "tp_hit").length;
  const losses = closed.filter((h) => h.result === "sl_hit").length;
  const total = closed.length;
  const winrate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";

  // Average PnL of closed calls (parse numeric)
  const pnlValues = closed
    .map((h) => parseFloat(h.pnlPct))
    .filter((v) => !isNaN(v));
  const avgPnl =
    pnlValues.length > 0
      ? (pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length).toFixed(2)
      : "0.00";

  // Monthly breakdown
  const byMonth = {};
  closed.forEach((h) => {
    const key = h.month || "Unknown";
    if (!byMonth[key]) byMonth[key] = { wins: 0, losses: 0 };
    if (h.result === "tp_hit") byMonth[key].wins++;
    else byMonth[key].losses++;
  });

  return { total, wins, losses, winrate, avgPnl, byMonth };
}

export default async function handler(req, res) {
  // CORS — allow your domain only
  res.setHeader("Access-Control-Allow-Origin", "https://mungxbt.site");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!NOTION_API_KEY) {
    return res.status(500).json({ error: "NOTION_API_KEY not configured" });
  }

  try {
    // Fetch active calls — type = call_tracker AND active = true
    const alertsData = await queryNotionDB(ALERTS_DB_ID, {
      and: [
        { property: "type", select: { equals: "call_tracker" } },
        { property: "active", checkbox: { equals: true } },
      ],
    });

    // Fetch all history (no filter, we'll filter by chat_id in parseHistory)
    const historyData = await queryNotionDB(HISTORY_DB_ID, null);

    const activeCalls = parseActiveCalls(alertsData.results || []);
    const history = parseHistory(historyData.results || []);
    const stats = calcStats(history);

    return res.status(200).json({
      activeCalls,
      history: history.slice(0, 50), // last 50 for dashboard
      stats,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error fetching Notion data:", err);
    return res.status(500).json({ error: "Failed to fetch data", detail: err.message });
  }
}
