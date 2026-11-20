"""
Simulação de 30 dias de monitoramento (dados SIMULADOS, não medidos) da alternativa
recomendada A3: 16 pontos LED na rede + 4 postes solares.

Objetivo: demonstrar a lógica de monitoramento que alimenta o dashboard:
  - leitura horária de potência por ponto (sensor/medidor do controlador)
  - detecções de presença (sensor PIR/micro-ondas)
  - estado de carga (SOC) das baterias dos postes solares
  - regras de alerta (falha de luminária, bateria baixa)

Mês simulado: junho (mês de menor irradiação = pior caso para o solar).
Semente fixa -> resultados reprodutíveis.
"""
from __future__ import annotations

import csv
import random

from modelo import RAIZ, dimensionar_solar, performance_ratio

SEMENTE = 2026
DIAS = 30

# Horas da noite em ordem (noite do dia d começa 18h do dia d e termina 6h do dia d+1)
HORAS_NOITE = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5]
# Fração média do tempo com presença detectada em cada hora dimerizada (média = 0,20)
PRESENCA_MEDIA = {23: 0.35, 0: 0.25, 1: 0.15, 2: 0.12, 3: 0.13, 4: 0.20}
MINUTOS_POR_DETECCAO = 2  # cada detecção mantém 100% por ~2 min

# Pontos: P01-P04 solares (pontos críticos), P05-P20 na rede
PONTOS = (
    [{"id": "P01", "tipo": "led_solar", "local": "Entrada principal", "fluxo": 1.5},
     {"id": "P02", "tipo": "led_solar", "local": "Travessia p/ ponto de ônibus", "fluxo": 1.4},
     {"id": "P03", "tipo": "led_solar", "local": "Quadra / academia ao ar livre", "fluxo": 1.1},
     {"id": "P04", "tipo": "led_solar", "local": "Caminho interno", "fluxo": 0.8}]
    + [{"id": f"P{i:02d}", "tipo": "led_rede", "local": "Perímetro / passeios", "fluxo": f}
       for i, f in zip(range(5, 21), [1.2, 1.0, 0.9, 1.1, 0.8, 0.7, 1.0, 0.9, 0.8, 1.3, 0.9, 0.7, 0.8, 1.0, 0.9, 1.1])]
)
PONTO_COM_FALHA = "P11"
DIA_FALHA = 21           # a partir da noite 21 o driver do P11 falha (simulado)
DIAS_NUBLADOS = {12, 13}  # sequência nublada para testar a autonomia
LIMIAR_ECONOMICO = 0.70
NIVEL_PLENA_ECONOMICO = 0.70
NIVEL_DIM_ECONOMICO = 0.20


def _poisson(rng: random.Random, lam: float) -> int:
    # Knuth (lam pequeno)
    import math
    L, k, prod = math.exp(-lam), 0, 1.0
    while True:
        prod *= rng.random()
        if prod <= L:
            return k
        k += 1


