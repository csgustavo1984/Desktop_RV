# Hermes Capital · Desktop RV — Guia de Desenvolvimento

## Visão Geral

Dashboard financeiro estático (HTML/CSS/JS puro, sem backend) para assessores de investimentos da Hermes Capital. Cada módulo é um arquivo HTML independente, todos carregados a partir do hub `index.html`.

---

## Arquitetura

```
Desktop RV/
├── index.html                  # Hub — lista todos os módulos como cards
├── CLAUDE.md                   # Este guia
├── js/
│   └── brapi.js                # Cliente compartilhado brapi.dev (todas as cotações)
├── M02_recomendacoes.html      # Módulo: Recomendações em Aberto
├── Recomendações em aberto/
│   └── PROSPECT-35132.pdf      # Fonte dos dados (Safra Equity Research, Mai/2026)
└── ...                         # Futuros módulos
```

---

## API de Cotações — brapi.dev

### Configuração

- **Token**: `x8UMRCnMP5We2uj4JGbsi3`
- **Base URL**: `https://brapi.dev/api`
- **Plano**: Free — máximo **1 ativo por requisição**
- **Documentação**: https://brapi.dev/docs

### Cliente Compartilhado (`js/brapi.js`)

Todo módulo que precise de cotações deve incluir:

```html
<script src="js/brapi.js"></script>
```

O objeto global `BRAPI` expõe os métodos abaixo.

### Métodos disponíveis

#### `BRAPI.quote(ticker, opts?)`
Cotação atual de um ativo (ação, BDR, FII, ETF).

```javascript
const dado = await BRAPI.quote('VALE3');
// dado.regularMarketPrice  → preço atual
// dado.regularMarketChange → variação absoluta
// dado.regularMarketChangePercent → variação %

// Com dados fundamentalistas:
const fund = await BRAPI.quote('ITUB4', { fundamental: true });

// Com histórico de preços:
const hist = await BRAPI.quote('BBDC4', { range: '1mo', interval: '1d' });
```

**opts disponíveis:**
| Opção | Tipo | Descrição |
|-------|------|-----------|
| `fundamental` | boolean | Inclui P/L, EPS, DY, etc. |
| `dividends` | boolean | Inclui histórico de proventos |
| `range` | string | `1d` `5d` `1mo` `3mo` `6mo` `1y` `2y` `5y` `10y` `ytd` `max` |
| `interval` | string | `1m` `2m` `5m` `15m` `30m` `60m` `1h` `1d` `1wk` `1mo` `3mo` |
| `modules` | string[] | `financialData` `defaultKeyStatistics` `summaryProfile` etc. |

---

#### `BRAPI.multiQuote(tickers[], opts?)`
Cotações paralelas de múltiplos tickers. Dispara uma request por ticker (plano free), todas simultâneas via `Promise.allSettled`.

```javascript
const map = await BRAPI.multiQuote(['VALE3', 'ITUB4', 'GGBR4']);
// map['VALE3'].regularMarketPrice → 82.50
// map['ITUB4'] → null  (se falhar)
```

> **IMPORTANTE**: No plano free a brapi retorna erro se você enviar múltiplos tickers em uma única URL. Use sempre `multiQuote` para múltiplos ativos — ele faz requests individuais em paralelo.

---

#### `BRAPI.historical(ticker, range?, interval?)`
Histórico OHLCV de um ativo.

```javascript
const candles = await BRAPI.historical('PETR4', '3mo', '1d');
// candles[i] → { date, open, high, low, close, volume, adjustedClose }
```

---

#### `BRAPI.dividends(ticker)`
Histórico de proventos (dividendos, JCP, bonificações).

```javascript
const divs = await BRAPI.dividends('TAEE11');
// divs.cashDividends  → [{ paymentDate, rate, type, ... }]
// divs.stockDividends → [...]
// divs.splits         → [...]
```

---

#### `BRAPI.fundamental(ticker, modules?)`
Dados fundamentalistas detalhados.

