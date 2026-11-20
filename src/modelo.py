"""
Modelo energético, econômico e ambiental - SERS / Neighborhood Action Dashboard.

Todas as funções são puras: recebem o dicionário de premissas (data/premissas.json)
e devolvem números. Unidades estão no nome das variáveis (_w, _wh, _kwh, _rs ...).

Expressão base exigida pela disciplina:  E = (P x t) / 1000   [kWh]
"""
from __future__ import annotations

import json
import math
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def carregar_premissas(caminho: Path | None = None) -> dict:
    caminho = caminho or RAIZ / "data" / "premissas.json"
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def energia_kwh(potencia_w: float, horas: float) -> float:
    """E = (P x t) / 1000."""
    return potencia_w * horas / 1000.0


# ---------------------------------------------------------------- consumo por ponto
def potencia_media_dimerizada_w(p: dict) -> float:
    """Potência média no período dimerizado: base em nível reduzido + picos a 100% por presença."""
    led = p["tecnologias"]["led"]
    f = led["fracao_presenca"]
    return led["potencia_w"] * (led["nivel_dimerizado"] * (1 - f) + 1.0 * f)


def energia_ponto_dia_kwh(p: dict, tipo: str) -> dict:
    """Energia diária de UM ponto de iluminação, detalhada por parcela."""
    op = p["operacao"]
    if tipo == "vsap":
        v = p["tecnologias"]["vsap"]
        potencia = v["potencia_lampada_w"] + v["perdas_reator_w"]
        total = energia_kwh(potencia, op["horas_noite"])
        return {"plena": total, "dimerizada": 0.0, "iot": 0.0, "total": total}
    if tipo in ("led_rede", "led_solar"):
        led = p["tecnologias"]["led"]
        plena = energia_kwh(led["potencia_w"], led["horas_plena"])
        dim = energia_kwh(potencia_media_dimerizada_w(p), led["horas_dimerizadas"])
        iot = energia_kwh(led["no_iot_w"], 24)
        return {"plena": plena, "dimerizada": dim, "iot": iot, "total": plena + dim + iot}
    raise ValueError(f"tipo desconhecido: {tipo}")


# ---------------------------------------------------------------- dimensionamento FV isolado
def performance_ratio(p: dict) -> float:
    pr = 1.0
    for eta in p["tecnologias"]["solar"]["eficiencias"].values():
        pr *= eta
    return pr


def _proximo_comercial(valor: float, lista: list[float]) -> float:
    for item in sorted(lista):
        if item >= valor:
            return item
    # acima do maior: múltiplos do maior
    maior = max(lista)
    return maior * math.ceil(valor / maior)


def dimensionar_solar(p: dict) -> dict:
    s = p["tecnologias"]["solar"]
    e_dia_wh = energia_ponto_dia_kwh(p, "led_solar")["total"] * 1000
    pr = performance_ratio(p)

    wp_min = e_dia_wh / (s["hsp_projeto"] * pr)
    wp = _proximo_comercial(wp_min, s["modulos_comerciais_wp"])

    bat_wh_min = e_dia_wh * s["autonomia_noites"] / (s["profundidade_descarga"] * s["eficiencia_descarga"])
    ah_min = bat_wh_min / s["tensao_bateria_v"]
    ah = _proximo_comercial(ah_min, s["baterias_comerciais_ah"])
    bat_wh = ah * s["tensao_bateria_v"]

    geracao_critica_wh_dia = wp * s["hsp_projeto"] * pr
    geracao_anual_kwh = wp * s["hsp_media_anual"] * pr * p["operacao"]["dias_ano"] / 1000
    demanda_anual_kwh = e_dia_wh * p["operacao"]["dias_ano"] / 1000
    autonomia_real = bat_wh * s["profundidade_descarga"] * s["eficiencia_descarga"] / e_dia_wh

    return {
        "demanda_wh_dia": e_dia_wh,
        "performance_ratio": pr,
        "wp_minimo": wp_min,
        "wp_adotado": wp,
        "bateria_wh_minimo": bat_wh_min,
        "bateria_ah_minimo": ah_min,
        "bateria_ah_adotado": ah,
        "bateria_wh_adotado": bat_wh,
        "geracao_mes_critico_wh_dia": geracao_critica_wh_dia,
        "margem_mes_critico": geracao_critica_wh_dia / e_dia_wh - 1,
        "geracao_media_anual_kwh": geracao_anual_kwh,
        "demanda_anual_kwh": demanda_anual_kwh,
        "aproveitamento_anual": min(1.0, demanda_anual_kwh / geracao_anual_kwh),
        "autonomia_noites_real": autonomia_real,
    }


