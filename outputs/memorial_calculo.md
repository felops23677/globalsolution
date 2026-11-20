# Memorial de cálculo (gerado por `src/main.py`)

> Valores são **projeções condicionadas às premissas** de `data/premissas.json`, não resultados garantidos.

## 1. Consumo por ponto de iluminação — E = (P × t) / 1000

**Atual (VSAP 150 W):** potência no sistema = 150 W (lâmpada) + 20 W (reator) = 170 W, ligada 12 h/noite a 100%.

E = (170 × 12) / 1000 = **2,040 kWh/dia por ponto**

**LED 60 W com dimerização e sensor:**

- Plena (100%): (60 × 6) / 1000 = 0,360 kWh
- Dimerizada (30% + presença 20% do tempo a 100%): P média = 60 × (0,30 × 0,80 + 1,0 × 0,20) = 26,4 W → (26,4 × 6) / 1000 = 0,1584 kWh
- Controlador/IoT: (1,0 × 24) / 1000 = 0,024 kWh
- **Total = 0,5424 kWh/dia por ponto** (redução de 73,4% por ponto)

## 2. Consumo e indicadores por alternativa (período de referência: mês de 30 dias e ano de 365 dias)

| Indicador | Unidade | A0 Atual: vapor de sódio | A1 LED + sensor (rede) | A2 LED solar (100% renovável) | A3 Híbrida (recomendada) |
|---|---|---|---|---|---|
| Carga total de iluminação | kWh/mês | 1.224,0 | 325,4 | 325,4 | 325,4 |
| Consumo da rede | kWh/mês | 1.224,0 | 325,4 | 0,0 | 260,4 |
| Economia de energia da rede | kWh/mês | 0,0 | 898,6 | 1.224,0 | 963,6 |
| Economia de energia da rede | % | 0,0% | 73,4% | 100,0% | 78,7% |
| Participação de energia renovável local | % | 0% | 0% | 100% | 20% |
| Custo de energia | R$/mês | R$ 620 | R$ 165 | R$ 0 | R$ 132 |
| Custo operacional (energia + O&M) | R$/mês | R$ 754 | R$ 245 | R$ 130 | R$ 222 |
| Redução de custo operacional | R$/mês | R$ 0 | R$ 509 | R$ 624 | R$ 532 |
| Emissões (rede) | kg CO₂e/ano | 573 | 152 | 0 | 122 |
| Emissões evitadas | kg CO₂e/ano | 0 | 421 | 573 | 451 |
| Tempo de funcionamento eficiente (dimerizado) | h/dia | 0 | 6 | 6 | 6 |
| Investimento inicial | R$ | R$ 0 | R$ 31.000 | R$ 112.152 | R$ 47.230 |
| Payback simples (vs A0) | anos | — | 5,1 anos | 15,0 anos | 7,4 anos |
| Payback pelo fluxo de custos (inclui troca de bateria) | anos | — | 5,1 anos | não se paga em 15 anos | 8,9 anos |
| Custo total em 15 anos (TCO) | R$ | R$ 135.690 | R$ 75.096 | R$ 184.704 | R$ 97.018 |
| Valor presente dos custos (6% a.a.) | R$ | R$ 87.857 | R$ 59.552 | R$ 158.142 | R$ 79.270 |
| Pontos que ficam acesos em apagão | pontos | 0 | 0 | 20 | 4 |
| Lâmpadas com mercúrio em operação | unid. | 20 | 0 | 0 | 0 |

Exemplo A0: 20 pontos × 2,040 kWh × 30 dias = 1.224,0 kWh/mês.  
Exemplo A1: 20 × 0,5424 × 30 = 325,4 kWh/mês.  
Emissões evitadas A1 = (14.892 − 3.960) kWh/ano × 0,0385 kg/kWh = 421 kg CO₂e/ano.

## 3. Dimensionamento do poste solar isolado (por ponto)

- Demanda diária: **542,4 Wh/dia** (mesmo perfil do LED na rede)
- Rendimento global (PR) = 0,96 × 0,92 × 0,90 × 0,95 × 0,98 = **0,740**
- Potência FV mínima = E / (HSP crítica × PR) = 542,4 / (3,4 × 0,740) = 215,6 Wp → **módulo comercial de 250 Wp**
- Bateria mínima = E × autonomia / (DoD × η) = 542,4 × 2 / (0,80 × 0,95) = 1.427 Wh = 111,5 Ah a 12,8 V → **LiFePO4 12,8 V 120 Ah (1,54 kWh)**
- Geração no mês crítico: 250 × 3,4 × 0,740 = 629 Wh/dia (margem de 16,0%)
- Autonomia real sem sol: 2,2 noites
- Geração média anual: 276 kWh/ano por poste para demanda de 198 kWh/ano → aproveitamento de 72% (sistema isolado: excedente do verão não é aproveitado)

## 4. Custos por ponto (estimativas de ordem de grandeza)

- LED na rede: R$ 1.400 por ponto (luminária + controlador/sensor + instalação); O&M R$ 30/ano
- Poste solar: R$ 5.458 por ponto (inclui módulo R$ 450 e bateria R$ 2.458); O&M R$ 60/ano; troca da bateria no ano 8
- Gateway LoRaWAN compartilhado: R$ 3.000 + conectividade R$ 30/mês

## 5. Análises de equilíbrio (quando o 100% solar compensa?)

- Tarifa a partir da qual A2 empata com A1 em 15 anos: **R$ 2,35/kWh** (premissa atual: R$ 0,50/kWh)
- Custo de levar rede a um ponto novo a partir do qual o solar compensa: **R$ 5.480 por ponto** (vala, eletroduto, cabo e caixa de passagem em área sem rede)
- Custo de abatimento do CO₂ de A2 em relação a A1: R$ 47.934/t CO₂ (muito alto porque a rede brasileira já é majoritariamente renovável)

## 6. Sensibilidade à tarifa

| Tarifa (R$/kWh) | Payback A1 | Payback A2 | Payback A3 | TCO A1 | TCO A2 | TCO A3 |
|---|---|---|---|---|---|---|
| 0,40 | 6,2 anos | 18,7 anos (além do horizonte) | 9,1 anos | R$ 69.157 | R$ 184.704 | R$ 92.266 |
| 0,50 | 5,1 anos | 15,0 anos | 7,4 anos | R$ 75.096 | R$ 184.704 | R$ 97.018 |
| 0,70 | 3,7 anos | 10,7 anos | 5,4 anos | R$ 86.975 | R$ 184.704 | R$ 106.521 |
| 0,90 | 3,0 anos | 8,3 anos | 4,3 anos | R$ 98.854 | R$ 184.704 | R$ 116.024 |
