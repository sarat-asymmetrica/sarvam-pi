// Tiny offline driver for the language-detection function.
import { detectLanguage } from "../../packages/shoshin-harness/src/spec/sarvam_interview.js";

const cases: [string, string][] = [
  ["hello world", "en"],
  ["this is plain English text", "en"],
  ["यह एक हिंदी वाक्य है", "hi"],
  ["मुझे एक app बनानी है", "hi"],
  ["आमच्या गटात पंधरा बायका आहेत बघा", "mr"],
  ["मला माझ्या गीता गटासाठी app करायचे आहे", "mr"],
  ["வணக்கம் லகம்", "ta"],
  ["నమస్తే ప్రపంచం", "te"],
  ["ಕನ್ನಡ ಭಾಷೆ", "kn"],
  ["ਸਤ ਸ੍ਰੀ ਅਕਾਲ", "pa"],
];

let pass = 0;
for (const [text, expected] of cases) {
  const got = detectLanguage(text);
  if (got === expected) {
    pass++;
  } else {
    console.error(`  ✗ "${text.slice(0, 30)}..." -> ${got} (expected ${expected})`);
  }
}
console.log(`${pass}/${cases.length}`);
