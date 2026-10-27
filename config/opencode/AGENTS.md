# OpenCode global kuralları (kişisel)

- Rol -> model: orchestrator=deepseek-v4.1-flash, orchestrator-lite=mimo-v2.6-flash, dev=mimo-v2.6-flash, runner=glm-5.3-flash, scout=qwen3.8-flash, reviewer=deepseek-v4-pro, sim-qa=mimo-v2.6-flash (görsel girdi).
- Ajan id'leri Claude ile aynı: dev, runner, scout, reviewer, sim-qa. Repo CLAUDE.md / skill'ler bu isimlerle dispatch eder; "sonnet" = dev/reviewer, "haiku" = runner/scout demektir.
- Orchestrator planlar, karar verir, sahibe raporlar; düzenleme dev'e, mekanik iş runner'a, kod bulma scout'a, diff incelemesi reviewer'a gider.
- Peak: hafta içi TR 04–07 ve 09–13 DeepSeek 2x pahalı: `orchestrator-lite` kullan, `reviewer`'ı 13:00 sonrasına bırak.
- Kota: Go kotası tüm modellerde ORTAK (5 saat / haftalık / aylık). Kaldıraç ucuz model: mekanik iş runner/scout'a, uzun bağlam orchestrator'da tutulmaz; limite dayanınca model değiştirmek kurtarmaz, işi küçült.
- Repo CLAUDE.md kuralları brain plugin'i ile enjekte edilir (Task 3 sonrası). Kurallar çelişirse repo CLAUDE.md kazanır.
- Brain: geçmiş karar/tercih/durum için önce `node ~/Obsidian/brain/bin/scripts/search.mjs "<terimler>"` ile ara.
- Sırlar: `service.json` ve `auth.json` okunmaz, yazdırılmaz.
- Arka plan işi yok: `&`, nohup, arka plan komutu kullanma; uzun işlerde ön planda `timeout`.
- Çıktı hijyeni: uzun çıktıyı dosyaya yönlendir, tail/grep ile oku.
