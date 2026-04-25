# Discovery in Marathi — A Real Conversation

> *Captured 2026-04-25 from the live B8 smoke. Not curated.*

This is a captured transcript of the **Shoshin host** (Tagore + Carl Rogers + Asya pillars) running a discovery interview in **Marathi** for an aunty in her 60s who wants to build an app for her Bhagavad Gita study group.

She has never coded. She doesn't know technical terms. Her daughter-in-law told her you can build apps now, so she's giving it a try.

The host's job is to make her feel sovereign in her own project — to mirror her words back, ask one question at a time in her language, and produce a clean machine-readable ProjectSpec at the end.

## How to run this yourself

```bash
shoshin init bhagwad-gita-app
cd bhagwad-gita-app
shoshin spec     # default path: host-led discovery in your language
```

When the host opens with a warm welcome, type your first message in **whatever language you think in**. Devanagari script triggers Hindi/Marathi detection automatically (Marathi disambiguated by lexical markers like आहे/मला/बघा). Tamil/Telugu/Kannada/Bengali/Gujarati/Punjabi all work via script range.

Type `/done` when you've shared enough. The host wraps up and emits the spec.

## The actual conversation

### Turn 1 (host opens in English — script not yet detected)

> **Host:** Could you tell me what you want the app to help people do?

> **User:** हो, म्हणजे आमच्या गीता गटासाठी काहीतरी करायचंय, आम्ही दर शनिवारी भेटतो, पण मला या computer बिटर जास्त माहित नाही बघा
>
> *(Yes, I want to do something for our Gita group, we meet every Saturday, but I don't know much about this computer thing, you see.)*

*(Language detection fires here: Devanagari + "आहे", "मला", "बघा" → `mr` — Marathi.)*

### Turn 2

> **Host:** तुम्ही तुमच्या गीता गटासाठी काहीतरी करायचंय म्हणत आहात, आणि तुम्ही दर शनिवारी भेटता. पण मला अजून एक गोष्ट जाणून घ्यायची आहे — हे ॲप तुम्हाला नक्की काय करायला मदत करेल? म्हणजे, श्लोक वाचणे, चर्चा करणे, किंवा इतर काही?
>
> *(You want to do something for your Gita group, and you meet every Saturday. But I want to know one more thing — what exactly will this app help you do? Like, reading shlokas, having discussions, or something else?)*

*(The host immediately switches to Marathi, mirrors the user's words back, then asks ONE concrete question with three concrete options to choose from. Carl Rogers + Tagore in action.)*

> **User:** गटात पंधरा-वीस बायका आहेत, आम्ही गीतेचा एकेक अध्याय घेतो, कोणी आलं नाही तर त्यांना WhatsApp वर श्लोक पाठवतो

### Turn 3

> **Host:** तुम्ही ॲपला काय नाव देऊ इच्छिता?
>
> *(What would you like to call the app?)*

> **User:** हो WhatsApp वर पाठवतो आम्ही, पण रोज manually टाइप करावं लागतं, खूप वेळ जातो, चुका पण होतात

*(The user gave more functional context — manual typing on WhatsApp is the pain point. The host's mid-loop question about name was a slight stutter; we'll come back to this.)*

### Turn 4-6 — the user keeps surfacing requirements

The user describes attendance tracking in a diary, that her daughter-in-law will help, that shlokas are in Marathi + some Sanskrit + sometimes photos. The host keeps asking about the app name.

This is **honest output** — the host got stuck on the name question for a few turns while the user kept volunteering richer context. In a future bundle (B9+), we'll make the host more flexible about which question to ask when the user volunteers other information.

### Final turn — `/done`

> **User:** /done

The host's closing dispatch produces the final ProjectSpec:

```json
{
  "name": "geeta-group-app",
  "oneLineGoal": "गीता गटासाठी श्लोक पाठवणे आणि उपस्थिती नोंदवण्यासाठी सोपे ॲप",
  "primaryUser": "गीतेचा अभ्यास करणारा पंधरा-वीस बायकांचा गट",
  "targetLanguages": ["mr", "en"],
  "scaffoldMode": "lite",
  "appShape": "mobile",
  "primaryStack": { "lang": "ts" },
  "surfaces": ["cli"],
  "mathPrimitives": [],
  "doneInvariants": ["correct", "tested", "observable"],
  "notes": "वापरकर्त्यांना phone वर दिसेल असे mobile app सुचवले आहे; नाव आणि ध्येय वापरकर्त्याच्या भाषेत ठेवले आहे.",
  "createdAt": "2026-04-25T03:10:44.178Z",
  "source": "interview"
}
```

## What worked

1. **Language preserved verbatim**: `oneLineGoal` and `primaryUser` are in **Marathi**, exactly as the user described them. The harness does NOT translate user values to English. The user's words are the source of truth.

2. **JSON keys stay English**: Machine-readable keys (`oneLineGoal`, `primaryUser`, `appShape`) are English so the rest of the harness (briefs, scaffolding, file naming) works without translation.

3. **Host inferred mobile correctly**: The user said "phone वर दिसलं पाहिजे" (must be visible on phone), so `appShape: "mobile"` and `primaryStack: { lang: "ts" }` (TypeScript / React Native target) — not Go CLI.

4. **Host noted its own inferences in `notes`** (in Marathi): "Suggested mobile app since the user wanted phone visibility; kept name and goal in user's language." Future Builders/Reviewers see this and don't have to re-infer.

5. **Kebab-case slug**: `geeta-group-app` — Marathi "गट" (group) transliterated, app suffix in English, all kebab-cased so the file system + git work cleanly.

## What didn't work yet

1. **Host got stuck on the name question** for ~3 turns while the user volunteered other context (attendance tracking, photos, languages). The Asya EQ engine should have detected this and adapted ("I'll come back to the name — first let me capture what you said about attendance"). It didn't yet.

2. **No streaming / partial extraction**: each turn re-sends the full conversation history in the prompt. For long discovery conversations (>10 turns), this wastes tokens.

3. **Mobile + scaffold pipeline is not yet wired**: the spec says `mobile`, but `shoshin scaffold-math` and the Builder dispatches assume Go CLI defaults. Building the mobile app from this spec requires manual stack selection + a future Wave-2 mobile scaffolder.

## Why this matters

This is not just a demo. The vision is that **anyone in India** (or anywhere) — a kirana shopkeeper, a bhajan group admin, your own mother-in-law — can describe what they want **in their own language**, and a warm Sarvam-105B-driven host turns it into a structured spec that downstream Builders can execute on.

The aunty in this transcript represents a real demographic: middle-class older Indian women who are spiritually engaged, have phones, have group activities, and have **never built software**. They've been told for 30 years that they're not the audience for software. Shoshin's bet is that the warmth of the entry point — combined with Sarvam's Indic-native fluency — flips that.

```
"मला काहीच माहित नाही पण ती मदत करेल"
("I don't know anything but she will help")
```

The user's daughter-in-law (her support person) doesn't need to be a developer either. She just needs to type for her mother-in-law and use her own intuition. The host meets her at her level too.

## Provenance

- **Transcript captured**: 2026-04-25 from `experiments/014-conversational-discovery/smoke.mjs`
- **Brief generation**: Sarvam 105B (host role: Tagore + Carl Rogers persona pair, Asya pillars layered)
- **Language detection**: O(1) script range + Marathi lexical disambiguation (no model call)
- **Total dispatches**: 7 (6 conversation turns + 1 final closing turn) ≈ 51.6s
- **Spec validation**: zod (`ProjectSpecSchema`) — host's emitted JSON validated before write

🙏 Om Lokah Samastah Sukhino Bhavantu.
