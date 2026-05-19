/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Hermes Capital · brapi.dev API Client
 * Projeto: Desktop RV
 *
 * Fonte: https://brapi.dev/docs
 * Plano: Free (1 ativo por request — usar multiQuote para paralelo)
 *
 * Uso em qualquer módulo HTML:
 *   <script src="js/brapi.js"></script>
 *   const dados = await BRAPI.quote('VALE3');
 *   const map   = await BRAPI.multiQuote(['VALE3','ITUB4','GGBR4']);
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BRAPI = (() => {

    // ── CONFIGURAÇÃO ──────────────────────────────────────────────────────────
    const TOKEN   = 'x8UMRCnMP5We2uj4JGbsi3';
    const BASE    = 'https://brapi.dev/api';
    const TIMEOUT = 9000; // ms por request

    // ── REQUISIÇÃO BASE ───────────────────────────────────────────────────────
    async function _get(path, params = {}) {
        const qs = new URLSearchParams({ token: TOKEN, ...params }).toString();
        const url = `${BASE}${path}?${qs}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
        if (!resp.ok) throw new Error(`[brapi] HTTP ${resp.status} — ${path}`);
        const data = await resp.json();
        if (data.error) throw new Error(`[brapi] ${data.message || data.code || 'erro desconhecido'}`);
        return data;
    }

    // ── API PÚBLICA ───────────────────────────────────────────────────────────
    return {

        /**
         * Cotação atual de um ativo (ação, BDR, FII, ETF).
         * Plano free: 1 ticker por chamada.
         *
         * @param {string} ticker   Ex: 'VALE3', 'AMZO34', 'HGLG11'
         * @param {object} opts
         *   opts.fundamental {boolean}  — inclui P/L, EPS, etc.
         *   opts.dividends   {boolean}  — inclui histórico de dividendos
         *   opts.range       {string}   — histórico: '1d','5d','1mo','3mo','6mo','1y','2y','5y','10y','ytd','max'
         *   opts.interval    {string}   — candle: '1m','2m','5m','15m','30m','60m','90m','1h','1d','5d','1wk','1mo','3mo'
         * @returns {object} resultado brapi para o ticker
         */
        async quote(ticker, opts = {}) {
            const p = { fundamental: opts.fundamental ? 'true' : 'false' };
            if (opts.dividends) p.dividends  = 'true';
            if (opts.range)     p.range      = opts.range;
            if (opts.interval)  p.interval   = opts.interval;
            if (opts.modules?.length) p.modules = opts.modules.join(',');
            const data = await _get(`/quote/${encodeURIComponent(ticker)}`, p);
            return data.results?.[0] ?? null;
        },

        /**
         * Cotações paralelas de múltiplos tickers.
         * Dispara uma request por ticker (plano free), todas simultâneas.
         *
         * @param {string[]} tickers
         * @param {object}   opts    — mesmos parâmetros de quote()
         * @returns {{ [ticker]: resultado|null }}  map com resultado por ticker
         */
        async multiQuote(tickers, opts = {}) {
            const settled = await Promise.allSettled(
                tickers.map(t => this.quote(t, opts))
            );
            const map = {};
            settled.forEach((res, i) => {
                map[tickers[i]] = res.status === 'fulfilled' ? res.value : null;
                if (res.status === 'rejected')
                    console.warn(`[brapi] multiQuote ${tickers[i]}:`, res.reason?.message);
            });
            return map;
        },

        /**
         * Histórico OHLCV de um ativo.
         *
         * @param {string} ticker
         * @param {string} range    — '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max'
         * @param {string} interval — '1d' | '1wk' | '1mo'
         * @returns {{ date, open, high, low, close, volume, adjustedClose }[]}
         */
        async historical(ticker, range = '1mo', interval = '1d') {
            const data = await _get(`/quote/${encodeURIComponent(ticker)}`, {
                range, interval, fundamental: 'false'
            });
            return data.results?.[0]?.historicalDataPrice ?? [];
        },

        /**
         * Dividendos de um ativo.
         *
         * @param {string} ticker
         * @returns {{ cashDividends: [], stockDividends: [], splits: [] }}
         */
        async dividends(ticker) {
            const data = await _get(`/quote/${encodeURIComponent(ticker)}`, {
                dividends: 'true', fundamental: 'false'
            });
            return data.results?.[0]?.dividendsData ?? { cashDividends: [], stockDividends: [], splits: [] };
        },

        /**
         * Dados fundamentalistas de um ativo.
         * Módulos disponíveis: financialData, defaultKeyStatistics, summaryProfile,
         *                      balanceSheetHistory, cashflowStatementHistory,
         *                      incomeStatementHistory, upgradeDowngradeHistory
         *
         * @param {string}   ticker
         * @param {string[]} modules  — lista de módulos (vazio = todos)
         * @returns {object} resultado brapi com campos fundamentalistas
         */
        async fundamental(ticker, modules = []) {
            const p = { fundamental: 'true' };
            if (modules.length) p.modules = modules.join(',');
            const data = await _get(`/quote/${encodeURIComponent(ticker)}`, p);
            return data.results?.[0] ?? null;
        },

        /**
         * Lista todos os ativos disponíveis na brapi (2000+).
         *
         * @param {string} search   — filtro por nome/ticker
         * @param {number} limit
         * @param {number} offset
         * @returns {{ stocks: [{ stock, name, close, change, volume, market_cap_basic, logo, sector }] }}
         */
        async list(search = '', limit = 100, offset = 0) {
            const p = { limit, offset, sortBy: 'stock', sortOrder: 'asc' };
            if (search) p.search = search;
            return await _get('/quote/list', p);
        },

        /**
         * Ratio L&S: preço do ticker1 dividido pelo ticker2.
         * Útil para spreads como SUZB3/KLBN11, EQTL3/ENBR3, POMO4/ROMI3.
         *
         * @param {string} t1  ticker long
         * @param {string} t2  ticker short
         * @returns {number|null}
         */
        async lsRatio(t1, t2) {
            const map = await this.multiQuote([t1, t2]);
            const p1  = map[t1]?.regularMarketPrice;
            const p2  = map[t2]?.regularMarketPrice;
            return (p1 != null && p2 != null && p2 > 0) ? p1 / p2 : null;
        },

        // ── UTILIDADES ────────────────────────────────────────────────────────

        /** Retorna o token configurado (para debug). */
        get token() { return TOKEN; },

        /** Retorna a URL base. */
        get base()  { return BASE; },

        /**
         * Formata um timestamp Unix (segundos) em data BR.
         * @param {number} ts
         */
        fmtDate(ts) {
            return new Date(ts * 1000).toLocaleDateString('pt-BR');
        },

        /**
         * Formata número como moeda BRL.
         * @param {number} v
         */
        fmtBRL(v) {
            return v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—';
        }
    };
})();
