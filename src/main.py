"""
Gera todos os resultados do estudo a partir de data/premissas.json:

  outputs/resultados.json        -> números de todas as alternativas
  outputs/memorial_calculo.md    -> memorial de cálculo passo a passo
  data/monitoramento_simulado_*.csv
  dashboard/data.js              -> dados consumidos pelo dashboard

Uso:  python src/main.py
"""
from __future__ import annotations

import json
import shutil

from modelo import (RAIZ, carregar_premissas, comparar, custos_ponto, energia_ponto_dia_kwh,
                    potencia_media_dimerizada_w, sensibilidade_tarifa)
from simulacao import salvar_csv, simular


def brl(v: float, casas: int = 0) -> str:
    s = f"{v:,.{casas}f}"
    return "R$ " + s.replace(",", "X").replace(".", ",").replace("X", ".")


def num(v: float, casas: int = 1) -> str:
    s = f"{v:,.{casas}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def pct(v: float, casas: int = 1) -> str:
    return num(100 * v, casas) + "%"


def anos(v, horizonte: int = 15) -> str:
    if v is None:
        return f"não se paga em {horizonte} anos"
    return num(v, 1) + " anos" + (" (além do horizonte)" if v > horizonte else "")


def memorial(p: dict, r: dict) -> str:
    op, led, vs = p["operacao"], p["tecnologias"]["led"], p["tecnologias"]["vsap"]
    sol, s = r["solar"], p["tecnologias"]["solar"]
    ev = energia_ponto_dia_kwh(p, "vsap")
    el = energia_ponto_dia_kwh(p, "led_rede")
    pdim = potencia_media_dimerizada_w(p)
    cs = custos_ponto(p, "led_solar")
    cl = custos_ponto(p, "led_rede")
    A = {a["id"]: a for a in r["alternativas"]}
    an = r["analises"]
    L = []
    w = L.append
    w("# Memorial de cálculo (gerado por `src/main.py`)\n")
    w("> Valores são **projeções condicionadas às premissas** de `data/premissas.json`, não resultados garantidos.\n")
    w("## 1. Consumo por ponto de iluminação — E = (P × t) / 1000\n")
    w(f"**Atual (VSAP 150 W):** potência no sistema = {vs['potencia_lampada_w']} W (lâmpada) + {vs['perdas_reator_w']} W (reator) "
      f"= {vs['potencia_lampada_w'] + vs['perdas_reator_w']} W, ligada {op['horas_noite']} h/noite a 100%.\n")
    w(f"E = ({vs['potencia_lampada_w'] + vs['perdas_reator_w']} × {op['horas_noite']}) / 1000 = **{num(ev['total'], 3)} kWh/dia por ponto**\n")
    w(f"**LED {led['potencia_w']} W com dimerização e sensor:**\n")
    w(f"- Plena (100%): ({led['potencia_w']} × {led['horas_plena']}) / 1000 = {num(el['plena'], 3)} kWh")
    w(f"- Dimerizada ({pct(led['nivel_dimerizado'], 0)} + presença {pct(led['fracao_presenca'], 0)} do tempo a 100%): "
      f"P média = {led['potencia_w']} × ({num(led['nivel_dimerizado'], 2)} × {num(1 - led['fracao_presenca'], 2)} + 1,0 × {num(led['fracao_presenca'], 2)}) "
      f"= {num(pdim, 1)} W → ({num(pdim, 1)} × {led['horas_dimerizadas']}) / 1000 = {num(el['dimerizada'], 4)} kWh")
    w(f"- Controlador/IoT: ({num(led['no_iot_w'], 1)} × 24) / 1000 = {num(el['iot'], 3)} kWh")
    w(f"- **Total = {num(el['total'], 4)} kWh/dia por ponto** (redução de {pct(1 - el['total'] / ev['total'])} por ponto)\n")

    w("## 2. Consumo e indicadores por alternativa (período de referência: mês de 30 dias e ano de 365 dias)\n")
    w("| Indicador | Unidade | " + " | ".join(f"{a['id']} {a['nome']}" for a in r["alternativas"]) + " |")
    w("|---|---|" + "---|" * len(r["alternativas"]))
    linhas = [
        ("Carga total de iluminação", "kWh/mês", lambda a: num(a["carga_total_kwh_mes"], 1)),
        ("Consumo da rede", "kWh/mês", lambda a: num(a["consumo_rede_kwh_mes"], 1)),
        ("Economia de energia da rede", "kWh/mês", lambda a: num(a["economia_kwh_mes"], 1)),
        ("Economia de energia da rede", "%", lambda a: pct(a["economia_pct"])),
        ("Participação de energia renovável local", "%", lambda a: pct(a["participacao_renovavel"], 0)),
        ("Custo de energia", "R$/mês", lambda a: brl(a["custo_energia_rs_mes"])),
        ("Custo operacional (energia + O&M)", "R$/mês", lambda a: brl(a["custo_operacional_rs_mes"])),
        ("Redução de custo operacional", "R$/mês", lambda a: brl(a["reducao_custo_rs_mes"])),
        ("Emissões (rede)", "kg CO₂e/ano", lambda a: num(a["emissoes_kg_ano"], 0)),
        ("Emissões evitadas", "kg CO₂e/ano", lambda a: num(a["emissoes_evitadas_kg_ano"], 0)),
        ("Tempo de funcionamento eficiente (dimerizado)", "h/dia", lambda a: num(a["horas_eficientes_dia"], 0)),
        ("Investimento inicial", "R$", lambda a: brl(a["capex_rs"])),
        ("Payback simples (vs A0)", "anos", lambda a: "—" if a["id"] == "A0" else anos(a["payback_simples_anos"])),
        ("Payback pelo fluxo de custos (inclui troca de bateria)", "anos", lambda a: "—" if a["id"] == "A0" else anos(a["payback_fluxo_anos"])),
        ("Custo total em 15 anos (TCO)", "R$", lambda a: brl(a["tco_rs"])),
        ("Valor presente dos custos (6% a.a.)", "R$", lambda a: brl(a["vpl_custos_rs"])),
        ("Pontos que ficam acesos em apagão", "pontos", lambda a: str(a["pontos_resilientes_apagao"])),
        ("Lâmpadas com mercúrio em operação", "unid.", lambda a: str(a["pontos_com_mercurio"])),
    ]
    for nome, un, f in linhas:
        w(f"| {nome} | {un} | " + " | ".join(f(a) for a in r["alternativas"]) + " |")
    w("")
    w(f"Exemplo A0: {op['n_pontos']} pontos × {num(ev['total'], 3)} kWh × {op['dias_mes']} dias = {num(A['A0']['consumo_rede_kwh_mes'], 1)} kWh/mês.  ")
    w(f"Exemplo A1: {op['n_pontos']} × {num(el['total'], 4)} × {op['dias_mes']} = {num(A['A1']['consumo_rede_kwh_mes'], 1)} kWh/mês.  ")
    w(f"Emissões evitadas A1 = ({num(A['A0']['consumo_rede_kwh_ano'], 0)} − {num(A['A1']['consumo_rede_kwh_ano'], 0)}) kWh/ano × "
      f"{num(p['ambiental']['fator_emissao_kg_kwh'], 4)} kg/kWh = {num(A['A1']['emissoes_evitadas_kg_ano'], 0)} kg CO₂e/ano.\n")

    w("## 3. Dimensionamento do poste solar isolado (por ponto)\n")
    ef = s["eficiencias"]
    w(f"- Demanda diária: **{num(sol['demanda_wh_dia'], 1)} Wh/dia** (mesmo perfil do LED na rede)")
    w(f"- Rendimento global (PR) = " + " × ".join(num(v, 2) for v in ef.values()) + f" = **{num(sol['performance_ratio'], 3)}**")
    w(f"- Potência FV mínima = E / (HSP crítica × PR) = {num(sol['demanda_wh_dia'], 1)} / ({num(s['hsp_projeto'], 1)} × {num(sol['performance_ratio'], 3)}) "
      f"= {num(sol['wp_minimo'], 1)} Wp → **módulo comercial de {sol['wp_adotado']:.0f} Wp**")
    w(f"- Bateria mínima = E × autonomia / (DoD × η) = {num(sol['demanda_wh_dia'], 1)} × {s['autonomia_noites']} / "
      f"({num(s['profundidade_descarga'], 2)} × {num(s['eficiencia_descarga'], 2)}) = {num(sol['bateria_wh_minimo'], 0)} Wh "
      f"= {num(sol['bateria_ah_minimo'], 1)} Ah a {num(s['tensao_bateria_v'], 1)} V → **LiFePO4 {num(s['tensao_bateria_v'], 1)} V {sol['bateria_ah_adotado']:.0f} Ah "
      f"({num(sol['bateria_wh_adotado'] / 1000, 2)} kWh)**")
    w(f"- Geração no mês crítico: {sol['wp_adotado']:.0f} × {num(s['hsp_projeto'], 1)} × {num(sol['performance_ratio'], 3)} = "
      f"{num(sol['geracao_mes_critico_wh_dia'], 0)} Wh/dia (margem de {pct(sol['margem_mes_critico'])})")
    w(f"- Autonomia real sem sol: {num(sol['autonomia_noites_real'], 1)} noites")
    w(f"- Geração média anual: {num(sol['geracao_media_anual_kwh'], 0)} kWh/ano por poste para demanda de "
      f"{num(sol['demanda_anual_kwh'], 0)} kWh/ano → aproveitamento de {pct(sol['aproveitamento_anual'], 0)} "
      f"(sistema isolado: excedente do verão não é aproveitado)\n")

    w("## 4. Custos por ponto (estimativas de ordem de grandeza)\n")
    w(f"- LED na rede: {brl(cl['capex'])} por ponto (luminária + controlador/sensor + instalação); O&M {brl(cl['om_ano'])}/ano")
    w(f"- Poste solar: {brl(cs['capex'])} por ponto (inclui módulo {brl(cs['detalhe']['modulo'])} e bateria "
      f"{brl(cs['detalhe']['bateria'])}); O&M {brl(cs['om_ano'])}/ano; troca da bateria no ano "
      f"{p['custos']['led_solar']['troca_bateria_ano']}")
    w(f"- Gateway LoRaWAN compartilhado: {brl(p['custos']['gateway_lorawan'])} + conectividade "
      f"{brl(p['custos']['conectividade_rs_mes'])}/mês\n")

    w("## 5. Análises de equilíbrio (quando o 100% solar compensa?)\n")
    w(f"- Tarifa a partir da qual A2 empata com A1 em 15 anos: **{brl(an['tarifa_equilibrio_A2_vs_A1_rs_kwh'], 2)}/kWh** "
      f"(premissa atual: {brl(p['economia']['tarifa_rs_kwh'], 2)}/kWh)")
    w(f"- Custo de levar rede a um ponto novo a partir do qual o solar compensa: **{brl(an['custo_extensao_rede_equilibrio_rs_ponto'])} por ponto** "
      f"(vala, eletroduto, cabo e caixa de passagem em área sem rede)")
    w(f"- Custo de abatimento do CO₂ de A2 em relação a A1: {brl(an['custo_marginal_co2_A2_vs_A1_rs_t'])}/t CO₂ "
      f"(muito alto porque a rede brasileira já é majoritariamente renovável)\n")

    w("## 6. Sensibilidade à tarifa\n")
    w("| Tarifa (R$/kWh) | Payback A1 | Payback A2 | Payback A3 | TCO A1 | TCO A2 | TCO A3 |")
    w("|---|---|---|---|---|---|---|")
    for l in r["sensibilidade_tarifa"]:
        w(f"| {num(l['tarifa_rs_kwh'], 2)} | {anos(l['A1']['payback_simples_anos'])} | {anos(l['A2']['payback_simples_anos'])} | "
          f"{anos(l['A3']['payback_simples_anos'])} | {brl(l['A1']['tco_rs'])} | {brl(l['A2']['tco_rs'])} | {brl(l['A3']['tco_rs'])} |")
    w("")
    return "\n".join(L)


