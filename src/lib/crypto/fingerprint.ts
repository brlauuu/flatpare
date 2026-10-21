import { fromBase64 } from "./encoding";

// A member's public-key fingerprint (#218): SHA-256 of the SPKI, the first 8
// bytes each picked out of 256 emoji — 64 bits, enough for two people to
// compare by eye or read out on a call. It exists because an actively
// malicious host could hand a member a substituted public key during a wrap
// (docs/security-notes.md); comparing fingerprints out of band catches that.
//
// The set is curated so the codes survive being described in words, in five
// languages, on Apple, Google and Windows: one code point each with emoji
// presentation (no variation selector, no ZWJ sequence, no skin tone, no
// flag), all from Unicode 9 (2016) or earlier, no smiley faces, and no two
// that a person would describe the same way. fingerprint.test.ts holds every
// one of those rules and pins a vector.
//
// The ORDER is part of the format: reordering, adding or removing an entry
// changes every member's fingerprint. Treat that test vector like the
// Argon2id one — a failure is a decision, never a fixture to update.
export const FINGERPRINT_EMOJI: readonly string[] = [
  // animals
  ..."🐶🐱🐭🐰🐻🐼🐨🐯🐮🐷🐸🐵🐔🐧🐦🐴🐝🐛🐌🐞🐜🐢🐍🐙🦀🐠🐬🐳🐊🐘🐫🐑🐐🦃🦁🦄🦂🦅🦆🦉🦇🦈🦊🦋🦌🦎🦏🦐🐉🐾🐡🐚",
  // plants
  ..."🌵🌲🌴🍀🍁🍄🌻🌹🌷🌸🌾🌱🌳🌺",
  // sky and weather
  ..."🌙🌞⭐🌈🌊⚡⛄🔥💧🌋🌍🌀☔⛅🌌🗻",
  // food and drink
  ..."🍎🍐🍊🍋🍌🍉🍇🍓🍒🍑🍍🍅🍆🥕🥔🥒🥑🥝🌽🌰🥜🍞🥐🧀🍗🥓🍔🍟🍕🌭🌮🌯🥚🍳🍿🍙🍣🍝🍦🍩🍪🎂🍫🍬🍭🍯☕🍺🍷🍸🍾🥛🥞",
  // sport, music, celebration
  ..."⚽🏀🏈⚾🎾🏐🎱🏓🏸🥊⛳🎯🎳🎮🎲🎸🎺🎻🎹🥁🎷🎤🎧🎨🎬🎈🎁🎀🎉🎃🏆🏅🎩🎭🎿🏹🎪🎡🎢🎠",
  // things to wear
  ..."👑👓👔👕👖👗👟👠👢👜🎒💍💎🎓",
  // objects
  ..."🔔🔑🔒🔨🔧🔦🔭💡🔋🔌💻📱📷📺📻⏰⌛📚📌📎📦📫💰💳🛁🚿🚪🍴🥄⚓🔮🔗🛒🔍💬🎵💥",
  // places
  ..."🏠🏰⛺🗽🗼⛲🗿",
  // travel
  ..."🚗🚌🚒🚚🚜🚲🚂🚄🚁🚀⛵🚤🚢🚦🚧⛽🛶🛴",
  // odd ones out
  ..."👀👻👽🤖👣",
];

export const FINGERPRINT_LENGTH = 8;

export async function fingerprint(spkiB64: string): Promise<string[]> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", fromBase64(spkiB64))
  );
  return Array.from(digest.subarray(0, FINGERPRINT_LENGTH), (b) => FINGERPRINT_EMOJI[b]);
}
