"""Testes rápidos do modelo:  python -m pytest src  (ou python src/test_modelo.py)."""
import math

from modelo import carregar_premissas, comparar, dimensionar_solar, energia_kwh, energia_ponto_dia_kwh

P = carregar_premissas()
R = {a["id"]: a for a in comparar(P)["alternativas"]}


def test_formula_base():
    assert energia_kwh(170, 12) == 2.04  # E = P x t / 1000


def test_consumo_vsap_mensal():
    assert math.isclose(R["A0"]["consumo_rede_kwh_mes"], 20 * 2.04 * 30)


def test_consumo_led_por_ponto():
    e = energia_ponto_dia_kwh(P, "led_rede")
    # 60 W x 6 h + 60 x (0,3 x 0,8 + 0,2) x 6 h + 1 W x 24 h
    assert math.isclose(e["total"], 0.360 + 0.1584 + 0.024)


def test_solar_atende_mes_critico():
    d = dimensionar_solar(P)
    assert d["wp_adotado"] >= d["wp_minimo"]
    assert d["bateria_wh_adotado"] >= d["bateria_wh_minimo"]
    assert d["geracao_mes_critico_wh_dia"] >= d["demanda_wh_dia"]


def test_mesma_necessidade_energetica():
    # A1 e A2 entregam o mesmo serviço (mesma carga), só muda a fonte
    assert math.isclose(R["A1"]["carga_total_kwh_mes"], R["A2"]["carga_total_kwh_mes"])
    assert R["A2"]["participacao_renovavel"] == 1.0


def test_hibrida_entre_extremos():
    assert R["A1"]["capex_rs"] < R["A3"]["capex_rs"] < R["A2"]["capex_rs"]
    assert R["A2"]["consumo_rede_kwh_mes"] < R["A3"]["consumo_rede_kwh_mes"] < R["A1"]["consumo_rede_kwh_mes"]


if __name__ == "__main__":
    for nome, f in list(globals().items()):
        if nome.startswith("test_"):
            f()
            print("ok", nome)
