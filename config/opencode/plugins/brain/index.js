// brain plugin (OpenCode 2.2.0): oturum başı brief + CLAUDE.md enjeksiyonu, vault yazımlarında
// reindex, yeni oturumda catch-up capture, session.idle sonrası gecikmeli capture. Tüm hatalar yutulur; plugin oturumu asla bozmaz.
// DİKKAT: event.system elemanları { type: "text", text } NESNESİdir; düz string eklemek her
// model isteğini "Schema validation failed" ile kırar.
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";

const NODE = "/opt/homebrew/bin/node";
const SCRIPTS = path.join(os.homedir(), "Obsidian", "brain", "bin", "scripts");
const WRITE_TOOLS = new Set(["write", "edit", "shell"]);

// cwd verilirse alt süreç o dizinde çalışır (opencode CLI'nın proje kapsamı cwd'den gelir).
export const runScript = (script, input, timeout, cwd) =>
  new Promise((resolve) => {
    try {
      const child = execFile(
        NODE,
        [path.join(SCRIPTS, script)],
        { timeout, encoding: "utf8", maxBuffer: 4 * 1024 * 1024, ...(cwd ? { cwd } : {}) },
        (err, stdout) => resolve(err ? "" : String(stdout || "")),
      );
      child.stdin?.on("error", () => {});
      child.stdin?.end(JSON.stringify(input));
    } catch {
      resolve("");
    }
  });

// Test edilebilir çekirdek: dış bağımlılıklar enjekte edilir.
// idleDelayMs: OpenCode'da session-end yok; session.idle'dan sonra bu kadar sessizlik olursa
// (capture QUIET_MS=10 dk eşiğini aşmak için) capture tetiklenir. Süreç önce kapanırsa bir
// sonraki oturum başı catch-up'ı (yaş sınırı yok) yakalar.
export function createHandlers({ getSession, run = runScript, defaultCwd, idleDelayMs = 10 * 60 * 1000 + 30 * 1000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const idleTimers = new Map();
  const briefs = new Map(); // sessionID -> Promise<string> ('' = enjekte etme)
  const captured = new Set();
  const injected = new WeakSet(); // aynı system dizisine ikinci kez eklemeyi önler

  const sessionInfo = async (sessionID) => {
    try {
      // session.get takılırsa model çağrısını bekletme: 3 sn sonra üst-düzey say.
      const res = await Promise.race([
        getSession(sessionID),
        new Promise((resolve) => setTimeout(() => resolve({}), 3000).unref?.()),
      ]);
      return res?.info ?? res ?? {};
    } catch {
      return {}; // get başarısızsa üst-düzey say, ama asla fırlatma
    }
  };

  const resolveBrief = (sessionID) => {
    if (!briefs.has(sessionID)) {
      briefs.set(
        sessionID,
        (async () => {
          const info = await sessionInfo(sessionID);
          if (info.parentID) return ""; // alt oturum: enjeksiyon da capture da yok
          const cwd = info.location?.directory || defaultCwd;
          if (!captured.has(sessionID)) {
            captured.add(sessionID);
            run("opencode-capture.mjs", { cwd }, 10000, cwd).catch(() => {}); // beklenmez
          }
          const text = (await run("opencode-brief.mjs", { cwd }, 5000)).trim();
          return text;
        })().catch(() => ""),
      );
    }
    return briefs.get(sessionID);
  };

  const onContext = async (event) => {
    try {
      if (!event || !Array.isArray(event.system) || !event.sessionID) return;
      if (injected.has(event.system)) return;
      const text = await resolveBrief(event.sessionID);
      if (!text) return;
      injected.add(event.system);
      event.system.push({ type: "text", text });
    } catch {
      /* sessizce geç */
    }
  };

  const onToolAfter = async (event) => {
    try {
      if (!event || !WRITE_TOOLS.has(event.tool) || event.status === "error") return;
      const info = await sessionInfo(event.sessionID);
      const cwd = info.location?.directory || defaultCwd;
      await run("opencode-reindex-hook.mjs", { cwd, tool: event.tool, args: event.input }, 5000);
    } catch {
      /* sessizce geç */
    }
  };

  const onIdle = async (sessionID) => {
    try {
      if (!sessionID) return;
      const info = await sessionInfo(sessionID);
      if (info.parentID) return;
      const cwd = info.location?.directory || defaultCwd;
      if (idleTimers.has(sessionID)) clearTimer(idleTimers.get(sessionID));
      const t = setTimer(() => {
        idleTimers.delete(sessionID);
        run("opencode-capture.mjs", { cwd }, 60000, cwd).catch(() => {});
      }, idleDelayMs);
      t?.unref?.();
      idleTimers.set(sessionID, t);
    } catch {
      /* sessizce geç */
    }
  };

  // event.subscribe akışından gelen olaydan sessionID çıkarır (şema sürümüne dayanıklı).
  const onEvent = (event) => {
    const id = event?.data?.sessionID ?? event?.properties?.sessionID ?? event?.sessionID;
    if (event?.type === "session.idle") return onIdle(id);
  };

  return { onContext, onToolAfter, onIdle, onEvent };
}

export default {
  id: "brain",
  async setup(ctx) {
    try {
      const { onContext, onToolAfter, onEvent } = createHandlers({
        getSession: (id) => ctx.session.get(id),
        defaultCwd: ctx.location?.directory,
      });
      await ctx.session.hook("context", onContext);
      await ctx.tool.hook("execute.after", onToolAfter);
      // session.idle → gecikmeli capture. Akış hatası plugin'i/oturumu etkilemez.
      (async () => {
        try {
          for await (const event of ctx.event.subscribe({ types: ["session.idle"] })) await onEvent(event);
        } catch {
          /* abonelik koptu: yalnız oturum başı catch-up kalır */
        }
      })();
    } catch {
      /* kayıt başarısızsa plugin pasif kalır */
    }
  },
};
