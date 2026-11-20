/* Neighborhood Action Dashboard - módulo de energia (SERS). Sem dependências externas. */
(function () {
  "use strict";
  const D = window.SERS_DATA;
  const M = window.SERSModelo;
  const NS = "http://www.w3.org/2000/svg";
  const ALT_COR = { A0: "var(--ref)", A1: "var(--s1)", A2: "var(--s2)", A3: "var(--s3)" };
  const tip = document.getElementById("tip");

  // ---------------------------------------------------------------- formatação pt-BR
  const nf = (v, c = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
  const brl = (v, c = 0) => "R$ " + nf(v, c);
  const pct = (v, c = 0) => nf(100 * v, c) + "%";
  const anos = (v) => (v === null || v === undefined ? "não se paga em 15 anos" : nf(v, 1) + " anos");
  const compacto = (v) => (Math.abs(v) >= 1000 ? nf(v / 1000, 0) + " mil" : nf(v, 0));

  // ---------------------------------------------------------------- helpers DOM/SVG
  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") e.textContent = v; else e.setAttribute(k, v);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(tag, attrs = {}, parent) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") e.textContent = v; else if (k === "class") e.className = v; else e.setAttribute(k, v);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function svgRoot(container, w, hgt) {
    container.innerHTML = "";
    return el("svg", { viewBox: `0 0 ${w} ${hgt}`, role: "img" }, container);
  }
  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }
  function ticks(max, n = 4) { const out = []; for (let i = 0; i <= n; i++) out.push((max * i) / n); return out; }
  // barra com ponta arredondada (4px) só no fim
  function hbarPath(x, y, w, hh, r = 4) {
    if (w <= 0) return "";
    r = Math.min(r, w, hh / 2);
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hh - r}Q${x + w},${y + hh} ${x + w - r},${y + hh}H${x}Z`;
  }
  function vbarPath(x, yBase, wd, hh, r = 4) {
    if (hh <= 0) return "";
    r = Math.min(r, hh, wd / 2);
    const top = yBase - hh;
    return `M${x},${yBase}V${top + r}Q${x},${top} ${x + r},${top}H${x + wd - r}Q${x + wd},${top} ${x + wd},${top + r}V${yBase}Z`;
  }

  // ---------------------------------------------------------------- tooltip
  function showTip(evt, titulo, linhas) {
    tip.replaceChildren();
    h("div", { class: "t", text: titulo }, tip);
    for (const l of linhas) {
      const r = h("div", { class: "row" }, tip);
      const left = h("span", { class: "n" }, r);
      if (l.cor) { const k = h("span", { class: "lk" }, left); k.style.background = l.cor; }
      left.appendChild(document.createTextNode(l.nome));
      h("b", { text: l.valor }, r);
    }
    tip.style.opacity = 1;
    const x = evt.pageX + 14, y = evt.pageY + 14;
    const w = tip.offsetWidth;
    tip.style.left = (x + w > window.scrollX + window.innerWidth - 8 ? evt.pageX - w - 14 : x) + "px";
    tip.style.top = y + "px";
  }
  const hideTip = () => { tip.style.opacity = 0; };

  function legenda(container, itens) {
    container.replaceChildren();
    for (const it of itens) {
      const s = h("span", {}, container);
      const k = h("span", { class: "k" + (it.dash ? " dash" : "") + (it.box ? " box" : "") }, s);
      if (!it.dash) k.style.background = it.cor;
      s.appendChild(document.createTextNode(it.nome));
    }
  }

  // ---------------------------------------------------------------- gráficos
  function barrasHorizontais(container, itens, fmt) {
    const W = 560, rowH = 46, left = 190, right = 90, top = 6;
    const H = top + rowH * itens.length + 6;
    const svg = svgRoot(container, W, H);
    const max = Math.max(...itens.map((i) => i.valor)) || 1;
    const esc = (v) => ((W - left - right) * v) / max;
    el("line", { x1: left, x2: left, y1: top, y2: H - 4, style: "stroke:var(--axis)", "stroke-width": 1 }, svg);
    itens.forEach((it, i) => {
      const y = top + i * rowH + (rowH - 24) / 2;
      el("text", { x: left - 10, y: y + 16, "text-anchor": "end", "font-size": 13, style: "fill:var(--text-primary)", text: it.nome }, svg);
      const p = el("path", { d: hbarPath(left, y, esc(it.valor), 24), style: `fill:${it.cor}` }, svg);
      el("text", { x: left + esc(it.valor) + 8, y: y + 16, "font-size": 13, "font-weight": 600,
                   style: "fill:var(--text-primary)", text: fmt(it.valor) }, svg);
      const hit = el("rect", { x: 0, y: top + i * rowH, width: W, height: rowH, fill: "transparent", tabindex: 0 }, svg);
      const on = (e) => { p.style.opacity = 0.8; showTip(e.pageX ? e : centro(hit), it.nome, [{ nome: "Rede", valor: fmt(it.valor) + " kWh/mês" }, { nome: "Economia vs A0", valor: it.extra }]); };
      hit.addEventListener("pointermove", on); hit.addEventListener("focus", on);
      hit.addEventListener("pointerleave", () => { p.style.opacity = 1; hideTip(); });
      hit.addEventListener("blur", () => { p.style.opacity = 1; hideTip(); });
    });
  }
  function centro(node) {
    const r = node.getBoundingClientRect();
    return { pageX: r.left + window.scrollX + r.width / 2, pageY: r.top + window.scrollY + r.height / 2 };
  }

  function linhas(container, cfg) {
    const W = 560, H = cfg.altura || 280, m = { l: 52, r: cfg.direita ?? 96, t: 12, b: 30 };
    const svg = svgRoot(container, W, H);
    const n = cfg.x.length;
    const todos = cfg.series.flatMap((s) => s.valores).concat((cfg.refs || []).map((r) => r.y));
    const max = cfg.yMax ?? niceMax(Math.max(...todos));
    const X = (i) => m.l + ((W - m.l - m.r) * i) / (n - 1);
    const Y = (v) => H - m.b - ((H - m.t - m.b) * v) / max;
    for (const t of ticks(max, cfg.nTicks || 4)) {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), style: `stroke:var(${t === 0 ? "--axis" : "--grid"})`, "stroke-width": 1 }, svg);
      el("text", { x: m.l - 8, y: Y(t) + 4, "text-anchor": "end", "font-size": 11, style: "fill:var(--text-muted)", text: cfg.yTick(t) }, svg);
    }
    const passo = cfg.xPasso || 1;
    cfg.x.forEach((lab, i) => {
      if (i % passo === 0 || i === n - 1)
        el("text", { x: X(i), y: H - 10, "text-anchor": "middle", "font-size": 11, style: "fill:var(--text-muted)", text: lab }, svg);
    });
    for (const r of cfg.refs || []) {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(r.y), y2: Y(r.y), style: "stroke:var(--ref)", "stroke-width": 1.5, "stroke-dasharray": "4 3" }, svg);
      el("text", { x: m.l + 6, y: Y(r.y) - 5, "font-size": 11, style: "fill:var(--text-secondary)", text: r.rotulo }, svg);
    }
    for (const a of cfg.anotacoes || []) {
      el("line", { x1: X(a.i), x2: X(a.i), y1: m.t, y2: H - m.b, style: "stroke:var(--axis)", "stroke-width": 1 }, svg);
      el("text", { x: X(a.i) + 4, y: m.t + 10, "font-size": 11, style: "fill:var(--text-secondary)", text: a.texto }, svg);
    }
    for (const s of cfg.series) {
      const d = s.valores.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
      el("path", { d, fill: "none", style: `stroke:${s.cor}`, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
                   ...(s.tracejada ? { "stroke-dasharray": "5 4" } : {}) }, svg);
      const ult = s.valores[n - 1];
      el("circle", { cx: X(n - 1), cy: Y(ult), r: 4, style: `fill:${s.cor};stroke:var(--surface-1)`, "stroke-width": 2 }, svg);
      if (cfg.rotuloFinal !== false)
        el("text", { x: X(n - 1) + 9, y: Y(ult) + 4 + (s.dy || 0), "font-size": 11.5, style: "fill:var(--text-primary)", text: s.rotulo || s.nome }, svg);
    }
    // crosshair
    const cross = el("line", { y1: m.t, y2: H - m.b, style: "stroke:var(--text-muted)", "stroke-width": 1, opacity: 0 }, svg);
    const dots = cfg.series.map((s) => el("circle", { r: 4, style: `fill:${s.cor};stroke:var(--surface-1)`, "stroke-width": 2, opacity: 0 }, svg));
    const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", (e) => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const i = Math.max(0, Math.min(n - 1, Math.round(((loc.x - m.l) / (W - m.l - m.r)) * (n - 1))));
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("opacity", 1);
      cfg.series.forEach((s, k) => { dots[k].setAttribute("cx", X(i)); dots[k].setAttribute("cy", Y(s.valores[i])); dots[k].setAttribute("opacity", 1); });
      const rows = cfg.series.map((s) => ({ nome: s.nome, valor: cfg.fmt(s.valores[i]), cor: s.cor }))
        .sort((a, b) => 0);
      showTip(e, cfg.tituloX(i), rows.concat(cfg.extraTip ? cfg.extraTip(i) : []));
    });
    hit.addEventListener("pointerleave", () => { cross.setAttribute("opacity", 0); dots.forEach((d) => d.setAttribute("opacity", 0)); hideTip(); });
  }

  function colunas(container, cfg) {
    const W = 560, H = 250, m = { l: 44, r: 8, t: 16, b: 30 };
    const svg = svgRoot(container, W, H);
    const n = cfg.valores.length;
    const max = cfg.yMax || niceMax(Math.max(...cfg.valores));
    const banda = (W - m.l - m.r) / n, bw = Math.min(24, banda - 2);
    const Y = (v) => H - m.b - ((H - m.t - m.b) * v) / max;
    for (const t of ticks(max, cfg.nTicks || 4)) {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), style: `stroke:var(${t === 0 ? "--axis" : "--grid"})`, "stroke-width": 1 }, svg);
      el("text", { x: m.l - 8, y: Y(t) + 4, "text-anchor": "end", "font-size": 11, style: "fill:var(--text-muted)", text: nf(t, 0) }, svg);
    }
    cfg.valores.forEach((v, i) => {
      const x = m.l + banda * i + (banda - bw) / 2;
      const p = el("path", { d: vbarPath(x, Y(0), bw, Y(0) - Y(v)), style: `fill:${cfg.cor}` }, svg);
      el("text", { x: x + bw / 2, y: H - 10, "text-anchor": "middle", "font-size": 11, style: "fill:var(--text-muted)", text: cfg.rotulos[i] }, svg);
      if (cfg.rotular && cfg.rotular(i))
        el("text", { x: x + bw / 2, y: Y(v) - 6, "text-anchor": "middle", "font-size": 11.5, "font-weight": 600, style: "fill:var(--text-primary)", text: nf(v, 0) + " W" }, svg);
      const hit = el("rect", { x: m.l + banda * i, y: m.t, width: banda, height: H - m.t - m.b, fill: "transparent", tabindex: 0 }, svg);
      const on = (e) => { p.style.opacity = 0.8; showTip(e.pageX ? e : centro(hit), cfg.rotulos[i] + "h", [{ nome: "Potência média", valor: nf(v, 1) + " W" }, { nome: "Modo", valor: cfg.modo(i) }]); };
      hit.addEventListener("pointermove", on); hit.addEventListener("focus", on);
      const off = () => { p.style.opacity = 1; hideTip(); };
      hit.addEventListener("pointerleave", off); hit.addEventListener("blur", off);
    });
  }

  // ---------------------------------------------------------------- seção 1: KPIs
  const R = D.resultados;
  const ALTS = R.alternativas;
  const byId = Object.fromEntries(ALTS.map((a) => [a.id, a]));
  let sel = "A3";

  document.getElementById("lead").textContent =
    "Hoje a praça tem 20 postes de vapor de sódio de 150 W que ficam 100% acesos das 18h às 6h, mesmo de madrugada sem ninguém, " +
    "com luz amarela fraca e sem aviso quando uma lâmpada queima. Comparamos três formas de melhorar: LED com sensor na rede, " +
    "100% solar e uma híbrida, que é a recomendada.";

  function renderSeg() {
    const seg = document.getElementById("seg");
    seg.replaceChildren();
    for (const a of ALTS) {
      const b = h("button", { type: "button", "aria-pressed": String(a.id === sel) }, seg);
      const k = h("span", { class: "key" }, b); k.style.background = ALT_COR[a.id];
      b.appendChild(document.createTextNode(`${a.id} · ${a.nome}`));
      b.addEventListener("click", () => { sel = a.id; renderSeg(); renderKpis(); });
    }
  }

  function kpi(parent, label, valor, unidade, delta, bom) {
    const c = h("div", { class: "kpi" }, parent);
    h("div", { class: "label", text: label }, c);
    const v = h("div", { class: "value", text: valor }, c);
    if (unidade) h("small", { text: unidade }, v);
    if (delta) h("div", { class: "delta" + (bom ? " good" : ""), text: delta }, c);
  }

  function renderKpis() {
    const a = byId[sel], b = byId.A0;
    const box = document.getElementById("kpis");
    box.replaceChildren();
    const eh0 = a.id === "A0";
    kpi(box, "Consumo de energia da rede", nf(a.consumo_rede_kwh_mes, 0), "kWh/mês",
        eh0 ? "situação atual (referência)" : `▼ ${nf(a.economia_kwh_mes, 0)} kWh/mês vs atual`, !eh0);
    kpi(box, "Economia energética estimada", pct(a.economia_pct, 1), "", eh0 ? "—" : `de ${nf(b.consumo_rede_kwh_mes, 0)} para ${nf(a.consumo_rede_kwh_mes, 0)} kWh/mês`, !eh0);
    kpi(box, "Redução estimada de custos", brl(a.reducao_custo_rs_mes), "/mês",
        eh0 ? `custo atual ${brl(b.custo_operacional_rs_mes)}/mês` : `custo operacional ${brl(a.custo_operacional_rs_mes)}/mês (energia + manutenção)`, !eh0);
    kpi(box, "Participação de energia renovável", pct(a.participacao_renovavel), "",
        a.participacao_renovavel ? `${a.pontos_resilientes_apagao} postes solares próprios` : "sem geração local", a.participacao_renovavel > 0);
    kpi(box, "Emissões evitadas estimadas", nf(a.emissoes_evitadas_kg_ano, 0), "kg CO₂e/ano",
        eh0 ? `emite ${nf(a.emissoes_kg_ano, 0)} kg CO₂e/ano` : `de ${nf(b.emissoes_kg_ano, 0)} para ${nf(a.emissoes_kg_ano, 0)} kg/ano`, !eh0);
    kpi(box, "Tempo de funcionamento eficiente", nf(a.horas_eficientes_dia, 0), "h/dia",
        a.horas_eficientes_dia ? "23h–5h dimerizado, sensor sobe a 100% com presença" : "100% a noite toda", a.horas_eficientes_dia > 0);
    kpi(box, "Investimento e retorno", eh0 ? "—" : brl(a.capex_rs), "",
        eh0 ? "nenhum investimento" : `payback ${anos(a.payback_fluxo_anos)}`, !eh0 && a.payback_fluxo_anos !== null);
    kpi(box, "Pontos acesos em apagão", String(a.pontos_resilientes_apagao), `de ${a.n_pontos}`,
        a.pontos_resilientes_apagao ? `autonomia de ~${nf(R.solar.autonomia_noites_real, 1)} noites sem sol` : "depende 100% da rede", a.pontos_resilientes_apagao > 0);
    document.getElementById("altdesc").textContent = a.descricao;
  }

  // ---------------------------------------------------------------- seção 2: comparação
  function renderComparacao() {
    barrasHorizontais(document.getElementById("ch-consumo"),
      ALTS.map((a) => ({ nome: `${a.id} ${a.nome}`, valor: a.consumo_rede_kwh_mes, cor: ALT_COR[a.id], extra: pct(a.economia_pct, 1) })),
      (v) => nf(v, 0));

    const anosLab = ALTS[0].custo_acumulado_rs.map((_, i) => String(i));
    const series = ["A1", "A2", "A3", "A0"].map((id) => ({
      nome: `${id} ${byId[id].nome}`, rotulo: `${id} · ${compacto(byId[id].tco_rs)}`, cor: ALT_COR[id],
      valores: byId[id].custo_acumulado_rs, tracejada: id === "A0",
    }));
    legenda(document.getElementById("lg-tco"), series.map((s) => ({ nome: s.nome, cor: s.cor, dash: s.tracejada })));
    linhas(document.getElementById("ch-tco"), {
      x: anosLab, xPasso: 3, series, yTick: (t) => compacto(t), fmt: (v) => brl(v),
      tituloX: (i) => (i === 0 ? "Ano 0 (investimento)" : `Ano ${i}`), direita: 84,
    });

    const t = document.getElementById("tb-comp");
    t.replaceChildren();
    const hd = h("tr", {}, h("thead", {}, t));
    h("th", { text: "Critério" }, hd);
    for (const a of ALTS) {
      const th = h("th", {}, hd);
      const k = h("span", { class: "tbl-key" }, th); k.style.background = ALT_COR[a.id];
      th.appendChild(document.createTextNode(`${a.id} ${a.nome}`));
    }
    const Q = {
      "Viabilidade técnica": {
        A0: "Já instalado.",
        A1: "Alta: usa postes e rede existentes; troca simples de luminária. Exige projeto luminotécnico (NBR 5101) e base para controlador.",
        A2: "Média: cada poste precisa de sol sem sombra de árvores ou prédios, suporte para módulo e caixa antifurto para a bateria.",
        A3: "Alta: solar só nos 4 pontos críticos com boa insolação; o resto usa a rede existente.",
      },
      "Impactos ambientais": {
        A0: "Maior consumo; lâmpadas de sódio contêm mercúrio (resíduo perigoso).",
        A1: "Elimina o mercúrio; menos poluição luminosa (luz direcionada e dimerizada). Gera descarte das luminárias antigas.",
        A2: "100% renovável local, mas usa 20 baterias (logística reversa, Lei 12.305/2010) e tem emissões de fabricação.",
        A3: "Elimina o mercúrio; 20% renovável local com só 4 baterias para gerenciar.",
      },
      "Benefícios para a comunidade": {
        A0: "Nenhum investimento.",
        A1: "Luz branca melhora a percepção de segurança; alertas de lâmpada queimada; menor custo para o município.",
        A2: "Funciona em apagão; serve onde não há rede elétrica.",
        A3: "Entrada, travessia para o ônibus e quadra seguem acesas em apagão; vitrine educativa de energia solar.",
      },
      "Limitações": {
        A0: "Luz amarela de baixa reprodução de cor; 100% acesa a noite toda; manutenção só corretiva.",
        A1: "Continua dependente da rede (apagões); 0% renovável local.",
        A2: "Investimento 3,6× maior que A1; troca de baterias no ano 8; risco de furto; excedente solar do verão é desperdiçado.",
        A3: "Duas tecnologias para manter; custa mais que A1 (preço da resiliência).",
      },
    };
    const linhasT = [
      ["Consumo da rede (kWh/mês)", (a) => nf(a.consumo_rede_kwh_mes, 0), true],
      ["Economia de energia", (a) => pct(a.economia_pct, 1), true],
      ["Renovável local", (a) => pct(a.participacao_renovavel), true],
      ["Investimento inicial", (a) => brl(a.capex_rs), true],
      ["Custo operacional (R$/mês)", (a) => brl(a.custo_operacional_rs_mes), true],
      ["Payback (com troca de baterias)", (a) => (a.id === "A0" ? "—" : anos(a.payback_fluxo_anos)), true],
      ["Custo total em 15 anos", (a) => brl(a.tco_rs), true],
      ["Emissões evitadas (kg CO₂e/ano)", (a) => nf(a.emissoes_evitadas_kg_ano, 0), true],
      ...Object.keys(Q).map((k) => [k, (a) => Q[k][a.id], false]),
    ];
    const tb = h("tbody", {}, t);
    for (const [nome, f, numerico] of linhasT) {
      const tr = h("tr", {}, tb);
      h("td", { text: nome }, tr);
      for (const a of ALTS) h("td", { class: numerico ? "num" : "", text: f(a) }, tr);
    }
  }

  // ---------------------------------------------------------------- seção 4: monitoramento
  function renderMonitoramento() {
    const mon = D.monitoramento;
    const dias = mon.por_dia;
    const redeTotal = dias.reduce((s, d) => s + d.rede_kwh, 0);
    const solarTotal = dias.reduce((s, d) => s + d.solar_kwh, 0);
    const box = document.getElementById("kpis-mon");
    kpi(box, "Energia da rede no mês", nf(redeTotal, 0), "kWh", `estimativa: ${nf(mon.estimado_rede_kwh_dia * 30, 0)} kWh`, false);
    kpi(box, "Energia solar consumida", nf(solarTotal, 0), "kWh", `${pct(solarTotal / (redeTotal + solarTotal), 1)} da iluminação`, true);
    kpi(box, "Noites em modo econômico", String(mon.noites_modo_economico), "de 120", "poste-noites com bateria < 70% ao anoitecer", false);
    const nAlert = mon.alertas.filter((a) => a.tipo === "Possível falha da luminária").length;
    kpi(box, "Falhas detectadas", String(nAlert), "", "P11 sem consumo desde o dia 21", false);

    // mapa
    const POS = { P01: [200, 236], P02: [386, 125], P03: [298, 168], P04: [200, 125], P05: [40, 14], P06: [105, 14], P07: [170, 14],
      P08: [235, 14], P09: [300, 14], P10: [365, 14], P11: [386, 52], P12: [386, 198], P13: [60, 236], P14: [130, 236],
      P15: [270, 236], P16: [340, 236], P17: [14, 52], P18: [14, 125], P19: [14, 198], P20: [110, 125] };
    const svg = svgRoot(document.getElementById("ch-mapa"), 400, 270);
    el("rect", { x: 14, y: 14, width: 372, height: 222, rx: 14, style: "fill:var(--surface-2);stroke:var(--axis)" }, svg);
    el("path", { d: "M14,125H386M200,14V236", style: "stroke:var(--grid)", "stroke-width": 10, "stroke-linecap": "round" }, svg);
    el("rect", { x: 250, y: 150, width: 100, height: 60, rx: 4, style: "fill:none;stroke:var(--axis)", "stroke-dasharray": "3 3" }, svg);
    el("text", { x: 300, y: 205, "text-anchor": "middle", "font-size": 10, style: "fill:var(--text-muted)", text: "quadra" }, svg);
    el("text", { x: 200, y: 262, "text-anchor": "middle", "font-size": 10, style: "fill:var(--text-muted)", text: "entrada principal" }, svg);
    el("text", { x: 394, y: 112, "text-anchor": "start", "font-size": 10, style: "fill:var(--text-muted)", text: "ônibus →" }, svg);
    const ult = Object.fromEntries(mon.ultimo_dia_pontos.map((l) => [l.ponto, l]));
    const falhas = new Set(mon.alertas.filter((a) => a.tipo === "Possível falha da luminária" && a.ate === 30).flatMap((a) => a.pontos));
    const STATUS = {
      ok: { cor: "var(--good)", nome: "Funcionando", ic: "✓" },
      eco: { cor: "var(--warning)", nome: "Modo econômico / bateria baixa", ic: "!" },
      falha: { cor: "var(--critical)", nome: "Falha detectada", ic: "×" },
    };
    legenda(document.getElementById("lg-mapa"), Object.values(STATUS).map((s) => ({ nome: `${s.ic} ${s.nome}`, cor: s.cor, box: true })));
    for (const pt of mon.pontos) {
      const l = ult[pt.id];
      const st = falhas.has(pt.id) ? "falha" : (l.modo_economico || (l.soc_fim_noite_pct !== null && l.soc_fim_noite_pct < 30)) ? "eco" : "ok";
      const [x, y] = POS[pt.id];
      const g = el("g", { tabindex: 0 }, svg);
      if (pt.tipo === "led_solar")
        el("rect", { x: x - 7, y: y - 7, width: 14, height: 14, transform: `rotate(45 ${x} ${y})`, style: `fill:${STATUS[st].cor};stroke:var(--surface-1)`, "stroke-width": 2 }, g);
      else el("circle", { cx: x, cy: y, r: 7, style: `fill:${STATUS[st].cor};stroke:var(--surface-1)`, "stroke-width": 2 }, g);
      if (st !== "ok") el("text", { x, y: y + 4, "text-anchor": "middle", "font-size": 10, "font-weight": 700, style: `fill:${st === "eco" ? "#0b0b0b" : "#fff"}`, text: STATUS[st].ic }, g);
      el("circle", { cx: x, cy: y, r: 14, fill: "transparent" }, g);
      const on = (e) => showTip(e.pageX ? e : centro(g), `${pt.id} · ${pt.local}`, [
        { nome: "Status", valor: `${STATUS[st].ic} ${STATUS[st].nome}` },
        { nome: "Fonte", valor: pt.tipo === "led_solar" ? "solar (bateria)" : "rede" },
        { nome: "Energia na noite", valor: nf(l.energia_wh, 0) + " Wh" },
        { nome: "Detecções de presença", valor: String(l.deteccoes) },
        ...(l.soc_fim_noite_pct !== null ? [{ nome: "Bateria ao amanhecer", valor: nf(l.soc_fim_noite_pct, 0) + "%" }] : []),
      ]);
      g.addEventListener("pointermove", on); g.addEventListener("focus", on);
      g.addEventListener("pointerleave", hideTip); g.addEventListener("blur", hideTip);
    }

    // perfil noturno
    const perf = mon.perfil_noite;
    colunas(document.getElementById("ch-perfil"), {
      valores: perf.map((p) => p.potencia_media_w), rotulos: perf.map((p) => String(p.hora)), cor: "var(--s1)", yMax: 80,
      rotular: (i) => i === 0 || i === 7, modo: (i) => ([23, 0, 1, 2, 3, 4].includes(perf[i].hora) ? "dimerizado 30% + presença" : "100%"),
    });

    // energia diária da rede
    const est = mon.estimado_rede_kwh_dia;
    legenda(document.getElementById("lg-rede"), [{ nome: "Medido (simulado)", cor: "var(--s1)" }, { nome: "Estimativa do estudo", dash: true }]);
    linhas(document.getElementById("ch-rede"), {
      x: dias.map((d) => String(d.dia)), xPasso: 5, altura: 250, yMax: 10, nTicks: 5,
      series: [{ nome: "Medido", rotulo: nf(dias[29].rede_kwh, 1) + " kWh", cor: "var(--s1)", valores: dias.map((d) => d.rede_kwh) }],
      refs: [{ y: est, rotulo: "estimado " + nf(est, 1) }], anotacoes: [{ i: 20, texto: "falha no P11" }],
      yTick: (t) => nf(t, 0), fmt: (v) => nf(v, 2) + " kWh", tituloX: (i) => `Dia ${i + 1} de junho`,
      extraTip: () => [{ nome: "Estimativa", valor: nf(est, 2) + " kWh" }], direita: 92,
    });

    // SOC
    legenda(document.getElementById("lg-soc"), [{ nome: "Média dos 4 postes", cor: "var(--s3)" }, { nome: "Poste com menor carga", cor: "var(--s2)" },
      { nome: "Limiar do modo econômico (70%) e reserva (20%)", dash: true }]);
    linhas(document.getElementById("ch-soc"), {
      x: dias.map((d) => String(d.dia)), xPasso: 5, altura: 250, yMax: 100,
      series: [
        { nome: "Média", rotulo: "média", cor: "var(--s3)", valores: dias.map((d) => d.soc_medio_pct), dy: -4 },
        { nome: "Mínimo", rotulo: "mínimo", cor: "var(--s2)", valores: dias.map((d) => d.soc_min_pct), dy: 8 },
      ],
      refs: [{ y: 70, rotulo: "70%" }, { y: 20, rotulo: "reserva 20%" }], anotacoes: [{ i: 11, texto: "2 dias nublados" }],
      yTick: (t) => nf(t, 0) + "%", fmt: (v) => nf(v, 0) + "%", tituloX: (i) => `Dia ${i + 1} de junho`,
      extraTip: (i) => [{ nome: "Sol do dia (HSP)", valor: nf(dias[i].hsp, 1) + " kWh/m²" }], direita: 92,
    });

    // alertas
    const t = document.getElementById("tb-alertas");
    t.replaceChildren();
    const hd = h("tr", {}, h("thead", {}, t));
    for (const c of ["Período", "Pontos", "Alerta", "Ação automática / recomendada"]) h("th", { text: c }, hd);
    const tb = h("tbody", {}, t);
    const CL = { "Possível falha da luminária": ["st-critical", "×"], "Bateria abaixo da reserva": ["st-warning", "!"], "Modo econômico ativado": ["st-info", "i"] };
    const ACAO = {
      "Possível falha da luminária": "Abrir ordem de serviço para a manutenção (troca do driver).",
      "Bateria abaixo da reserva": "Controlador mantém nível mínimo; avaliar módulo de 300 Wp nos pontos de maior fluxo.",
      "Modo econômico ativado": "Automático: 70% no início da noite e 20% na madrugada; presença continua levando a 100%.",
    };
    for (const a of mon.alertas) {
      const tr = h("tr", {}, tb);
      h("td", { class: "num", text: a.de === a.ate ? `dia ${a.de}` : `dias ${a.de}–${a.ate}` }, tr);
      h("td", { text: a.pontos.join(", ") }, tr);
      const td = h("td", {}, tr);
      const s = h("span", { class: "status " + CL[a.tipo][0] }, td);
      h("i", { text: CL[a.tipo][1] }, s);
      s.appendChild(document.createTextNode(a.tipo));
      h("td", { text: ACAO[a.tipo] }, tr);
    }
  }

  // ---------------------------------------------------------------- seção 5: simulador
  const BASE = JSON.parse(JSON.stringify(D.premissas));
  let P = JSON.parse(JSON.stringify(BASE));
  const CONTROLES = [
    { id: "tarifa", rot: "Tarifa de energia", min: 0.3, max: 1.2, step: 0.05, get: (p) => p.economia.tarifa_rs_kwh, set: (p, v) => (p.economia.tarifa_rs_kwh = v), fmt: (v) => brl(v, 2) + "/kWh" },
    { id: "fe", rot: "Fator de emissão da rede", min: 0.02, max: 0.1, step: 0.0005, get: (p) => p.ambiental.fator_emissao_kg_kwh, set: (p, v) => (p.ambiental.fator_emissao_kg_kwh = v), fmt: (v) => nf(v * 1000, 1) + " kg/MWh" },
    { id: "bat", rot: "Preço da bateria", min: 800, max: 2500, step: 50, get: (p) => p.custos.led_solar.bateria_rs_kwh, set: (p, v) => (p.custos.led_solar.bateria_rs_kwh = v), fmt: (v) => brl(v) + "/kWh" },
    { id: "hsp", rot: "Sol no mês crítico (HSP)", min: 2.5, max: 4.5, step: 0.1, get: (p) => p.tecnologias.solar.hsp_projeto, set: (p, v) => (p.tecnologias.solar.hsp_projeto = v), fmt: (v) => nf(v, 1) + " h" },
    { id: "pres", rot: "Tempo com presença (madrugada)", min: 0, max: 0.6, step: 0.05, get: (p) => p.tecnologias.led.fracao_presenca, set: (p, v) => (p.tecnologias.led.fracao_presenca = v), fmt: (v) => pct(v) },
    { id: "dim", rot: "Nível dimerizado", min: 0.1, max: 0.7, step: 0.05, get: (p) => p.tecnologias.led.nivel_dimerizado, set: (p, v) => (p.tecnologias.led.nivel_dimerizado = v), fmt: (v) => pct(v) },
    { id: "led", rot: "Potência do LED", min: 40, max: 100, step: 5, get: (p) => p.tecnologias.led.potencia_w, set: (p, v) => (p.tecnologias.led.potencia_w = v), fmt: (v) => nf(v) + " W" },
    { id: "nsol", rot: "Postes solares na híbrida (A3)", min: 0, max: 20, step: 1, get: (p) => p.alternativas[3].pontos.led_solar, set: (p, v) => { p.alternativas[3].pontos = { led_rede: 20 - v, led_solar: v }; }, fmt: (v) => nf(v) + " de 20" },
  ];
  function renderControles() {
    const box = document.getElementById("controls");
    box.replaceChildren();
    for (const c of CONTROLES) {
      const wrap = h("div", {}, box);
      const lab = h("label", { for: "in-" + c.id }, wrap);
      lab.appendChild(document.createTextNode(c.rot + ": "));
      const out = h("output", { id: "out-" + c.id, text: c.fmt(c.get(P)) }, lab);
      const inp = h("input", { type: "range", id: "in-" + c.id, min: c.min, max: c.max, step: c.step, value: c.get(P) }, wrap);
      inp.addEventListener("input", () => { c.set(P, parseFloat(inp.value)); out.textContent = c.fmt(c.get(P)); renderSim(); });
    }
  }
  function renderSim() {
    const r = M.comparar(P);
    const t = document.getElementById("tb-sim");
    t.replaceChildren();
    const hd = h("tr", {}, h("thead", {}, t));
    const cols = ["Alternativa", "Rede (kWh/mês)", "Economia", "Renovável", "Redução (R$/mês)", "CO₂e evitado (kg/ano)", "Investimento", "Payback", "Custo 15 anos"];
    cols.forEach((c, i) => h("th", { class: i ? "num" : "", text: c }, hd));
    const tb = h("tbody", {}, t);
    const melhor = Math.min(...r.alternativas.map((a) => a.tco_rs));
    for (const a of r.alternativas) {
      const tr = h("tr", { class: a.tco_rs === melhor ? "rec" : "" }, tb);
      const td = h("td", {}, tr);
      const k = h("span", { class: "tbl-key" }, td); k.style.background = ALT_COR[a.id];
      td.appendChild(document.createTextNode(`${a.id} ${a.nome}`));
      [nf(a.consumo_rede_kwh_mes, 0), pct(a.economia_pct, 1), pct(a.participacao_renovavel), brl(a.reducao_custo_rs_mes),
       nf(a.emissoes_evitadas_kg_ano, 0), brl(a.capex_rs), a.id === "A0" ? "—" : anos(a.payback_fluxo_anos), brl(a.tco_rs)]
        .forEach((v) => h("td", { class: "num", text: v }, tr));
    }
    const s = r.solar;
    document.getElementById("sim-note").textContent =
      `Linha destacada = menor custo total em 15 anos. Poste solar redimensionado automaticamente: módulo de ${s.wp_adotado} Wp e bateria de ` +
      `${s.bateria_ah_adotado} Ah (${nf(s.bateria_wh_adotado / 1000, 2)} kWh) para ${nf(s.demanda_wh_dia, 0)} Wh/dia.`;
  }
  document.getElementById("reset").addEventListener("click", () => { P = JSON.parse(JSON.stringify(BASE)); renderControles(); renderSim(); });

  // ---------------------------------------------------------------- premissas
  function renderPremissas() {
    const p = D.premissas, s = R.solar, ul = document.getElementById("lst-prem");
    const itens = [
      `${p.operacao.n_pontos} pontos, ${p.operacao.horas_noite} h/noite, mês de ${p.operacao.dias_mes} dias.`,
      `Atual: VSAP ${p.tecnologias.vsap.potencia_lampada_w} W + ${p.tecnologias.vsap.perdas_reator_w} W de reator. LED: ${p.tecnologias.led.potencia_w} W.`,
      `Dimerização: 100% das 18–23h e 5–6h; 30% das 23–5h, com presença a 100% em ~20% do tempo.`,
      `Tarifa estimada (B4a + tributos): ${brl(p.economia.tarifa_rs_kwh, 2)}/kWh.`,
      `Fator de emissão do SIN: ${nf(p.ambiental.fator_emissao_kg_kwh * 1000, 1)} kg CO₂/MWh (MCTI, 2023).`,
      `Sol no mês crítico: ${nf(p.tecnologias.solar.hsp_projeto, 1)} kWh/m²·dia; PR do sistema isolado ${nf(s.performance_ratio, 2)}.`,
      `Poste solar: módulo ${s.wp_adotado} Wp + LiFePO4 12,8 V ${s.bateria_ah_adotado} Ah (autonomia ${nf(s.autonomia_noites_real, 1)} noites).`,
      `Horizonte de 15 anos, valores constantes; bateria trocada no ano ${p.custos.led_solar.troca_bateria_ano}.`,
    ];
    for (const i of itens) h("li", { text: i }, ul);
    const li = h("li", {}, ul);
    li.appendChild(document.createTextNode("Fontes e memorial completo: "));
    h("a", { href: "../outputs/memorial_calculo.md", text: "outputs/memorial_calculo.md" }, li);
    li.appendChild(document.createTextNode(" e README do repositório."));
  }

  renderSeg(); renderKpis(); renderComparacao(); renderMonitoramento(); renderControles(); renderSim(); renderPremissas();
})();