def simular(p: dict) -> dict:
    rng = random.Random(SEMENTE)
    led = p["tecnologias"]["led"]
    s = p["tecnologias"]["solar"]
    dim = dimensionar_solar(p)
    pr = performance_ratio(p)
    pw, nivel, iot = led["potencia_w"], led["nivel_dimerizado"], led["no_iot_w"]

    cap_wh = dim["bateria_wh_adotado"] * s["eficiencia_descarga"]  # Wh entregáveis com 100%
    reserva_wh = cap_wh * (1 - s["profundidade_descarga"])         # não descarregar abaixo de 20%
    soc = {pt["id"]: cap_wh for pt in PONTOS if pt["tipo"] == "led_solar"}

    horario, diario, alertas = [], [], []
    perfil_soma = {h: 0.0 for h in HORAS_NOITE}
    perfil_cont = {h: 0 for h in HORAS_NOITE}

    for d in range(1, DIAS + 1):
        # clima do dia (mesmo para todos os postes)
        if d in DIAS_NUBLADOS:
            fator_sol = 0.30
        else:
            sorteio = rng.random()
            fator_sol = 1.15 if sorteio < 0.6 else (0.85 if sorteio < 0.9 else 0.45)
        hsp_dia = s["hsp_projeto"] * fator_sol

        for pt in PONTOS:
            falha = pt["id"] == PONTO_COM_FALHA and d >= DIA_FALHA
            e_dia_iot = iot * 12
            economico = False
            if pt["tipo"] == "led_solar":
                # carga durante o dia (antes da noite d)
                ger = dim["wp_adotado"] * hsp_dia * pr
                b = min(cap_wh, soc[pt["id"]] + max(0.0, ger - e_dia_iot))
                # LÓGICA DE AUTOMAÇÃO: bateria abaixo do limiar -> perfil econômico nesta noite
                economico = b < LIMIAR_ECONOMICO * cap_wh
            n_plena = NIVEL_PLENA_ECONOMICO if economico else 1.0
            n_dim = NIVEL_DIM_ECONOMICO if economico else nivel
            e_noite = 0.0
            deteccoes = 0
            for h in HORAS_NOITE:
                if h in PRESENCA_MEDIA:
                    k = _poisson(rng, PRESENCA_MEDIA[h] * pt["fluxo"] * 60 / MINUTOS_POR_DETECCAO)
                    frac = min(1.0, k * MINUTOS_POR_DETECCAO / 60)
                    pot = pw * (n_dim + (1 - n_dim) * frac)
                else:
                    k = _poisson(rng, 25 * pt["fluxo"])  # horário de pico: só conta pessoas
                    pot = pw * n_plena
                deteccoes += k
                if falha:
                    pot = 0.0
                pot += iot
                e_noite += pot
                horario.append({"dia": d, "hora": h, "ponto": pt["id"], "tipo": pt["tipo"],
                                "potencia_w": round(pot, 1), "deteccoes": k})
                if pt["tipo"] == "led_rede" and not falha:
                    perfil_soma[h] += pot
                    perfil_cont[h] += 1
            e_total_wh = e_noite + e_dia_iot

            linha = {"dia": d, "ponto": pt["id"], "tipo": pt["tipo"], "local": pt["local"],
                     "energia_wh": round(e_total_wh, 1), "deteccoes": deteccoes,
                     "energia_rede_wh": round(e_total_wh, 1) if pt["tipo"] == "led_rede" else 0.0,
                     "geracao_fv_wh": 0.0, "soc_fim_noite_pct": None, "modo_economico": economico,
                     "hsp_dia": round(hsp_dia, 2)}

            if pt["tipo"] == "led_solar":
                if economico:
                    alertas.append({"dia": d, "ponto": pt["id"], "tipo": "Modo econômico ativado",
                                    "detalhe": f"bateria abaixo de {LIMIAR_ECONOMICO:.0%} ao anoitecer: 80% no pico e 20% na madrugada"})
                b -= e_noite
                if b < reserva_wh:
                    alertas.append({"dia": d, "ponto": pt["id"], "tipo": "Bateria abaixo da reserva",
                                    "detalhe": "controlador reduz o nível para preservar a bateria"})
                    b = reserva_wh
                soc[pt["id"]] = b
                linha["geracao_fv_wh"] = round(ger, 1)
                linha["soc_fim_noite_pct"] = round(100 * b / cap_wh, 1)

            esperado = dim["demanda_wh_dia"]
            if e_total_wh < 0.5 * esperado:
                alertas.append({"dia": d, "ponto": pt["id"], "tipo": "Possível falha da luminária",
                                "detalhe": f"consumo noturno {e_total_wh:.0f} Wh < 50% do esperado ({esperado:.0f} Wh)"})
            diario.append(linha)

    n_rede_ok = sum(1 for pt in PONTOS if pt["tipo"] == "led_rede")
    perfil = [{"hora": h, "potencia_media_w": round(perfil_soma[h] / perfil_cont[h], 1)}
              for h in HORAS_NOITE]  # média dos pontos de rede sem falha

    # agrega por dia
    por_dia = []
    for d in range(1, DIAS + 1):
        linhas = [l for l in diario if l["dia"] == d]
        solares = [l for l in linhas if l["tipo"] == "led_solar"]
        por_dia.append({
            "dia": d,
            "rede_kwh": round(sum(l["energia_rede_wh"] for l in linhas) / 1000, 3),
            "solar_kwh": round(sum(l["energia_wh"] for l in solares) / 1000, 3),
            "geracao_fv_kwh": round(sum(l["geracao_fv_wh"] for l in solares) / 1000, 3),
            "soc_min_pct": min(l["soc_fim_noite_pct"] for l in solares),
            "soc_medio_pct": round(sum(l["soc_fim_noite_pct"] for l in solares) / len(solares), 1),
            "deteccoes": sum(l["deteccoes"] for l in linhas),
            "hsp": linhas[0]["hsp_dia"],
        })

    # consolida alertas repetidos (mesmo ponto/tipo em dias seguidos)
    resumo_alertas = []
    for a in sorted(alertas, key=lambda x: (x["ponto"], x["tipo"], x["dia"])):
        if resumo_alertas and resumo_alertas[-1]["ponto"] == a["ponto"] and resumo_alertas[-1]["tipo"] == a["tipo"] \
                and resumo_alertas[-1]["ate"] == a["dia"] - 1:
            resumo_alertas[-1]["ate"] = a["dia"]
        else:
            resumo_alertas.append({"de": a["dia"], "ate": a["dia"], "ponto": a["ponto"], "tipo": a["tipo"],
                                   "detalhe": a["detalhe"]})

    # agrupa pontos com o mesmo alerta no mesmo período
    agrupados: dict = {}
    for a in resumo_alertas:
        chave = (a["de"], a["ate"], a["tipo"])
        agrupados.setdefault(chave, {"de": a["de"], "ate": a["ate"], "tipo": a["tipo"], "pontos": [],
                                     "detalhe": a["detalhe"]})["pontos"].append(a["ponto"])
    resumo_alertas = sorted(agrupados.values(), key=lambda x: (x["de"], x["tipo"]))
    noites_eco = sum(1 for l in diario if l["modo_economico"])
    noites_reserva = sum(1 for a in alertas if a["tipo"] == "Bateria abaixo da reserva")
    return {"pontos": PONTOS, "por_dia": por_dia, "noites_modo_economico": noites_eco,
            "noites_abaixo_reserva": noites_reserva, "diario_ponto": diario, "horario": horario,
            "perfil_noite": perfil, "alertas": resumo_alertas,
            "estimado_rede_kwh_dia": n_rede_ok * dim["demanda_wh_dia"] / 1000}


def salvar_csv(sim: dict) -> None:
    dados = RAIZ / "data"
    with open(dados / "monitoramento_simulado_horario.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(sim["horario"][0].keys()))
        w.writeheader()
        w.writerows(sim["horario"])
    with open(dados / "monitoramento_simulado_diario.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(sim["diario_ponto"][0].keys()))
        w.writeheader()
        w.writerows(sim["diario_ponto"])
