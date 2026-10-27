export interface Character {
  name: string;
  avatarPath: string;
  voiceId: string;
  speakingStyle: string;
}

export interface CharacterSet {
  id: string;
  theme: string;
  description: string;
  characterA: Character;
  characterB: Character;
}

/**
 * Pre-configured character sets. Users should:
 * 1. Place avatar PNGs in public/avatars/ matching the avatarPath values
 * 2. Replace voiceId placeholders with real ElevenLabs voice IDs from their library
 *    (browse voices at https://elevenlabs.io/voice-library)
 */
export const CHARACTER_SETS: CharacterSet[] = [
  {
    id: "got",
    theme: "Game of Thrones",
    description: "Jon Snow and Daenerys Targaryen debate the topic",
    characterA: {
      name: "Jon Snow",
      avatarPath: "/avatars/jon-snow.png",
      voiceId: "pNInz6obpgDQGcFmaJgB",
      speakingStyle:
        "Skeptical, pragmatic, slightly weary tone. Asks the hard practical question. Talks like a smart engineer who's been burned before. NO catchphrases, NO Game of Thrones quotes — speaks in plain modern English.",
    },
    characterB: {
      name: "Daenerys",
      avatarPath: "/avatars/daenerys.png",
      voiceId: "EXAVITQu4vr4xnSDxMaL",
      speakingStyle:
        "Confident, sharp, slightly contrarian. Pushes back with concrete examples and hedged opinions. Talks like an internet-native founder on a podcast. NO catchphrases, NO Game of Thrones quotes — speaks in plain modern English.",
    },
  },
  {
    id: "indian-politics",
    theme: "Indian Politics",
    description: "Modi and Rahul Gandhi debate the topic",
    characterA: {
      name: "Modi Ji",
      avatarPath: "/avatars/modi.png",
      voiceId: "VR6AewLTigWG4xSOukaG",
      speakingStyle:
        "Confident, conviction-driven, makes bold claims with practical framing. Talks about real product impact. Avoid political catchphrases — keep it grounded in the tech topic.",
    },
    characterB: {
      name: "Rahul Gandhi",
      avatarPath: "/avatars/rahul.png",
      voiceId: "onwK4e9ZLuTAKqWW03F9",
      speakingStyle:
        "Questioning, skeptical, surfaces the hidden trade-offs. Pushes back politely with hedged language. Avoid political catchphrases — keep it grounded in the tech topic.",
    },
  },
  {
    id: "family-guy",
    theme: "Family Guy",
    description: "Peter Griffin and Stewie Griffin discuss the topic",
    characterA: {
      name: "Peter Griffin",
      avatarPath: "/avatars/peter-griffin.png",
      voiceId: "TX3LPaxmHKxFdv7VOQHJ",
      speakingStyle:
        "Casual, slightly clueless but earnest. Asks the dumb-on-purpose question that turns out to be a smart one. Plain modern English — skip cartoon catchphrases.",
    },
    characterB: {
      name: "Stewie",
      avatarPath: "/avatars/stewie.png",
      voiceId: "pqHfZKP75CvOlQylNhV4",
      speakingStyle:
        "Sharp, witty, mildly condescending British cadence. Makes the precise technical point. Plain modern English — skip cartoon catchphrases.",
    },
  },
  {
    id: "doraemon",
    theme: "Doraemon",
    description: "Doraemon and Nobita explore the topic",
    characterA: {
      name: "Doraemon",
      avatarPath: "/avatars/doraemon.png",
      voiceId: "jBpfuIE2acCO8z3wKNLl",
      speakingStyle:
        "Patient, helpful, breaks down the complex thing simply. Talks like an experienced engineer explaining to a junior dev. Plain modern English — skip catchphrases.",
    },
    characterB: {
      name: "Nobita",
      avatarPath: "/avatars/nobita.png",
      voiceId: "g5CIjZEefAph4nQFvHAz",
      speakingStyle:
        "Curious, asks the practical 'but how does that actually work in my workflow' questions. Earnest, occasionally sharp insight. Plain modern English — skip catchphrases.",
    },
  },
  {
    id: "tech-bros",
    theme: "Tech Bros",
    description: "Elon Musk and Sam Altman debate the topic",
    characterA: {
      name: "Elon Musk",
      avatarPath: "/avatars/elon.png",
      voiceId: "N2lVS1w4EtoT3dr4eOWO",
      speakingStyle:
        "First-principles thinker, blunt, slightly contrarian, internet-aware. Drops sharp one-liners. Skip Mars/rockets bits unless directly relevant — focus on the topic.",
    },
    characterB: {
      name: "Sam Altman",
      avatarPath: "/avatars/sam-altman.png",
      voiceId: "CYw3kZ02Hs0563khs1Fj",
      speakingStyle:
        "Measured, thoughtful, hedges opinions. Surfaces the second-order consequence. Talks like a careful product founder. Stay grounded in the topic.",
    },
  },
  {
    id: "anime",
    theme: "Anime Rivals",
    description: "Goku and Vegeta argue about the topic",
    characterA: {
      name: "Goku",
      avatarPath: "/avatars/goku.png",
      voiceId: "ErXwobaYiN019PkySvjV",
      speakingStyle:
        "Excited, enthusiastic, sees the upside first. Simple direct language. Plain modern English — skip anime catchphrases.",
    },
    characterB: {
      name: "Vegeta",
      avatarPath: "/avatars/vegeta.png",
      voiceId: "IKne3meq5aSn9XLyUdCD",
      speakingStyle:
        "Sharp, competitive, points out where the optimism breaks down. Slightly dry humor. Plain modern English — skip anime catchphrases.",
    },
  },
];

export function getCharacterSetById(id: string): CharacterSet | undefined {
  return CHARACTER_SETS.find((cs) => cs.id === id);
}

export function getAllCharacterSets(): CharacterSet[] {
  return CHARACTER_SETS;
}
