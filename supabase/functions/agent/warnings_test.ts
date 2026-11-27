import assert from "node:assert/strict";
import { toldOf, warningsIn, warningsOf, warningWords } from "./warnings.ts";

Deno.test("code recognises the scams it is narrow about, in English and Portuguese (D79)", () => {
  const scams: [string, string][] = [
    ["remote-access", "This is Microsoft support. Please install AnyDesk so our technician can fix your computer."],
    ["remote-access", "Instale o TeamViewer e diga-nos o número que aparece."],
    ["remote-access", "Open Quick Assist and type the code I give you."],
    ["payment", "To avoid the fine, buy three Google Play gift cards and send us the codes."],
    ["payment", "Pague a multa com cartões oferta e envie-nos os códigos por SMS."],
    ["payment", "Deposit the amount at the Bitcoin ATM, then send the receipt."],
    ["payment", "Transfira o valor em criptomoeda para a carteira abaixo."],
    ["secret", "To unlock your account, reply with the verification code we sent you."],
    ["secret", "Envie-nos o código MB WAY que recebeu por SMS."],
    ["secret", "Please tell me your online banking password so I can check."],
    ["secret", "Dite-me o PIN do cartão, por favor."],
    ["secret", "Indique a sua palavra-passe para confirmarmos a encomenda."],
  ];
  for (const [kind, text] of scams) assert.deepEqual(warningsIn(text), [kind], text);
  assert.deepEqual(warningsIn("Install AnyDesk, then read me the 6-digit code and buy Steam cards to pay the fee."),
    ["remote-access", "payment", "secret"], "several at once, in their fixed order");
});

Deno.test("ordinary letters, notes and bank advice stay quiet (D79)", () => {
  const quiet = [
    "Crédito habitação: a partir de março a prestação mensal da casa passa para 512 euros. IBAN PT50 0000 0000 0000 0000 0000 0",
    "O Banco nunca lhe pedirá a sua palavra-passe ou códigos por SMS. Nunca partilhe o seu código.",
    "Never share your password or PIN with anyone, not even with us.",
    "We will never ask you to send your password by email.",
    "Paperwork in one place: IDs, insurance, contracts and passwords, found in under a minute.",
    "Change your password every 90 days, and turn on two-step verification.",
    "Enter your password to sign in.",
    "Send me a pin of the restaurant so I can find it.",
    "Indique o seu código postal e a morada de entrega.",
    "Assistência rápida em viagem incluída no seguro.",
    "Bitcoin rose 4% today, according to the news.",
    "Thank you for your payment of 40 euros by bank transfer.",
    "Gift ideas for Mãe: a scarf or a book.",
  ];
  for (const text of quiet) assert.deepEqual(warningsIn(text), [], text);
});

Deno.test("a stored list keeps only known kinds, and the agent is told the fixed words (D79)", () => {
  assert.deepEqual(warningsOf(["secret", "made-up", "remote-access", "secret"]), ["remote-access", "secret"]);
  assert.deepEqual(warningsOf("secret"), []);
  const told = toldOf(["payment"]);
  assert.ok(told.includes(warningWords.payment) && told.includes("never tell them to ignore it"));
  assert.deepEqual(warningsIn(warningWords.secret), [], "the secret warning's own words set nothing off");
});
