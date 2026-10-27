# AI Pulse — Content Engine + Video Generator

A Next.js app that discovers AI startup content, generates scripts, and produces automated dialogue videos with character avatars and AI voices.

## Prerequisites

- **Node.js** v20+ (recommended: install via [nvm-windows](https://github.com/coreybutler/nvm-windows))
- **npm** (comes with Node.js)
- **ffmpeg** (required for video rendering with Remotion)
  - Windows: `choco install ffmpeg` or download from https://ffmpeg.org/download.html
  - Mac: `brew install ffmpeg`
  - Verify: `ffmpeg -version`

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create environment file

Copy the example and fill in your API keys:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your actual keys:

```env
# Required for content pipeline
PERPLEXITY_API_KEY=your_key
OPENAI_API_KEY=your_key

# Required for video generation
ELEVENLABS_API_KEY=your_key

# Optional
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_KEY=your_key
```

### 3. Add video assets

**Character avatars** — Place PNG images in `public/avatars/`:
```
public/avatars/jon-snow.png
public/avatars/daenerys.png
public/avatars/modi.png
public/avatars/rahul.png
public/avatars/peter-griffin.png
public/avatars/stewie.png
public/avatars/doraemon.png
public/avatars/nobita.png
public/avatars/elon.png
public/avatars/sam-altman.png
public/avatars/goku.png
public/avatars/vegeta.png
```

**Background video** — Place a Minecraft gameplay MP4 in:
```
public/backgrounds/minecraft.mp4
```

### 4. Configure ElevenLabs voices

Edit `lib/video/character-sets.ts` and replace the `voiceId` values with real voice IDs from your ElevenLabs account. Browse voices at https://elevenlabs.io/voice-library.

### 5. Start the dev server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Content Pipeline — discover AI startups and generate scripts |
| `/runs` | Discovery runs history |
| `/monitor` | YouTube + Instagram content monitor |
| `/video` | **Video Generator** — create dialogue videos with AI characters |
| `/startups` | Startups database |
| `/preferences` | Content preferences |
| `/settings` | API keys and configuration |

## Video Generator Pipeline

The `/video` page automates this flow:

1. **Pick characters** — Choose a theme (Game of Thrones, Indian Politics, Doraemon, etc.)
2. **Enter a topic** — Any subject for the characters to discuss
3. **Script generation** — OpenAI GPT-4o writes a dialogue script in each character's voice
4. **Voice synthesis** — ElevenLabs generates distinct voice audio for each line
5. **Video rendering** — Remotion composites avatars, subtitles, audio over the Minecraft background
6. **Download** — Get the final MP4

## Project Structure

```
app/                    # Next.js App Router (pages + API routes)
  api/video/            # Video generation API endpoints
  video/                # Video Generator UI page
components/             # Shared UI components (Sidebar)
config/                 # API keys, prompts, brand config
lib/                    # Core business logic
  video/                # Video pipeline modules
    character-sets.ts   #   Character theme definitions
    dialogue-generator.ts #   OpenAI dialogue script generation
    voice-generator.ts  #   ElevenLabs TTS integration
    render-video.ts     #   Remotion rendering orchestrator
remotion/               # Remotion video compositions
  compositions/         #   Main video template
  components/           #   Avatar, subtitle, indicator components
public/                 # Static assets (avatars, backgrounds)
types/                  # TypeScript interfaces
```

## Available Scripts

```bash
npm run dev              # Start development server
npm run build            # Production build
npm run start            # Start production server
npm run remotion:preview # Preview Remotion compositions in browser
npm run remotion:render  # Render video from CLI
```

## Notes

- Video rendering requires ffmpeg on your system PATH
- ElevenLabs free tier: ~10,000 chars/month (~8-10 videos)
- Rendering a 60s video takes 2-5 minutes depending on machine specs
- Without Supabase configured, data is stored locally in `.data/` (JSON files)
- Avatar images are not included — you must provide your own PNGs
