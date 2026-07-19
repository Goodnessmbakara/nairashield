/**
 * Country / team flags for World Cup–style names (flagcdn.com).
 * Keep aligned with src/integrations/txline.ts COUNTRY_ISO.
 */

import React from "react";

const COUNTRY_ISO: Record<string, string> = {
  France: "fr",
  England: "gb-eng",
  Spain: "es",
  Argentina: "ar",
  Germany: "de",
  Brazil: "br",
  Portugal: "pt",
  Netherlands: "nl",
  Italy: "it",
  Belgium: "be",
  Croatia: "hr",
  Uruguay: "uy",
  Australia: "au",
  "New Zealand": "nz",
  Japan: "jp",
  Morocco: "ma",
  Vietnam: "vn",
  Myanmar: "mm",
  India: "in",
  Liechtenstein: "li",
  Gibraltar: "gi",
  Colombia: "co",
  Mexico: "mx",
  USA: "us",
  "United States": "us",
  Senegal: "sn",
  Ghana: "gh",
  Nigeria: "ng",
  Cameroon: "cm",
  Wales: "gb-wls",
  Scotland: "gb-sct",
  "South Korea": "kr",
  Korea: "kr",
  Switzerland: "ch",
  Poland: "pl",
  Denmark: "dk",
  Sweden: "se",
  Serbia: "rs",
  Ecuador: "ec",
  Canada: "ca",
  Qatar: "qa",
  "Saudi Arabia": "sa",
  Iran: "ir",
  Tunisia: "tn",
  "Costa Rica": "cr",
  Chile: "cl",
  Peru: "pe",
  Paraguay: "py",
  "Ivory Coast": "ci",
  "Côte d'Ivoire": "ci",
  Algeria: "dz",
  Egypt: "eg",
  Austria: "at",
  Hungary: "hu",
  Ukraine: "ua",
  Turkey: "tr",
  Türkiye: "tr",
  Czechia: "cz",
  "Czech Republic": "cz",
  Romania: "ro",
  Albania: "al",
  Georgia: "ge",
  Slovenia: "si",
  Slovakia: "sk",
};

/** Draw / X / etc. — no flag */
const NO_FLAG = new Set(["draw", "x", "tie", "home", "away", "part1", "part2"]);

export function flagUrl(name: string | undefined | null, size: 20 | 40 | 80 = 40): string | undefined {
  if (!name) return undefined;
  const key = name.trim();
  if (!key || NO_FLAG.has(key.toLowerCase())) return undefined;
  const iso = COUNTRY_ISO[key] ?? COUNTRY_ISO[key.replace(/\s+FC$/i, "")];
  if (!iso) return undefined;
  return `https://flagcdn.com/w${size}/${iso}.png`;
}

export function TeamFlag({
  name,
  className = "",
  width = 22,
  height = 16,
}: {
  name: string;
  className?: string;
  width?: number;
  height?: number;
}): React.ReactElement | null {
  const src = flagUrl(name, width >= 40 ? 80 : 40);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      className={`shrink-0 rounded-[2px] object-cover shadow-sm ring-1 ring-black/5 ${className}`}
      loading="lazy"
    />
  );
}