```javascript
const fund = await BRAPI.fundamental('WEGE3', ['financialData', 'defaultKeyStatistics']);
// fund.priceEarnings   → P/L
// fund.earningsPerShare → LPA
// fund.dividendYield   → DY
```

**Módulos disponíveis**: `financialData`, `defaultKeyStatistics`, `summaryProfile`, `balanceSheetHistory`, `cashflowStatementHistory`, `incomeStatementHistory`, `upgradeDowngradeHistory`

---

#### `BRAPI.list(search?, limit?, offset?)`
Lista todos os ativos disponíveis na brapi (2.000+).

```javascript
const { stocks } = await BRAPI.list('vale', 10);
// stocks[i] → { stock, name, close, change, volume, market_cap_basic, logo, sector }
```

---

#### `BRAPI.lsRatio(t1, t2)`
Ratio Long & Short: `preço(t1) / preço(t2)`. Útil para spreads.

```javascript
const ratio = await BRAPI.lsRatio('SUZB3', 'KLBN11');
// ratio → 2.48  (comparar contra entrada para calcular P&L)
```

---

### Utilitários

```javascript
BRAPI.fmtDate(timestamp)    // Unix ts → "19/05/2026"
BRAPI.fmtBRL(valor)         // number  → "R$ 1.234,56"
BRAPI.token                 // string  → token atual (debug)
BRAPI.base                  // string  → URL base atual
```

---

## Padrão de Fetch com Fallback

Alguns ativos não estão disponíveis na brapi (ex.: ENBR3, já deslistado). Use mfinance.com.br como fallback:

```javascript
async function fetchPrices() {
    const tickers = [...new Set(RECS.flatMap(r => r.t2 ? [r.t1, r.t2] : [r.t1]))];
    const brapiMap = await BRAPI.multiQuote(tickers);

    for (const ticker of tickers) {
        if (!brapiMap[ticker]) {
            // fallback mfinance para ativos não encontrados na brapi
            try {
                const url = `https://mfinance.com.br/api/v1/stocks/${ticker}`;
                const res = await fetch(url);
                const json = await res.json();
                if (json.lastPrice) brapiMap[ticker] = { regularMarketPrice: json.lastPrice };
            } catch (e) {
                console.warn(`[fallback] ${ticker}: ${e.message}`);
            }
        }
    }
    // processar brapiMap...
}
```

---

## Tema Visual

```css
--gold:      #C9A84C    /* dourado Hermes — títulos, destaques */
--gold-lite: #E8C97A    /* dourado claro — hover */
--dark:      #0A0E1A    /* fundo principal */
--card:      #111827    /* fundo dos cards */
--border:    #1E2840    /* bordas */
--text:      #E2E8F0    /* texto primário */
--muted:     #64748B    /* texto secundário */
--green:     #22C55E    /* ganho, positivo */
--red:       #EF4444    /* perda, negativo */
--orange:    #F59E0B    /* alerta, próximo ao stop */
```

---

## Módulos

| ID | Arquivo | Status | Descrição |
|----|---------|--------|-----------|
| M01 | *(a criar)* | planned | Carteira Recomendada |
| **M02** | `M02_recomendacoes.html` | **done** | Recomendações em Aberto |
| M03+ | *(a criar)* | planned | Demais módulos |

---

## Git / GitHub

- **Repositório**: `https://github.com/csgustavo1984/Desktop_RV.git`
- **Branch principal**: `main`
- **Convenção de commits**: `tipo(escopo): descrição` (ex.: `feat(M02): adiciona coluna preço atual`)

Tipos: `feat` `fix` `refactor` `docs` `style` `chore`

---

## Limitações Conhecidas

- **Sem backend**: todos os dados são estáticos ou buscados client-side
- **CORS**: brapi.dev e mfinance.com.br permitem CORS — outros provedores podem bloquear
- **Plano free brapi**: 1 ativo por request, sem WebSocket — use polling (30s recomendado)
- **Ativos deslistados**: ENBR3 e outros não aparecem na brapi → usar fallback mfinance
- **Mercado fechado**: fora do horário de pregão (09:00–18:00 BRT) os preços ficam estáticos
