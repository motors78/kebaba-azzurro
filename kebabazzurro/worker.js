const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    // GET /reviews  -> recensioni approvate (opzionale ?sede=epomeo|lepanto)
    if (path === "/reviews" && req.method === "GET") {
      const sede = url.searchParams.get("sede");
      const stmt = sede
        ? env.DB.prepare(
            "SELECT id,sede,name,rating,text,created_at FROM reviews WHERE status='approved' AND sede=? ORDER BY created_at DESC"
          ).bind(sede)
        : env.DB.prepare(
            "SELECT id,sede,name,rating,text,created_at FROM reviews WHERE status='approved' ORDER BY created_at DESC"
          );
      const { results } = await stmt.all();
      return json(results);
    }

    // POST /reviews -> invio nuova recensione (finisce in pending)
    if (path === "/reviews" && req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || !body.name || !body.text || !body.rating || !body.sede) {
        return json({ error: "Campi mancanti" }, 400);
      }
      const rating = Math.min(5, Math.max(1, parseInt(body.rating, 10) || 5));
      await env.DB.prepare(
        "INSERT INTO reviews (sede,name,rating,text,status) VALUES (?,?,?,?,'pending')"
      )
        .bind(body.sede, body.name.slice(0, 60), rating, body.text.slice(0, 600))
        .run();
      return json({ ok: true });
    }

    // GET /admin/pending?key=... -> recensioni in attesa di moderazione
    if (path === "/admin/pending" && req.method === "GET") {
      if (url.searchParams.get("key") !== env.ADMIN_KEY) return json({ error: "unauthorized" }, 401);
      const { results } = await env.DB.prepare(
        "SELECT id,sede,name,rating,text,created_at FROM reviews WHERE status='pending' ORDER BY created_at DESC"
      ).all();
      return json(results);
    }

    // POST /admin/approve  {id, key} -> pubblica una recensione
    if (path === "/admin/approve" && req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || body.key !== env.ADMIN_KEY) return json({ error: "unauthorized" }, 401);
      await env.DB.prepare("UPDATE reviews SET status='approved' WHERE id=?").bind(body.id).run();
      return json({ ok: true });
    }

    // POST /admin/reject  {id, key} -> elimina una recensione
    if (path === "/admin/reject" && req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || body.key !== env.ADMIN_KEY) return json({ error: "unauthorized" }, 401);
      await env.DB.prepare("DELETE FROM reviews WHERE id=?").bind(body.id).run();
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  },
};
