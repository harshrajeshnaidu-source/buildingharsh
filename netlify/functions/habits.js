// netlify/functions/habits.js
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = "2def2acebee84dc19145131c0d7f1f89";
 
const HABITS = [
  { key: "Wake 6am",                emoji: "☀️",  track: "Daily System" },
  { key: "Meditate",                emoji: "🧘",  track: "Daily System" },
  { key: "Organise day before bed", emoji: "📋",  track: "Daily System" },
  { key: "Coffee house deep work",  emoji: "☕",  track: "Daily System" },
  { key: "Gym",                     emoji: "🏋️", track: "Body" },
  { key: "Sleep by midnight",       emoji: "🌙",  track: "Body" },
  { key: "Apply to 2 jobs",         emoji: "💼",  track: "Job Hunt" },
  { key: "LinkedIn post",           emoji: "📣",  track: "Job Hunt" },
  { key: "LinkedIn DMs / connections", emoji: "🤝", track: "Job Hunt" },
  { key: "Portfolio work",          emoji: "🗂️", track: "Portfolio" },
  { key: "HPL work",                emoji: "🏆",  track: "HPL" },
  { key: "SQL / AI learning",       emoji: "💻",  track: "Skills" },
];
 
const TRACKS = ["Daily System", "Body", "Job Hunt", "Portfolio", "HPL", "Skills"];
const TRACK_MAX = { "Daily System":4, "Body":2, "Job Hunt":3, "Portfolio":1, "HPL":1, "Skills":1 };
 
function parseDay(props) {
  const completed = {};
  let xp = 0, count = 0;
  for (const h of HABITS) {
    const done = props[h.key]?.checkbox === true;
    completed[h.key] = done;
    if (done) { xp += 10; count++; }
  }
  return { completed, xp, count, total: HABITS.length };
}
 
function calcStreak(days) {
  let streak = 0;
  for (const d of days) { if (d.count >= 8) streak++; else break; }
  return streak;
}
 
function calcLevel(totalXP) {
  const XP_PER_LEVEL = 200;
  return { level: Math.floor(totalXP / XP_PER_LEVEL) + 1, xpIntoLevel: totalXP % XP_PER_LEVEL, xpPerLevel: XP_PER_LEVEL };
}
 
function trackAverages(days) {
  const avgs = {};
  for (const track of TRACKS) {
    const habits = HABITS.filter(h => h.track === track);
    const max = TRACK_MAX[track];
    let totalPct = 0;
    for (const d of days) { const done = habits.filter(h => d.completed[h.key]).length; totalPct += done / max; }
    avgs[track] = days.length > 0 ? Math.round((totalPct / days.length) * 100) : 0;
  }
  return avgs;
}
 
exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
 
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
 
  // Debug: log token presence
  console.log("TOKEN present:", !!NOTION_TOKEN);
  console.log("TOKEN prefix:", NOTION_TOKEN ? NOTION_TOKEN.substring(0, 10) : "MISSING");
  console.log("DATABASE_ID:", DATABASE_ID);
 
  try {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NOTION_TOKEN}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sorts: [{ property: "Date", direction: "descending" }], page_size: 14 }),
      }
    );
 
    // Log the full Notion response for debugging
    const responseText = await response.text();
    console.log("Notion status:", response.status);
    console.log("Notion response:", responseText);
 
    if (!response.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ error: `Notion API error: ${response.status}`, detail: responseText }),
      };
    }
 
    const data = JSON.parse(responseText);
    const days = data.results.map(page => {
      const props = page.properties;
      const dateStr = props["Date"]?.date?.start || null;
      const dayName = props["Day"]?.title?.[0]?.plain_text || dateStr;
      const rating = props["Day Rating"]?.select?.name || null;
      const notes = props["Notes"]?.rich_text?.[0]?.plain_text || "";
      return { id: page.id, date: dateStr, dayName, rating, notes, ...parseDay(props) };
    });
 
    const today = days[0] || null;
    const last7 = days.slice(0, 7);
    const totalXP = days.reduce((sum, d) => sum + d.xp, 0);
    const streak = calcStreak(days);
    const levelData = calcLevel(totalXP);
    const trackAvgs = trackAverages(last7);
    const heatmap = last7.map(d => ({ date: d.date, dayName: d.dayName, pct: Math.round((d.count / d.total) * 100), xp: d.xp, completed: d.completed }));
    const todayTracks = today ? TRACKS.map(track => {
      const habits = HABITS.filter(h => h.track === track);
      const done = habits.filter(h => today.completed[h.key]).length;
      const max = TRACK_MAX[track];
      return { track, done, max, pct: Math.round((done / max) * 100), xp: done * 10, habits: habits.map(h => ({ key: h.key, emoji: h.emoji, done: today.completed[h.key] })) };
    }) : [];
 
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        today: today ? { date: today.date, dayName: today.dayName, count: today.count, total: today.total, xp: today.xp, pct: Math.round((today.count / today.total) * 100), rating: today.rating, notes: today.notes, completed: today.completed } : null,
        streak, totalXP, level: levelData.level, xpIntoLevel: levelData.xpIntoLevel, xpPerLevel: levelData.xpPerLevel,
        trackAverages: trackAvgs, heatmap, todayTracks, habits: HABITS, lastUpdated: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error("Function error:", err.message, err.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, stack: err.stack }) };
  }
};