def main() -> None:
    p = carregar_premissas()
    r = comparar(p)
    r["sensibilidade_tarifa"] = sensibilidade_tarifa(p)
    sim = simular(p)
    salvar_csv(sim)

    out = RAIZ / "outputs"
    out.mkdir(exist_ok=True)
    with open(out / "resultados.json", "w", encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False, indent=2)
    with open(out / "memorial_calculo.md", "w", encoding="utf-8") as f:
        f.write(memorial(p, r))

    sim_dash = {k: sim[k] for k in ("pontos", "por_dia", "perfil_noite", "alertas", "estimado_rede_kwh_dia",
                                    "noites_modo_economico", "noites_abaixo_reserva")}
    sim_dash["ultimo_dia_pontos"] = [l for l in sim["diario_ponto"] if l["dia"] == 30]
    payload = {"premissas": p, "resultados": r, "monitoramento": sim_dash}
    with open(RAIZ / "dashboard" / "data.js", "w", encoding="utf-8") as f:
        f.write("// Gerado por src/main.py - não editar à mão\n")
        f.write("window.SERS_DATA = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")

    shutil.copy(RAIZ / "docs" / "diagrama.svg", RAIZ / "dashboard" / "diagrama.svg")

    A = {a["id"]: a for a in r["alternativas"]}
    for k, a in A.items():
        print(f"{k} {a['nome']:<28} rede {a['consumo_rede_kwh_mes']:7.1f} kWh/mês  econ {a['economia_pct']*100:5.1f}%  "
              f"R$/mês red {a['reducao_custo_rs_mes']:7.0f}  CO2 evit {a['emissoes_evitadas_kg_ano']:5.0f}  "
              f"capex {a['capex_rs']:8.0f}  payback {a['payback_simples_anos']}  TCO {a['tco_rs']:9.0f}  ren {a['participacao_renovavel']*100:.0f}%")
    print("solar:", {k: round(v, 3) for k, v in r["solar"].items()})
    print("analises:", r["analises"])
    for a in sim["alertas"]:
        print("  alerta", a["de"], a["ate"], a["pontos"], a["tipo"])
    print("noites eco", sim["noites_modo_economico"], "abaixo reserva", sim["noites_abaixo_reserva"])
    print("perfil:", sim["perfil_noite"])
    print("soc min:", min(d["soc_min_pct"] for d in sim["por_dia"]), "rede média kWh/dia",
          sum(d["rede_kwh"] for d in sim["por_dia"]) / 30, "estimado", sim["estimado_rede_kwh_dia"])


if __name__ == "__main__":
    main()