# ---------------------------------------------------------------- custos por ponto
def custos_ponto(p: dict, tipo: str) -> dict:
    """CAPEX, O&M anual e substituições previstas de UM ponto."""
    c = p["custos"]
    if tipo == "vsap":
        return {"capex": 0.0, "om_ano": p["tecnologias"]["vsap"]["om_rs_ponto_ano"], "substituicoes": {}}
    if tipo == "led_rede":
        r = c["led_rede"]
        return {"capex": r["luminaria"] + r["controlador_sensor_iot"] + r["instalacao"],
                "om_ano": r["om_rs_ponto_ano"], "substituicoes": {}}
    if tipo == "led_solar":
        r = c["led_solar"]
        dim = dimensionar_solar(p)
        modulo = dim["wp_adotado"] * r["modulo_rs_wp"]
        bateria = dim["bateria_wh_adotado"] / 1000 * r["bateria_rs_kwh"]
        capex = (r["luminaria"] + r["controlador_sensor_iot"] + modulo + bateria
                 + r["controlador_mppt"] + r["estrutura_caixa_antifurto"] + r["instalacao"])
        subs = {}
        ano = r["troca_bateria_ano"]
        while ano <= p["economia"]["horizonte_anos"]:
            subs[ano] = subs.get(ano, 0) + bateria
            ano += r["troca_bateria_ano"]
        return {"capex": capex, "om_ano": r["om_rs_ponto_ano"], "substituicoes": subs,
                "detalhe": {"modulo": modulo, "bateria": bateria}}
    raise ValueError(tipo)


# ---------------------------------------------------------------- alternativas
def _usa_iot(alt: dict) -> bool:
    return any(t in alt["pontos"] for t in ("led_rede", "led_solar"))


def avaliar_alternativa(p: dict, alt: dict) -> dict:
    op, eco, amb = p["operacao"], p["economia"], p["ambiental"]
    tarifa = eco["tarifa_rs_kwh"]

    carga_dia = rede_dia = solar_dia = 0.0
    capex = om_ano = 0.0
    subs: dict[int, float] = {}
    n_total = 0
    for tipo, n in alt["pontos"].items():
        e = energia_ponto_dia_kwh(p, tipo)["total"] * n
        carga_dia += e
        if tipo == "led_solar":
            solar_dia += e
        else:
            rede_dia += e
        cp = custos_ponto(p, tipo)
        capex += cp["capex"] * n
        om_ano += cp["om_ano"] * n
        for ano, v in cp["substituicoes"].items():
            subs[ano] = subs.get(ano, 0) + v * n
        n_total += n

    if _usa_iot(alt):
        capex += p["custos"]["gateway_lorawan"]
        om_ano += p["custos"]["conectividade_rs_mes"] * 12

    rede_mes = rede_dia * op["dias_mes"]
    rede_ano = rede_dia * op["dias_ano"]
    custo_energia_ano = rede_ano * tarifa
    custo_operacional_ano = custo_energia_ano + om_ano

    # fluxo de custos (R$ constantes) para TCO e VPL
    fluxo = [capex] + [custo_operacional_ano + subs.get(a, 0) for a in range(1, eco["horizonte_anos"] + 1)]
    acumulado = []
    s = 0.0
    for v in fluxo:
        s += v
        acumulado.append(s)
    vpl = sum(v / (1 + eco["taxa_desconto_real"]) ** a for a, v in enumerate(fluxo))

    n_solar = alt["pontos"].get("led_solar", 0)
    n_led = alt["pontos"].get("led_rede", 0) + n_solar
    led = p["tecnologias"]["led"]

    return {
        "id": alt["id"],
        "nome": alt["nome"],
        "descricao": alt["descricao"],
        "pontos": alt["pontos"],
        "n_pontos": n_total,
        "carga_total_kwh_mes": carga_dia * op["dias_mes"],
        "consumo_rede_kwh_mes": rede_mes,
        "consumo_rede_kwh_ano": rede_ano,
        "geracao_renovavel_kwh_mes": solar_dia * op["dias_mes"],
        "participacao_renovavel": solar_dia / carga_dia if carga_dia else 0.0,
        "custo_energia_rs_mes": custo_energia_ano / 12,
        "custo_om_rs_ano": om_ano,
        "custo_operacional_rs_mes": custo_operacional_ano / 12,
        "capex_rs": capex,
        "substituicoes_rs": subs,
        "fluxo_custos_rs": fluxo,
        "custo_acumulado_rs": acumulado,
        "tco_rs": acumulado[-1],
        "vpl_custos_rs": vpl,
        "emissoes_kg_ano": rede_ano * amb["fator_emissao_kg_kwh"],
        "horas_eficientes_dia": led["horas_dimerizadas"] if n_led else 0,
        "pontos_resilientes_apagao": n_solar,
        "pontos_com_mercurio": alt["pontos"].get("vsap", 0),
        "bateria_kwh_instalada": n_solar * dimensionar_solar(p)["bateria_wh_adotado"] / 1000,
    }


