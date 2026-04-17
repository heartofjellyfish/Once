/**
 * Shared slogan strings + translations. Both the HTML fallback envelope
 * and the Three.js cloth envelope pull from here.
 */

export const SLOGAN_EN = "A slice of ordinary life, from elsewhere — hourly.";

/** Local-language translations. Missing languages fall back to English only. */
export const SLOGAN_BY_LANG: Record<string, string> = {
  ar: "قطعة من الحياة اليومية، من مكان آخر — كل ساعة.",
  bs: "Komadić svakodnevnog života, odnekud drugdje — svaki sat.",
  da: "Et stykke hverdagsliv, et andet sted fra — hver time.",
  de: "Ein Stück Alltag, von anderswo — zur vollen Stunde.",
  el: "Μια στιγμή καθημερινότητας, από αλλού — κάθε ώρα.",
  es: "Un trozo de vida cotidiana, desde otro lugar — cada hora.",
  et: "Tükike tavaelu, mujalt — iga tunni tagant.",
  fi: "Pala arkielämää, muualta — joka tunti.",
  fr: "Une tranche de vie ordinaire, d'ailleurs — chaque heure.",
  hy: "Սովորական կյանքի մի կտոր, այլ տեղից — ամեն ժամ։",
  is: "Brot úr daglegu lífi, annars staðar frá — á klukkustundar fresti.",
  it: "Un frammento di vita ordinaria, da altrove — ogni ora.",
  ja: "ありふれた暮らしのひとかけら、よそから — 一時間ごとに。",
  ka: "ჩვეულებრივი ცხოვრების ნაჭერი, სხვა ადგილიდან — ყოველ საათში.",
  ko: "어딘가의 평범한 한 조각, 매 시간마다.",
  lt: "Kasdienybės gabalėlis, iš kitur — kas valandą.",
  mk: "Парче од секојдневниот живот, од некаде — секој час.",
  ms: "Sekeping kehidupan harian, dari tempat lain — setiap jam.",
  nl: "Een stukje gewoon leven, ergens anders vandaan — ieder uur.",
  no: "En bit av hverdagen, fra et annet sted — hver time.",
  pl: "Kawałek zwykłego życia, skądinąd — co godzinę.",
  pt: "Uma fatia da vida comum, de outro lugar — a cada hora.",
  ro: "O felie de viață obișnuită, de altundeva — în fiecare oră.",
  ru: "Кусочек обычной жизни, откуда-то ещё — каждый час.",
  sk: "Kúsok obyčajného života, odinakiaľ — každú hodinu.",
  sl: "Košček običajnega življenja, od drugod — vsako uro.",
  sq: "Një copë e jetës së përditshme, nga diku tjetër — çdo orë.",
  sr: "Парче свакодневног живота, са другог места — сваког сата.",
  th: "เสี้ยวหนึ่งของชีวิตประจำวัน จากที่อื่น — ทุกชั่วโมง",
  tr: "Başka bir yerden, sıradan bir an — her saat başı.",
  uk: "Шматочок буденного життя, звідкись ще — щогодини.",
  vi: "Một lát đời thường, từ nơi khác — mỗi giờ.",
  zh: "某处的平凡片刻，每小时一次。"
};

export const RTL_LANGS = new Set(["ar", "he", "fa", "ur"]);
