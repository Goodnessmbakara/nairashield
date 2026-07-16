/**
 * NairaShield pricing & net-return model (PRD §2.2 + research pivot).
 *
 * We do NOT arbitrage TxLINE against itself.
 * TxLINE = fair value. We quote maker prices on BetDEX with a margin,
 * and only leave Kamino when expected spread capture beats idle yield cost.
 *
 * Y_net = (sum α_i · O_i − 1) · C − C · r · T   (directional / back form)
 * Y_net ≈ C · m − C · r · T                     (market-maker spread form)
 */

export type FairOutcome = {
	label: string;
	/** Decimal consensus odds from TxLINE */
	fairOdds: number;
	/** Implied probability 1/O (raw, unnormalized) */
	impliedProb: number;
};

export type MakerQuote = {
	label: string;
	fairOdds: number;
	/** BACK (buy) limit — slightly inside fair so fill has edge */
	bidOdds: number;
	/** LAY (sell) limit — slightly outside fair */
	askOdds: number;
	/** Absolute margin used (fraction) */
	margin: number;
};

export type YNetResult = {
	/** Absolute USDC expected net after opportunity cost */
	yNet: number;
	/** yNet / capital (fraction) */
	yNetPerUnit: number;
	/** Expected gross capture before yield cost */
	grossCapture: number;
	/** Opportunity cost of pulling C out of yield for horizon T */
	opportunityCost: number;
	/** Horizon as fraction of a year */
	horizonYears: number;
	capital: number;
	mode: "market_make" | "back";
};

/** Implied probs from decimal odds; keep raw (overround left visible). */
export function fairOutcomes(odds: Record<string, number>): FairOutcome[] {
	return Object.entries(odds)
		.map(([label, fairOdds]) => ({
			label,
			fairOdds,
			impliedProb: fairOdds > 0 ? 1 / fairOdds : 0,
		}))
		.filter((o) => Number.isFinite(o.fairOdds) && o.fairOdds > 1)
		.sort((a, b) => a.fairOdds - b.fairOdds); // favorite first
}

/**
 * Build two-sided maker quotes around TxLINE fair value.
 * margin 0.02 → bid at fair*(1−m), ask at fair*(1+m) in decimal-odds space.
 */
export function buildMakerQuotes(
	outcomes: FairOutcome[],
	margin: number,
): MakerQuote[] {
	const m = clamp(margin, 0.001, 0.2);
	return outcomes.map((o) => {
		const bidOdds = round4(Math.max(1.01, o.fairOdds * (1 - m)));
		const askOdds = round4(Math.max(bidOdds + 0.01, o.fairOdds * (1 + m)));
		return {
			label: o.label,
			fairOdds: o.fairOdds,
			bidOdds,
			askOdds,
			margin: m,
		};
	});
}

/**
 * Market-maker form: expected capture ≈ C · m if quoted margin is earned,
 * minus idle-yield opportunity cost over event horizon T hours.
 */
export function computeYNetMarketMake(params: {
	capital: number;
	makerMargin: number;
	yieldApy: number;
	horizonHours: number;
}): YNetResult {
	const { capital, makerMargin, yieldApy, horizonHours } = params;
	const horizonYears = Math.max(horizonHours, 0) / (365.25 * 24);
	const grossCapture = capital * makerMargin;
	const opportunityCost = capital * yieldApy * horizonYears;
	const yNet = grossCapture - opportunityCost;
	return {
		yNet: round4(yNet),
		yNetPerUnit: capital > 0 ? round4(yNet / capital) : 0,
		grossCapture: round4(grossCapture),
		opportunityCost: round4(opportunityCost),
		horizonYears: round6(horizonYears),
		capital,
		mode: "market_make",
	};
}

/**
 * PRD directional form for a single-outcome back:
 * Y_net = (α · O − 1) · C − C · r · T
 * When O is the maker bid under fair value, EV uses fair prob:
 *   expected = (p_fair · O_bid − 1) · C − C · r · T
 */
export function computeYNetBack(params: {
	capital: number;
	/** Maker fill odds (what we lock in) */
	odds: number;
	/** Fair implied probability from TxLINE */
	fairProb: number;
	alpha?: number;
	yieldApy: number;
	horizonHours: number;
}): YNetResult {
	const alpha = params.alpha ?? 1;
	const horizonYears = Math.max(params.horizonHours, 0) / (365.25 * 24);
	// Risk-neutral EV vs TxLINE fair: p*O - 1, scaled by alpha
	const unitEdge = params.fairProb * params.odds * alpha - 1;
	const grossCapture = unitEdge * params.capital;
	const opportunityCost = params.capital * params.yieldApy * horizonYears;
	const yNet = grossCapture - opportunityCost;
	return {
		yNet: round4(yNet),
		yNetPerUnit: params.capital > 0 ? round4(yNet / params.capital) : 0,
		grossCapture: round4(grossCapture),
		opportunityCost: round4(opportunityCost),
		horizonYears: round6(horizonYears),
		capital: params.capital,
		mode: "back",
	};
}

/**
 * Pick the best quote for execution: prefer balanced mid-market favorite
 * with positive Y_net under the market-make model (primary path).
 */
export function selectBestQuote(
	quotes: MakerQuote[],
	params: {
		capital: number;
		yieldApy: number;
		horizonHours: number;
		minEdge: number;
	},
): { quote: MakerQuote; yNet: YNetResult; side: "BACK" | "LAY" } | null {
	if (quotes.length === 0) return null;

	const mm = computeYNetMarketMake({
		capital: params.capital,
		makerMargin: quotes[0].margin,
		yieldApy: params.yieldApy,
		horizonHours: params.horizonHours,
	});

	// Market-make path: any quote works if spread capture clears yield cost
	if (mm.yNetPerUnit >= params.minEdge && mm.yNet > 0) {
		// Favorite (lowest fair odds) is typically deepest for makers
		const quote = quotes[0];
		return { quote, yNet: mm, side: "BACK" };
	}

	// Fallback: directional back if bid has positive fair EV after yield cost
	let best: { quote: MakerQuote; yNet: YNetResult; side: "BACK" | "LAY" } | null =
		null;

	for (const quote of quotes) {
		const fairProb = 1 / quote.fairOdds;
		const yNet = computeYNetBack({
			capital: params.capital,
			odds: quote.bidOdds,
			fairProb,
			yieldApy: params.yieldApy,
			horizonHours: params.horizonHours,
		});
		if (yNet.yNet <= 0 || yNet.yNetPerUnit < params.minEdge) continue;
		if (!best || yNet.yNet > best.yNet.yNet) {
			best = { quote, yNet, side: "BACK" };
		}
	}

	return best;
}

function clamp(n: number, lo: number, hi: number) {
	return Math.min(hi, Math.max(lo, n));
}

export function round4(n: number) {
	return Math.round(n * 10000) / 10000;
}

function round6(n: number) {
	return Math.round(n * 1e6) / 1e6;
}