def comparar(p: dict) -> dict:
    alts = [avaliar_alternativa(p, a) for a in p["alternativas"]]
    base = alts[0]
    for a in alts:
        a["economia_kwh_mes"] = base["consumo_rede_kwh_mes"] - a["consumo_rede_kwh_mes"]
        a["economia_pct"] = a["economia_kwh_mes"] / base["consumo_rede_kwh_mes"] if base["consumo_rede_kwh_mes"] else 0
        a["reducao_custo_rs_mes"] = base["custo_operacional_rs_mes"] - a["custo_operacional_rs_mes"]
        a["emissoes_evitadas_kg_ano"] = base["emissoes_kg_ano"] - a["emissoes_kg_ano"]
        econ_ano = a["reducao_custo_rs_mes"] * 12
        a["payback_simples_anos"] = (a["capex_rs"] / econ_ano) if (a["capex_rs"] and econ_ano > 0) else None
        a["payback_fluxo_anos"] = _payback_fluxo(a["custo_acumulado_rs"], base["custo_acumulado_rs"])
        a["economia_tco_rs"] = base["tco_rs"] - a["tco_rs"]
    return {"alternativas": alts, "solar": dimensionar_solar(p), "analises": analises_equilibrio(p, alts)}


def _payback_fluxo(acum_alt: list[float], acum_base: list[float]):
    """Ano (fracionário) em que o custo acumulado da alternativa fica <= ao da situação atual."""
    if acum_alt[0] == 0:
        return None
    for ano in range(1, len(acum_alt)):
        d0 = acum_alt[ano - 1] - acum_base[ano - 1]
        d1 = acum_alt[ano] - acum_base[ano]
        if d1 <= 0:
            return ano - 1 + d0 / (d0 - d1) if d0 != d1 else ano
    return None  # não se paga dentro do horizonte


def analises_equilibrio(p: dict, alts: list[dict]) -> dict:
    """Em que condições a alternativa 100% solar empata com o LED na rede?"""
    a1 = next(a for a in alts if a["id"] == "A1")
    a2 = next(a for a in alts if a["id"] == "A2")
    h = p["economia"]["horizonte_anos"]
    tco1_sem_energia = a1["tco_rs"] - a1["consumo_rede_kwh_ano"] * p["economia"]["tarifa_rs_kwh"] * h
    tarifa_eq = (a2["tco_rs"] - tco1_sem_energia) / (a1["consumo_rede_kwh_ano"] * h)
    extensao_eq = (a2["tco_rs"] - a1["tco_rs"]) / a2["n_pontos"]
    return {
        "tarifa_equilibrio_A2_vs_A1_rs_kwh": tarifa_eq,
        "custo_extensao_rede_equilibrio_rs_ponto": extensao_eq,
        "custo_marginal_co2_A2_vs_A1_rs_t": (a2["tco_rs"] - a1["tco_rs"])
        / ((a1["emissoes_kg_ano"] - a2["emissoes_kg_ano"]) * h / 1000),
    }


def sensibilidade_tarifa(p: dict, tarifas=(0.40, 0.50, 0.70, 0.90)) -> list[dict]:
    linhas = []
    for t in tarifas:
        q = json.loads(json.dumps(p))
        q["economia"]["tarifa_rs_kwh"] = t
        r = comparar(q)["alternativas"]
        linhas.append({"tarifa_rs_kwh": t, **{a["id"]: {"payback_simples_anos": a["payback_simples_anos"],
                                                        "tco_rs": a["tco_rs"]} for a in r}})
    return linhas
