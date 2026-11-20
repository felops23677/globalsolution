// Confere se o modelo JS do dashboard dá os mesmos números do Python (outputs/resultados.json).
// Uso: node src/verificar_js.cjs
const fs = require("fs");
const path = require("path");
const raiz = path.resolve(__dirname, "..");
const modelo = require(path.join(raiz, "dashboard", "modelo.js"));
const premissas = JSON.parse(fs.readFileSync(path.join(raiz, "data", "premissas.json"), "utf8"));
const py = JSON.parse(fs.readFileSync(path.join(raiz, "outputs", "resultados.json"), "utf8"));
const js = modelo.comparar(premissas);

const campos = ["consumo_rede_kwh_mes", "economia_pct", "reducao_custo_rs_mes", "emissoes_evitadas_kg_ano",
  "capex_rs", "tco_rs", "payback_simples_anos", "payback_fluxo_anos", "participacao_renovavel"];
let erros = 0;
py.alternativas.forEach((a, i) => {
  for (const c of campos) {
    const x = a[c], y = js.alternativas[i][c];
    const ok = (x === null && y === null) || Math.abs(x - y) < 1e-6 * Math.max(1, Math.abs(x));
    if (!ok) { erros++; console.log("DIFERENTE", a.id, c, x, y); }
  }
});
console.log(erros ? `${erros} diferenças` : "OK: modelo JS = modelo Python em todas as alternativas");
process.exit(erros ? 1 : 0);
