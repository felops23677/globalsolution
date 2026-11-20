/*
 * Porta em JavaScript de src/modelo.py, usada pelo simulador de premissas do dashboard.
 * Mesmas fórmulas; a equivalência é verificada por src/verificar_js.mjs.
 */
(function (global) {
  "use strict";

  const energiaKwh = (potenciaW, horas) => (potenciaW * horas) / 1000; // E = P x t / 1000

  function potenciaMediaDimerizadaW(p) {
    const led = p.tecnologias.led;
    const f = led.fracao_presenca;
    return led.potencia_w * (led.nivel_dimerizado * (1 - f) + 1.0 * f);
  }

  function energiaPontoDiaKwh(p, tipo) {
    const op = p.operacao;
    if (tipo === "vsap") {
      const v = p.tecnologias.vsap;
      return energiaKwh(v.potencia_lampada_w + v.perdas_reator_w, op.horas_noite);
    }
    const led = p.tecnologias.led;
    return energiaKwh(led.potencia_w, led.horas_plena)
      + energiaKwh(potenciaMediaDimerizadaW(p), led.horas_dimerizadas)
      + energiaKwh(led.no_iot_w, 24);
  }

  function performanceRatio(p) {
    return Object.values(p.tecnologias.solar.eficiencias).reduce((a, b) => a * b, 1);
  }

  function proximoComercial(valor, lista) {
    const ord = [...lista].sort((a, b) => a - b);
    for (const item of ord) if (item >= valor) return item;
    const maior = ord[ord.length - 1];
    return maior * Math.ceil(valor / maior);
  }

  function dimensionarSolar(p) {
    const s = p.tecnologias.solar;
    const eDiaWh = energiaPontoDiaKwh(p, "led_solar") * 1000;
    const pr = performanceRatio(p);
    const wpMin = eDiaWh / (s.hsp_projeto * pr);
    const wp = proximoComercial(wpMin, s.modulos_comerciais_wp);
    const batWhMin = (eDiaWh * s.autonomia_noites) / (s.profundidade_descarga * s.eficiencia_descarga);
    const ah = proximoComercial(batWhMin / s.tensao_bateria_v, s.baterias_comerciais_ah);
    return { demanda_wh_dia: eDiaWh, performance_ratio: pr, wp_minimo: wpMin, wp_adotado: wp,
             bateria_ah_adotado: ah, bateria_wh_adotado: ah * s.tensao_bateria_v };
  }

  function custosPonto(p, tipo) {
    const c = p.custos;
    if (tipo === "vsap") return { capex: 0, om: p.tecnologias.vsap.om_rs_ponto_ano, subs: {} };
    if (tipo === "led_rede") {
      const r = c.led_rede;
      return { capex: r.luminaria + r.controlador_sensor_iot + r.instalacao, om: r.om_rs_ponto_ano, subs: {} };
    }
    const r = c.led_solar;
    const d = dimensionarSolar(p);
    const modulo = d.wp_adotado * r.modulo_rs_wp;
    const bateria = (d.bateria_wh_adotado / 1000) * r.bateria_rs_kwh;
    const subs = {};
    for (let a = r.troca_bateria_ano; a <= p.economia.horizonte_anos; a += r.troca_bateria_ano) {
      subs[a] = (subs[a] || 0) + bateria;
    }
    return {
      capex: r.luminaria + r.controlador_sensor_iot + modulo + bateria + r.controlador_mppt
        + r.estrutura_caixa_antifurto + r.instalacao,
      om: r.om_rs_ponto_ano, subs,
    };
  }

  function avaliar(p, alt) {
    const op = p.operacao, eco = p.economia;
    let carga = 0, rede = 0, solar = 0, capex = 0, om = 0, n = 0;
    const subs = {};
    for (const [tipo, qtd] of Object.entries(alt.pontos)) {
      const e = energiaPontoDiaKwh(p, tipo) * qtd;
      carga += e;
      if (tipo === "led_solar") solar += e; else rede += e;
      const cp = custosPonto(p, tipo);
      capex += cp.capex * qtd;
      om += cp.om * qtd;
      for (const [a, v] of Object.entries(cp.subs)) subs[a] = (subs[a] || 0) + v * qtd;
      n += qtd;
    }
    const iot = ("led_rede" in alt.pontos) || ("led_solar" in alt.pontos);
    if (iot) { capex += p.custos.gateway_lorawan; om += p.custos.conectividade_rs_mes * 12; }
    const redeAno = rede * op.dias_ano;
    const opAno = redeAno * eco.tarifa_rs_kwh + om;
    const fluxo = [capex];
    for (let a = 1; a <= eco.horizonte_anos; a++) fluxo.push(opAno + (subs[a] || 0));
    const acumulado = [];
    fluxo.reduce((s, v) => { acumulado.push(s + v); return s + v; }, 0);
    return {
      id: alt.id, nome: alt.nome, n_pontos: n,
      carga_total_kwh_mes: carga * op.dias_mes,
      consumo_rede_kwh_mes: rede * op.dias_mes,
      consumo_rede_kwh_ano: redeAno,
      participacao_renovavel: carga ? solar / carga : 0,
      custo_energia_rs_mes: (redeAno * eco.tarifa_rs_kwh) / 12,
      custo_operacional_rs_mes: opAno / 12,
      capex_rs: capex,
      custo_acumulado_rs: acumulado,
      tco_rs: acumulado[acumulado.length - 1],
      emissoes_kg_ano: redeAno * p.ambiental.fator_emissao_kg_kwh,
      pontos_resilientes_apagao: alt.pontos.led_solar || 0,
    };
  }

  function paybackFluxo(alt, base) {
    if (alt[0] === 0) return null;
    for (let a = 1; a < alt.length; a++) {
      const d0 = alt[a - 1] - base[a - 1], d1 = alt[a] - base[a];
      if (d1 <= 0) return d0 !== d1 ? a - 1 + d0 / (d0 - d1) : a;
    }
    return null;
  }

  function comparar(p) {
    const alts = p.alternativas.map((a) => avaliar(p, a));
    const base = alts[0];
    for (const a of alts) {
      a.economia_kwh_mes = base.consumo_rede_kwh_mes - a.consumo_rede_kwh_mes;
      a.economia_pct = base.consumo_rede_kwh_mes ? a.economia_kwh_mes / base.consumo_rede_kwh_mes : 0;
      a.reducao_custo_rs_mes = base.custo_operacional_rs_mes - a.custo_operacional_rs_mes;
      a.emissoes_evitadas_kg_ano = base.emissoes_kg_ano - a.emissoes_kg_ano;
      const econAno = a.reducao_custo_rs_mes * 12;
      a.payback_simples_anos = a.capex_rs && econAno > 0 ? a.capex_rs / econAno : null;
      a.payback_fluxo_anos = paybackFluxo(a.custo_acumulado_rs, base.custo_acumulado_rs);
    }
    return { alternativas: alts, solar: dimensionarSolar(p) };
  }

  const api = { energiaKwh, energiaPontoDiaKwh, dimensionarSolar, comparar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.SERSModelo = api;
})(typeof window !== "undefined" ? window : globalThis);
