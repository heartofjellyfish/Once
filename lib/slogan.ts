/**
 * Shared slogan strings + translations. Both the HTML fallback envelope
 * and the Three.js cloth envelope pull from here.
 */

export const SLOGAN_EN = "A slice of ordinary life, once, from elsewhere — hourly.";

/** Local-language translations. Missing languages fall back to English only.
 *  "Once" here carries two meanings at once — the product's name and "one
 *  time, unrepeatable." Translations try to preserve that second meaning
 *  via "just once" / "only once" / "仅此一次". */
export const SLOGAN_BY_LANG: Record<string, string> = {
  ar: "قطعة من الحياة اليومية، مرّة واحدة، من مكان آخر — كل ساعة.",
  bs: "Komadić svakodnevnog života, samo jednom, odnekud drugdje — svaki sat.",
  da: "Et stykke hverdagsliv, kun denne ene gang, et andet sted fra — hver time.",
  de: "Ein Stück Alltag, nur dieses eine Mal, von anderswo — zur vollen Stunde.",
  el: "Μια στιγμή καθημερινότητας, μόνο μία φορά, από αλλού — κάθε ώρα.",
  es: "Un trozo de vida cotidiana, una sola vez, desde otro lugar — cada hora.",
  et: "Tükike tavaelu, vaid korra, mujalt — iga tunni tagant.",
  fi: "Pala arkielämää, vain kerran, muualta — joka tunti.",
  fr: "Une tranche de vie ordinaire, une seule fois, d'ailleurs — chaque heure.",
  hy: "Սովորական կյանքի մի կտոր, միայն մեկ անգամ, այլ տեղից — ամեն ժամ։",
  is: "Brot úr daglegu lífi, aðeins í þetta eina sinn, annars staðar frá — á klukkustundar fresti.",
  it: "Un frammento di vita ordinaria, una volta sola, da altrove — ogni ora.",
  ja: "ありふれた暮らしのひとかけら、たった一度、よそから — 一時間ごとに。",
  ka: "ჩვეულებრივი ცხოვრების ნაჭერი, მხოლოდ ერთხელ, სხვა ადგილიდან — ყოველ საათში.",
  ko: "어딘가의 평범한 한 조각, 단 한 번, 매 시간마다.",
  lt: "Kasdienybės gabalėlis, vos vieną kartą, iš kitur — kas valandą.",
  mk: "Парче од секојдневниот живот, само еднаш, од некаде — секој час.",
  ms: "Sekeping kehidupan harian, sekali sahaja, dari tempat lain — setiap jam.",
  nl: "Een stukje gewoon leven, deze ene keer, ergens anders vandaan — ieder uur.",
  no: "En bit av hverdagen, denne ene gangen, fra et annet sted — hver time.",
  pl: "Kawałek zwykłego życia, tylko raz, skądinąd — co godzinę.",
  pt: "Uma fatia da vida comum, apenas uma vez, de outro lugar — a cada hora.",
  ro: "O felie de viață obișnuită, o singură dată, de altundeva — în fiecare oră.",
  ru: "Кусочек обычной жизни, лишь однажды, откуда-то ещё — каждый час.",
  sk: "Kúsok obyčajného života, len raz, odinakiaľ — každú hodinu.",
  sl: "Košček običajnega življenja, samo enkrat, od drugod — vsako uro.",
  sq: "Një copë e jetës së përditshme, vetëm një herë, nga diku tjetër — çdo orë.",
  sr: "Парче свакодневног живота, само једном, са другог места — сваког сата.",
  th: "เสี้ยวหนึ่งของชีวิตประจำวัน เพียงครั้งเดียว จากที่อื่น — ทุกชั่วโมง",
  tr: "Başka bir yerden, sıradan bir an, yalnızca bir kez — her saat başı.",
  uk: "Шматочок буденного життя, лише один раз, звідкись ще — щогодини.",
  vi: "Một lát đời thường, chỉ một lần, từ nơi khác — mỗi giờ.",
  zh: "平凡生活的一小段，仅此一次，来自别处——每小时。"
};

export const RTL_LANGS = new Set(["ar", "he", "fa", "ur"]);
