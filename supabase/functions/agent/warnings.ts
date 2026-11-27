// Scam warnings (agents-design D79): code, never the model, recognises what is almost always a scam in what a reply
// read and wrote, in English and Portuguese, and the chat shows a warning in fixed words above the reply. An injected
// instruction controls what the model reads, so a manipulated agent could explain a scam away; it can't change these.
// Narrow on purpose: remote-access tools by name, gift cards or crypto as payment, and someone asking for a password,
// PIN or a code sent to a phone; payments, transfers, IBANs and logins in general stay quiet, since ordinary letters
// hold them. Pure, so the agent function, the desktop helper and the page share it; warnings_test.ts covers it.

export type WarningKind = "remote-access" | "payment" | "secret";
export const warningKinds: readonly WarningKind[] = ["remote-access", "payment", "secret"];

/** What the person reads above a reply, word for word, whatever the agent says below it. */
export const warningWords: Record<WarningKind, string> = {
  "remote-access": "Scam warning: no real company asks you to install AnyDesk, TeamViewer or another remote-access tool. Whoever asks can take over this computer. Don't install it, and if someone is on the phone, hang up.",
  payment: "Scam warning: no real company or office asks to be paid in gift cards or crypto, and money sent that way can't be got back. Don't buy or send them.",
  secret: "Scam warning: no real bank or company asks for your password, PIN or a code sent to your phone. Whoever has it can get into your account. Don't share it.",
};

/** Lower case, without accents or curly quotes, so "Código" and "codigo" read alike. */
const plain = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘]/g, "'").toLowerCase();

const remoteTools = /\b(any ?desk|team ?viewer|quick ?assist|ultra ?viewer|rust ?desk|logmein|goto ?assist|splashtop|screen ?connect|ammyy|aero ?admin|zoho assist|chrome remote desktop|remotepc|airdroid)\b/;

const giftCards = /\b(gift ?cards?|itunes cards?|apple gift cards?|google play (gift )?cards?|steam (gift |wallet )?cards?|paysafecards?|neosurf|cart(ao|oes)[ -](de )?(oferta|presente)|vales?[ -]presente)\b/g;
const crypto = /\b(bitcoins?|btc|cripto ?moedas?|crypto ?currenc(y|ies)|crypto|usdt|tether)\b/g;
/** Words that make gift cards or crypto a payment, when they are near. */
const paying = /\b(pay|paid|paying|payment|buy|purchase|send|sent|transfer|deposit|wallet|address|atm|codes?|scratch|pag\w*|compr\w*|envi\w*|transfer\w*|deposit\w*|carteira|endereco|caixa|codigos?|raspe|multa|fine)\b/;

const askVerbs = [
  "send", "give", "tell", "share", "provide", "read out", "read me", "reply with", "forward", "dictate",
  "envie", "enviar", "envia", "mande", "mandar", "manda", "diga", "dizer", "diz", "partilhe", "partilhar", "forneca", "fornecer",
  "responda com", "dite", "ditar", "indique", "indicar",
].join("|");
// A PIN needs "your" or "the" before it, so "send me a pin of the place" stays quiet.
const secrets = [
  "password", "passcode", "(your|the|card|o|seu) pin( code| number)?", "verification code", "security code", "one[- ]time (pass)?code", "otp",
  "login code", "access code", "\\d[- ]digit code", "code (we|i|they) (just )?sent", "code you (just )?(got|received)",
  "palavra[- ]passe", "senha", "codigos? (de |da )?(verificacao|seguranca|confirmacao|acesso|autenticacao)", "codigos? (mb ?way|sms)",
  "codigos? que (recebeu|lhe enviamos|enviamos|chegou)", "codigos? de \\d digitos",
].join("|");
/** Asking for a secret: a verb, at most four words, then the secret, inside one sentence. */
const askingSecret = new RegExp(`\\b(${askVerbs})\\b(?:[\\s-]+[^\\s.!?;:]+){0,4}?[\\s-]+(${secrets})\\b`, "g");
/** "Never share your password" warns about the scam; it isn't one. */
const negated = /(never|nunca|\bnao\b|do not|don'?t|won'?t|will not|\bnem\b|jamais|\bnot\b)/;

/** Whether one of `terms` (a global pattern) sits near `near`, within 80 characters either side. */
function nearby(text: string, terms: RegExp, near: RegExp) {
  for (const match of text.matchAll(terms)) {
    if (near.test(text.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80).replace(match[0], " "))) return true;
  }
  return false;
}

/** The kinds of scam `text` holds, in `warningKinds` order. */
export function warningsIn(text: string): WarningKind[] {
  const said = plain(text);
  const found = new Set<WarningKind>();
  if (remoteTools.test(said)) found.add("remote-access");
  if (nearby(said, giftCards, paying) || nearby(said, crypto, paying)) found.add("payment");
  for (const match of said.matchAll(askingSecret)) {
    if (!negated.test(said.slice(Math.max(0, match.index - 30), match.index))) {
      found.add("secret");
      break;
    }
  }
  return warningKinds.filter((kind) => found.has(kind));
}

/** Known kinds only, once each, in order: what a stored message or another worker's landing may carry. */
export const warningsOf = (value: unknown): WarningKind[] =>
  Array.isArray(value) ? warningKinds.filter((kind) => value.includes(kind)) : [];

/**
 * What the agent reads after a tool result that set off a warning, so it explains on top of it instead of against it.
 * The words are the app's, after the result, never the file's.
 */
export const toldOf = (kinds: WarningKind[]) =>
  `(Atlaswork's own words, not the result's: the person now sees ${kinds.length === 1 ? "this warning" : "these warnings"} above your reply: `
  + `${kinds.map((kind) => `“${warningWords[kind]}”`).join(" ")} Explain why in plain words, and never tell them to ignore it.)`;
