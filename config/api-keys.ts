export const DEFAULT_API_KEYS = {
  perplexity_api_key: process.env.PERPLEXITY_API_KEY || "",
  openai_api_key: process.env.OPENAI_API_KEY || "",
  elevenlabs_api_key: process.env.ELEVENLABS_API_KEY || "",
  supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabase_anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  supabase_service_key: process.env.SUPABASE_SERVICE_KEY || "",
  apify_api_key: process.env.APIFY_API_KEY || "dummy-apify-key-replace-me",
  // YouTube Data API v3 key — used by /api/visuals/find to pull demo/tutorial
  // videos for each topic. Optional: if missing, the visuals endpoint just
  // skips Tier 2 (YouTube) and returns OG-scraped hero images only.
  youtube_api_key: process.env.YOUTUBE_API_KEY || "",
};

export const BRAND = {
  instagram_handle: "mohit.builds.ai",
  creator_name: "Mohit",
  creator_bio:
    "IIT Bombay engineer, 6 years in tech, breaks down AI startups daily",
  colors: {
    ink: "#1A1A2E",
    rust: "#E8553A",
    cream: "#FFF8F0",
    sage: "#2D6A4F",
    white: "#FFFFFF",
  },
};

export const MONITORED_YOUTUBE_CHANNELS = [
  { id: "UCXS_GSFPOZQCET2bISjHCBQ", name: "AI Jason" },
  { id: "UCbfYPyIEQ-FDJCAL_VfEzUQ", name: "Matt Wolfe" },
  { id: "UCLXo7UDZvByw2ixzpQCufnA", name: "Fireship" },
  { id: "UCsBjURrPoezykLs9EqgamOA", name: "Fireship" },
  { id: "UCWN3xxRkmTPphDAT5JR2Oew", name: "AI Explained" },
];

export const MONITORED_INSTAGRAM_ACCOUNTS = [
  "ai_daily_tools",
  "theaiinsider",
  "ai.marketing.tools",
];

export const X_TRACKED_ACCOUNTS = [
  "@karpathy",
  "@dair_ai",
  "@rasbt",
  "@svpino",
  "@_philschmid",
  "@hwchung27",
  "@ClementDelworker",
  "@TheAITimeline",
  "@ai_for_success",
];

export const DISCOVERY_PROMPTS = {
  startup_funding: `Find 10 AI startups that recently raised funding (announced in 2025 or 2026) across ANY domain of AI. I need SMALL-SCALE and MEDIUM-SCALE companies building genuine technical products, NOT big names like OpenAI, Anthropic, Google, Meta, Mistral, etc. Exclude companies that are simple ChatGPT wrappers or basic API integrations.

SEARCH BROADLY across these sources:
- Y Combinator recent batches (W25, S25, W26, etc.) and YC-funded AI companies
- TechCrunch, The Information, Bloomberg AI/tech funding coverage
- Crunchbase recent funding announcements
- a16z, Sequoia, Index, Benchmark, Greylock, Lightspeed, First Round portfolio announcements
- Product Hunt launches from well-funded AI startups
- Twitter/X founder announcements of Seed/Series A rounds

IMPORTANT: Use the most recently available funding data you can find. Do NOT refuse if you cannot find data from a specific date range — just return the most recent AI startup funding announcements you have access to.

Cover as WIDE a range of AI as possible — do NOT limit yourself to any specific vertical. AI can touch anything: agents, voice, video, search, coding tools, healthcare, robotics, biology, gaming, creative tools, consumer apps, B2B SaaS, infrastructure, chip design, scientific research — anything where AI/ML is central to the product. Prioritize diversity across verticals over any single niche.

For each startup provide this EXACT format (one startup per line, pipe-separated):
NAME | FUNDING_AMOUNT | ROUND_TYPE | ONE_LINE_DESCRIPTION | LEAD_INVESTOR | KEY_TECH_USED | SCALE | BUILDER_VALUE

Mix of categories:

MEDIUM (3-4 startups, $10M to $50M, Series A/B):
1. Name | $Amount | Round | Description | Investor | Tech | medium | high

SMALL (4-5 startups, $500K to $10M, Seed/Pre-seed):
2. Name | $Amount | Seed/Pre-seed | Description | Investor | Tech | small | high

YC (1-2 startups from recent YC batches, any AI focus):
3. Name | $Amount | YC Seed/Series A | Description | Y Combinator + any other investor | Tech | small | high

Plain text only, no bold or markdown. Each must be building real technology, not just wrapping existing APIs.

SCALE is exactly: small (under $10M) OR medium ($10M-$50M). Do NOT include large/big startups above $50M.
BUILDER_VALUE is exactly: high or medium. BUILDER_VALUE means: can a developer learn something useful from how this company builds (architecture, training, eval, data, infra)? ONLY include startups where BUILDER_VALUE is medium or high.

EXCLUDE: large-scale $50M+ rounds; pure enterprise sales plays with no interesting tech; simple ChatGPT/API wrappers with no novel architecture; infrastructure deals like power plants or generic data centers with no developer angle.`,

  x_builder_insights: `Search X (Twitter) for the most valuable, practical AI/ML posts from these specific accounts in the last 7 days: @karpathy, @dair_ai, @rasbt, @svpino, @_philschmid, @hwchung27, @ClementDelworker, @TheAITimeline, @ai_for_success.

Focus ONLY on posts about: new tools released, code tutorials, model fine-tuning tips, agentic workflow patterns, open-source releases, architecture insights, and how-I-built threads.

Ignore: promotional fluff, jokes, pure politics, low-signal retweets, personal life updates.

For EACH valuable post (up to 8), return EXACTLY this pipe-separated format on ONE line:
AUTHOR | FULL_POST_TEXT | PRACTICAL_TAKEAWAY | REEL_POTENTIAL | POST_URL

FULL_POST_TEXT: Include the COMPLETE text of the post, not a summary. If the post contains code snippets, include them. If it is a thread, include all parts.
POST_URL: The direct URL to the tweet/post (e.g. https://x.com/karpathy/status/...). If you cannot find the exact URL, leave empty.
REEL_POTENTIAL is exactly: high OR medium OR low

Only include posts where REEL_POTENTIAL is high or medium. If an account had no valuable posts in 48 hours, skip them.
Plain text only, no bold or markdown.`,

  trending_content: `What AI and machine learning topics are trending on Instagram Reels, YouTube Shorts, and Twitter/X right now?

Tell me:
1. Top 5 AI topics being discussed by tech creators in the past 7 days
2. What formats are getting the most engagement (talking head, screen recording, carousel, whiteboard)
3. What AI concepts are people searching for or asking about
4. Any AI controversies or debates happening right now

For each trending topic provide:
TOPIC | PLATFORM | SUGGESTED_CONTENT_ANGLE

Focus on what tech builders, engineers, and AI-focused creators are covering, not generic motivational content.
Plain text only, no bold or markdown.`,
};

export const MASTER_RESEARCH_PROMPT = (
  name: string,
  funding: string,
  round: string,
  desc: string
) => `You are doing EXTREMELY deep research on the AI startup '${name}' that recently raised ${funding} ${round}. ${desc}

This is for a tech-journalism content script. A senior ML engineer should find this interesting, NOT a press release. Depth, specificity, and primary sources matter. Vague platitudes are useless.

SEARCH BROADLY: Crunchbase, LinkedIn (founders and company), engineering blogs, arxiv, GitHub, TechCrunch, The Information, Bloomberg, podcasts (Lex Fridman, Latent Space, Acquired), YouTube conference talks, Hacker News threads, Reddit r/MachineLearning, Twitter/X threads from founders and industry experts, the company's own blog and docs, Y Combinator pages, alumni interviews, G2/Product Hunt reviews.

Return ONE long response with SIX clearly delimited sections below. Use the EXACT section headers shown — I will parse them. If any fact is not verifiable, write "unverified" for that item. DO NOT fabricate names, papers, numbers, customers, or benchmarks. DO NOT substitute a different company.

=== FOUNDERS ===

1) FULL NAMES of ALL founders and co-founders (first + last).
2) FOR EACH FOUNDER:
   - Current title at '${name}'
   - Education: university, degree, field, year graduated
   - EVERY prior company with specific role and years (including obscure early-career jobs — they often reveal the real backstory)
   - Published papers (with arxiv IDs if applicable), open-source projects, patents, public failures
   - Specific domain expertise that qualifies them to build THIS product
   - Every public appearance — podcasts, YC interviews, conference talks — with links
   - Twitter/X handle
3) FOUNDING STORY: Date founded, the specific moment or insight. Did they pivot from something else? Kill another product?
4) NON-OBVIOUS BACKGROUND: Anything unusual — a competitive hobby, an unrelated prior business, a PhD in an adjacent field, a personal connection to the problem. The weirder the better.
5) TEAM: Headcount, engineering:GTM ratio, notable hires (ex-FAANG, ex-known-startup with names).
6) ADVISORS & KEY INVESTORS: Names, why they matter, any personal connections to the founders.

=== TECHNICAL ===

1) SPECIFIC MODELS: Exact model names used or built on. Not "LLMs" — which one? (GPT-4o? Claude 3.5 Sonnet? Llama 3.1 70B? Mistral? Custom?) If they fine-tune, on what base model?
2) ARCHITECTURE PATTERN: RAG? Agentic? Multi-agent? Fine-tuning? Distillation? MoE? Diffusion? GNNs? State-space? Name the exact pattern.
3) TRAINING / DATA: Datasets trained on — public (Common Crawl, The Pile, etc.) or proprietary? How did they acquire proprietary data? Synthetic? Human-labeled? Size?
4) END-TO-END PIPELINE as 3-6 numbered steps. For each: exact tech name (e.g. "Pinecone vector search", "vLLM serving", "Ray for distributed training", "LangGraph for orchestration").
5) INFRA: Cloud, GPU types (A100, H100, B200), serving (vLLM, TGI, Triton, custom), training (PyTorch, JAX, DeepSpeed, FSDP).
6) LATENCY / BENCHMARKS: Tokens/sec, latency, accuracy on standard benchmarks (MMLU, HumanEval, domain-specific).
7) NOVEL TECHNICAL CLAIMS: What is genuinely new vs standard? Arxiv IDs if referenced.
8) ENGINEERING BLOG / GITHUB / TECH TALKS: Direct URLs.
9) ADMITTED LIMITATIONS: What have they said they can't do yet?

=== PRODUCT ===

1) ACTUAL USER FLOW step by step — signup to first "aha" moment. What screen? What input? What output?
2) CORE VALUE PROP in ONE sentence — what gets 10x better/cheaper/faster vs alternative?
3) NAMED CUSTOMERS: real company logos (from website, case studies, testimonials). Quote specific results ("cut X from 6 weeks to 3 days").
4) PRICING: exact numbers. Free tier limits, paid $/month, enterprise? Unit of charge (per seat, per request, per GB)?
5) INTEGRATIONS: exactly what it plugs into (Slack? Salesforce? Specific APIs? Chrome extension? CLI? REST?)
6) COMPETITIVE POSITIONING vs closest alternative — switching cost, why pick this over the incumbent?
7) FOUNDING DATE, HQ, company URL, product URL if separate.
8) TOP 3 USE CASES they market, with named customers for each if possible.

=== MARKET ===

1) TAM with specific dollar figure AND source. If estimates differ, give the range.
2) 4-6 SPECIFIC COMPETITORS — for each: one-line differentiator, their funding, what makes '${name}' different technically or GTM.
3) WHY NOW — what specifically changed in the last 12-24 months? (Foundation model? Regulation? Compute price? Data?)
4) MOAT — data, distribution, switching cost, network effects, regulatory, technical IP. What do they actually have?
5) LEAD INVESTOR + public thesis (blog post, LinkedIn, podcast on WHY they invested).
6) CO-INVESTORS: all fund names.
7) PREVIOUS ROUND (if any): when, size, investors, valuation if reported.
8) MARKET RISKS — what could kill the company? (Incumbent retaliation? Commoditization? Regulation? Foundation model absorbing the use case?)

=== BUSINESS ===

1) REVENUE MODEL: SaaS subscription? Usage-based (per call/token/GB)? Enterprise license? Marketplace take rate? Open-source + paid hosting?
2) ACV / CONTRACT SIZE: any reported average contract value, ARR, or deal sizes?
3) GROWTH NUMBERS: users, customers, ARR growth, retention — any numbers from founders in press/podcasts.
4) GTM MOTION: outbound sales? PLG/self-serve? Partnerships? Developer community/open-source pull?
5) KNOWN CUSTOMERS: named logos, enterprise vs SMB vs developers.
6) TEAM SIZE: current headcount (LinkedIn, press). Engineering vs GTM.
7) HIRING PRIORITIES: what roles are currently open (careers page, LinkedIn job posts)? Reveals strategy.
8) STRATEGIC PARTNERSHIPS: integrations with AWS, Azure, GCP, Databricks, Snowflake, Hugging Face? Co-marketing deals?
9) USE OF FUNDS: stated in funding announcement — what are they spending on?
10) BURN & RUNWAY: rarely public, but if mentioned, include.

=== CONTRARIAN ===

Find the NON-OBVIOUS angles. This is for the scroll-stopping reel hook — I need SURPRISING material, not press-release copy.

Search: founder personal blogs, Twitter/X threads, podcasts, YC demo day posts, Reddit, Hacker News comments, LinkedIn posts, alumni interviews, old GitHub projects, conference talks.

1) WEIRD FOUNDER BACKSTORY: What did founders do BEFORE that has no obvious connection? (A chemistry PhD who ran a car-wash empire. An ex-pro gamer who now does video infra. The stranger the pivot, the better.)
2) CONTROVERSIAL / UNUSUAL PUBLIC TAKES: Founder statements running against conventional wisdom. Strong opinions, polarizing positions, public feuds.
3) UNEXPECTED CONNECTIONS: Personal ties between founders and investors, advisors, or target customers (e.g. "CEO used to work at the exact company they now sell to").
4) FAILED PRIOR STARTUP / PIVOT: Did this company start as something else? Did founders fail publicly before?
5) WHY THIS IS HARDER / WEIRDER THAN IT LOOKS: Counterintuitive technical or market challenge most observers miss.
6) UNDERRATED DETAIL: A specific technical or business choice that seems small but IS the whole game (e.g. "trained on 10x more domain-specific data than any competitor — that's the entire moat").
7) ONE-LINE "HOLY SHIT" STAT: The single most surprising fact about this company, backed by source.
8) WHAT THE COMPETITION DOESN'T SEE: Public signals competitors are misreading.

Include as many citations / URLs inline as possible. If an entire section has nothing concrete for '${name}', write "No non-obvious information publicly available" — do not invent.`;

export const RESEARCH_PROMPTS = {
  technical: (name: string, funding: string, round: string, desc: string) =>
    `Research the AI startup '${name}' (raised ${funding} ${round}). ${desc}

Search: company engineering blog, GitHub, arxiv, Crunchbase, TechCrunch, YouTube talks, podcasts, Hacker News threads, LinkedIn posts from the founding team.

GOAL: I want to understand the ACTUAL technical architecture well enough that a senior ML engineer would find it interesting. Vague answers are useless.

REQUIRED — find AS MUCH OF THIS AS PUBLICLY AVAILABLE for '${name}' specifically:

1) SPECIFIC MODELS: Exact model names they use or are building on. Not "LLMs" — which LLM? (GPT-4o? Claude 3.5 Sonnet? Llama 3.1 70B? Mistral? Custom?) If they fine-tune, on what base model? Name the base.
2) ARCHITECTURE PATTERN: Are they doing RAG? Agentic workflow? Multi-agent? Fine-tuning? Distillation? Mixture-of-experts? Diffusion? Graph neural networks? State-space models? Name the exact pattern.
3) TRAINING / DATA: What datasets do they train on? Public (name them: Common Crawl, The Pile, etc.) or proprietary? How did they acquire proprietary data? Synthetic? Human-labeled? Size?
4) END-TO-END PIPELINE as 3-6 numbered steps. For each: exact technology name (e.g. "Pinecone for vector search", "LangChain for orchestration", "vLLM for serving", "Ray for distributed training").
5) INFRA: Cloud provider, GPU types (A100, H100), serving framework (vLLM, TGI, Triton, custom), training framework (PyTorch, JAX, DeepSpeed, FSDP).
6) LATENCY / THROUGHPUT: Any benchmarks they've published? Tokens/sec, latency numbers, accuracy on standard benchmarks (MMLU, HumanEval, domain-specific)?
7) NOVEL TECHNICAL CLAIMS: What do they say is genuinely new vs what's standard? If they reference papers, give arxiv IDs.
8) ENGINEERING BLOG / GITHUB / TECH TALKS: Direct URLs if they exist.
9) TECHNICAL DEBT / LIMITATIONS: What have they admitted they can't do yet? (From podcasts, blogs, interviews.)

If any item is unverifiable for '${name}', write "unverified" for that item. Do NOT fabricate model names, papers, or benchmarks. Do NOT substitute a different company.`,

  product: (name: string) =>
    `Deep research the product and user experience of AI startup '${name}'.

Search: company website, product demos, YouTube walkthroughs, G2/Product Hunt reviews, Twitter/X mentions from actual users, customer case studies, app store listings.

Provide for '${name}' ONLY:

1) THE ACTUAL USER FLOW — step by step what happens from signup to first "aha" moment. Be concrete: what screen do they see first? What do they input? What do they get back?
2) CORE VALUE PROP in ONE sentence — what gets 10x better/cheaper/faster vs the alternative?
3) NAMED CUSTOMERS — real company names (public case studies, testimonials). Quote specific results if available (e.g. "cut X from 6 weeks to 3 days").
4) PRICING — exact numbers. Free tier limits, paid tier $/month, enterprise "contact us"? What's the unit of charge (per seat, per request, per GB)?
5) PLATFORM / INTEGRATION — exactly what it plugs into (Slack? Salesforce? Specific APIs? Chrome extension? CLI? REST endpoint?)
6) COMPETITIVE POSITIONING vs the closest alternative — what's the switching cost and why would a user pick this over the incumbent?
7) FOUNDING DATE, HQ, company URL, product URL if separate.
8) SUPPORTED USE CASES — top 3 use cases they actually market, with named customers for each if possible.

If a field is not publicly verifiable, write "unverified". Do not substitute a different company.`,

  market: (name: string, desc: string) =>
    `Research the market context, competition, and investment thesis around '${name}' (${desc}).

Search: Crunchbase, PitchBook summaries, investor blog posts, industry reports, TechCrunch / The Information / Bloomberg / FT articles.

Provide ONLY verified information:

1) TAM with a specific dollar figure AND the source that reports it. If estimates differ, give the range.
2) SPECIFIC COMPETITORS — name 4-6 and for each: one-line differentiator, funding they've raised, what makes '${name}' different technically or in GTM.
3) WHY NOW — what *specifically* changed in the last 12-24 months that makes this startup possible? (New foundation model? Regulatory shift? Compute price drop? Data availability?)
4) MOAT — data, distribution, switching cost, network effects, regulatory, technical IP. Which do they actually have, and which do they claim to have?
5) LEAD INVESTOR + their public thesis on this deal. Search their blog post, LinkedIn, podcast for WHY they invested.
6) CO-INVESTORS — names of other participating funds.
7) PREVIOUS ROUND (if any) — when, size, investors, valuation if reported.
8) MARKET RISKS — what could kill this company? (Incumbent retaliation? Commoditization? Regulation? Foundation model replacing the product?)

If unverifiable, say "unverified". Do not fabricate.`,

  business: (name: string, desc: string) =>
    `Research the BUSINESS MODEL and TRACTION of AI startup '${name}' (${desc}).

Search: company website, LinkedIn company page, founder interviews/podcasts, press releases, Crunchbase, SignalHire, and TechCrunch funding articles for revenue/growth mentions.

Provide for '${name}' ONLY:

1) REVENUE MODEL — SaaS subscription? Usage-based (per call/token/GB)? Enterprise license? Marketplace take rate? Open-source + paid hosting? Be specific.
2) ACV / CONTRACT SIZE — any reported average contract value, ARR, or deal sizes? If quoted in an article, cite.
3) GROWTH NUMBERS — users, customers, ARR growth rate, retention, any numbers mentioned by founders in interviews or press.
4) GTM MOTION — outbound sales? PLG/self-serve? Partnerships? Developer community/open-source pull?
5) KNOWN CUSTOMERS — named logos from the website or case studies. Enterprise, SMB, developers?
6) TEAM SIZE — current headcount (from LinkedIn or press). Engineering vs GTM breakdown if public.
7) HIRING PRIORITIES — what roles are currently open (from their careers page or LinkedIn job posts)? This reveals strategy.
8) STRATEGIC PARTNERSHIPS — integrations with AWS, Azure, GCP, Databricks, Snowflake, Hugging Face? Co-marketing deals?
9) USE OF FUNDS — if stated in the funding announcement, what will they spend it on?
10) BURN & RUNWAY — rarely public, but if mentioned in articles, include.

If unverifiable for any item, say "unverified". Do not invent numbers. Do not substitute another company.`,

  contrarian: (name: string, desc: string) =>
    `Find the NON-OBVIOUS and CONTRARIAN angles around '${name}' (${desc}). This is for a scroll-stopping reel hook — I need the SURPRISING story, not the press release.

Search: founder personal blogs, Twitter/X threads, podcasts, Y Combinator demo day posts, Reddit discussions, Hacker News comments, LinkedIn posts from the founders, alumni interviews, old projects on GitHub.

Find ANY of these that apply to '${name}':

1) WEIRD FOUNDER BACKSTORY — what did the founders do BEFORE this that has no obvious connection? (A chemistry PhD who built a car wash company who now does chemistry AI. An ex-pro gamer who now builds video infra. Etc.) The stranger the pivot, the better.
2) CONTROVERSIAL / UNUSUAL TAKE — any public statement from the founders that runs against conventional wisdom in their space? Any controversies, strong opinions, or polarizing positions?
3) UNEXPECTED CONNECTIONS — personal ties between the founders and their investors, advisors, or target customers? E.g. "CEO used to work at the exact company they're now selling to."
4) FAILED PREVIOUS STARTUP / PIVOT — did this company start as something else? Did the founders fail publicly before?
5) WHY THIS IS HARDER / WEIRDER THAN IT LOOKS — what's the counterintuitive technical or market challenge most people miss when looking at this space?
6) UNDERRATED DETAIL — a specific technical or business choice that seems small but is actually the whole game (e.g. "they chose to train on 10x more data of a specific type than competitors — that's the entire moat").
7) ONE-LINE "SHOCKING" STAT — the single most surprising fact about this company, backed by a source.
8) WHAT THE COMPETITION DOESN'T SEE — any public signals that competitors are misreading the market here?

I'm looking for the "holy shit" angle that would make a tech builder stop scrolling. Vague platitudes are useless. Only include items you can verify from a real source. If none exist, say so honestly — don't invent.`,

  viral: () =>
    `Find 5 Instagram Reels or YouTube Shorts about AI startups or tech breakdowns that went viral in the past 14 days (high views, saves, shares).

For each viral video, tell me:
1. The exact opening HOOK (first sentence spoken that made people stop scrolling)
2. The FORMAT used (talking head, screen recording, whiteboard, text overlay heavy, carousel walkthrough)
3. Video LENGTH
4. What made it ENGAGING (pacing, visuals, information density, controversy)

Also tell me:
- Top 5 trending audio tracks on Instagram Reels for educational/tech content right now
- What carousel formats are getting the most saves on Instagram for tech content?
- What hook patterns are working best (question, stat, challenge, prediction, contrarian)?

Focus on posts from AI builders, engineers, and tech founders. Not generic motivational content.
Plain text only, no markdown.`,

  x_tip_deep: (post: string, summary: string, takeaway: string, author: string) =>
    `Research the following SPECIFIC TECHNICAL TOPIC in depth. DO NOT write a biography of the author. DO NOT write about who the author is. Research ONLY the topic/technique/concept described below.

TOPIC DESCRIBED IN THIS POST:
${post}

Summary of the topic: ${summary}
Key takeaway: ${takeaway}
(Posted by @${author} -- but research the TOPIC, not the person)

Provide DEEP, VERIFIED technical research on the specific technique, tool, concept, or workflow discussed:
1) What exactly is this technique/tool/concept? Define it precisely.
2) How does it work technically? Architecture, algorithm, implementation details.
3) What specific frameworks, APIs, model names, repos are involved?
4) How could a builder reproduce or apply this? Concrete steps.
5) What are the alternatives and how does this approach compare?
6) Pitfalls, limitations, and what to verify before using.
7) 3-5 citations or primary sources.

IMPORTANT: The author is IRRELEVANT. Do not write about their career, background, or achievements. Research the TECHNICAL TOPIC only.
If you cannot verify something, say "unverified" -- do not invent repos or version numbers.`,
};

export const GENERATION_PROMPTS = {
  hooks_startup: `You write scroll-stopping Instagram hooks for @mohit.builds.ai — an IIT Bombay engineer (6 years in tech) who breaks down AI startups for a **builder / technical / business-operator audience**.

PURPOSE: This is a technical-education channel. The viewer is a developer, engineer, PM, or founder who wants to LEARN something useful — a tech pattern, a business model insight, or a market observation. The hook must promise something they will walk away smarter about. This is NOT entertainment or founder gossip.

Audience test: imagine a senior engineer scrolling at 11pm. Would they stop for this hook because they think they'll learn something worth knowing? If the hook is "weird-fact clickbait" without a real lesson, REJECT it.

Rules:
- Pure English only, no Hinglish, no emojis, speakable in under 5 seconds
- Never open with the startup name
- Hook must tease a SPECIFIC TECHNICAL, BUSINESS, or MARKET insight — with a number, named technology, or concrete detail from the research
- Founder backstory is NOT a hook source unless it DIRECTLY reveals a technical or business decision (e.g., "the CEO spent 6 years at Google Brain on exactly this retrieval problem" is a tech hook; "the CEO used to run a car wash" is founder gossip — reject that as a hook)
- BANNED phrases: 'game-changing', 'revolutionary', 'in the world of AI', 'this startup is doing something incredible', 'you won't believe'

Before outputting each hook, ask: what specifically does the viewer LEARN by watching this reel? If you can't answer in one sentence, rewrite.

Generate 10 hooks across these styles — all must be tech / business / market angles. Each style MUST be represented at least once. Feel free to use a style twice if the research has two strong angles in that category.

1. TECH_DECISION: Lead with a specific architecture or model choice and why it matters. Example: "They picked LlamaIndex over LangChain for a reason most builders will face soon."
2. BUSINESS_INSIGHT: Lead with a business model or pricing observation. Example: "This startup is selling to chemical manufacturers at $X ACV — here's the GTM motion every vertical AI company should study."
3. MARKET_PATTERN: Lead with a market observation or trend. Example: "Vertical AI for regulated industries is outperforming horizontal LLMs — and this $7M seed proves it."
4. TECHNICAL_CURIOSITY: Lead with a technical gap or challenge. Example: "Fine-tuning doesn't work for chemistry reasoning. Here's the alternative this startup just raised $7M to build."
5. SHOCKING_STAT: A specific number with context that matters to builders. Example: "$2T in chemical industry knowledge is trapped in PDFs. Here's who's extracting it."
6. BUILDER_LESSON: Preview a reusable pattern, tradeoff, or architectural decision. Example: "If you're building RAG for a regulated domain, their source-grounding approach is worth stealing."
7. FOUNDER_CURIOSITY: ONLY if the founder's specific past role / paper / project DIRECTLY explains a technical or business decision. Example: "Their CEO spent 6 years at DeepMind on exactly this RL reward-model problem — that's why they picked this architecture." (Reject if it's just resume-dropping.)
8. INDUSTRY_SHIFT: Lead with a "why now" technical or market shift that made this solvable this year but not last. Example: "Long-context models crossed 1M tokens and suddenly this entire product category became possible."
9. COUNTER_INTUITIVE: Lead with a claim that contradicts common builder wisdom, backed by this startup's approach. Example: "Most agent startups are overengineering planning. This one ripped out the planner and got better results."
10. PRICE_OBSERVATION: Lead with a pricing or unit-economics angle specific to this startup. Example: "They charge a flat annual fee with unlimited research requests — here's why the unit economics still work."

Output ONLY a valid JSON array with exactly 10 entries. No markdown code fences.
[{"style": "TECH_DECISION", "hook": "...", "why_it_works": "...what the viewer learns by watching"}, ...]`,

  hooks_x_tip: `You write scroll-stopping Instagram hooks for @mohit.builds.ai — builder-to-builder, crediting the original X creator.

Rules: Pure English, no emojis, under 5 seconds spoken. Create curiosity about a practical skill, tool, or mental model — not hype.

EVERY hook must contain a specific technical detail, number, or tool name from the research. Generic hooks are BANNED. BANNED phrases: 'game-changing', 'revolutionary', 'incredible'. If the hook could apply to any topic, rewrite with specifics.

Before outputting each hook, ask: would a developer scrolling at 11 PM stop for this?

6 hooks as JSON array: [{"style":"...","hook":"...","why_it_works":"..."}]
Styles: CREATOR_CREDIT, TOOL_FOCUS, PATTERN_INTERRUPT, MINI_TUTORIAL_TEASE, SHIPPER_LENS, CURIOSITY_GAP.

Output ONLY valid JSON array. No markdown fences.`,

  reel_script: `You write 55-65 second Instagram Reel scripts for @mohit.builds.ai — an IIT Bombay engineer with 6 years in tech breaking down AI startups for developers, engineers, and technical founders.

PURPOSE: Pure tech-journalist breakdown for builders. The viewer walks away knowing: (1) what the startup actually does, (2) who built it and why that background matters, (3) how the tech ACTUALLY works end-to-end in concrete steps, (4) the business/market reality. NOT promotion, NOT founder gossip, NOT entertainment.

VOICE:
- A senior engineer explaining something interesting to a smart friend at a bar.
- Confident, curious, slightly contrarian. Never promotional.
- Pure English. No Hinglish, no emojis, no markdown.

ABSOLUTE RULES — top failure modes:
1. NO AI-SLOP VOCABULARY. If the script contains ANY of these, rewrite: "revolutionizing", "redefines", "game-changing", "tailored for", "leveraging", "untapped market", "inefficiencies of", "paradigm shift", "cutting-edge", "state-of-the-art", "in the world of", "brings together", "powerful", "seamless", "empowers", "groundbreaking", "revolutionary", "unlocks", "at the intersection of", "transforming", "reimagining".
2. NO invented numbers. Every TAM / market-size / customer-count / pricing / benchmark number MUST come verbatim from the research. If research doesn't name the number, OMIT the claim — don't round, don't estimate, don't say "billions".
3. When you name a technique (RAG / Reflection-Tuning / agentic / fine-tuning / retrieval / diffusion / etc.), the NEXT sentence must explain what it *does differently* in 15 words or less. No jargon drops without unpack.
4. NO filler openings ("Let me break it down", "Today I'm covering", "Here's how it works"). The first words are the user-picked HOOK verbatim.
5. NO padding ("so basically", "really interesting", "what's cool about this").

You will be given a HOOK the user has picked. Use it as the first line, almost verbatim. Build the entire script around THAT angle.

STRUCTURE (target 200-230 spoken words total, ~55-65 seconds):

[HOOK — 0-3s, ~12 words]
Output the user's chosen hook as the first sentence. Do not replace or paraphrase it.

[INTRO — 3-10s, ~25 words]
What the startup does in one plain sentence. Name: founders (count), funding amount, round, lead investor. Name the specific pain they solve with ONE concrete detail from the research.

[FOUNDERS HOOK — 10-18s, ~20 words]
ONE curiosity-bait sentence about the founders' background — BUT ONLY if that background directly explains a technical or business decision in the product. Example: "The CEO spent 6 years at DeepMind working on exactly this reward-model problem — which is why Reflection-Tuning looks the way it does." If no such link exists, SKIP this section entirely (go straight from intro to technical deep-dive).

[TECHNICAL DEEP-DIVE — 18-32s, ~55 words]
From a builder's lens. Cover in 3-4 sentences:
- What models / frameworks / architectures they use (named, not "LLMs").
- What's technically interesting or smart about their approach.
- What's weak, risky, or unverified about it (one honest observation).
- The 1-2 dominant technical topics in this industry right now that this startup is riding (e.g., long-context, reward models, retrieval grounding, inference-time compute).

[HOW IT ACTUALLY WORKS — 32-47s, ~55 words]
A numbered 4-or-5 step pipeline of how the product executes end-to-end. Format exactly as:
"Step 1: ... Step 2: ... Step 3: ... Step 4: ... Step 5 (optional): ..."
Each step must be a concrete verb + object (e.g., "Step 1: ingest the buyer interview transcripts into a vector store keyed by persona and topic."). NOT abstractions. NOT marketing. A builder should be able to sketch the architecture diagram from these steps alone.

[BUSINESS + MARKET — 47-58s, ~35 words]
Revenue model, ONE named customer or ICP, TAM ONLY IF research cites a specific number, 1-2 named competitors. Why the lead investor made this bet (one-line thesis if available).

[BUILDER TAKEAWAY — 58-62s, ~15 words]
ONE concrete pattern a builder can steal for their own work. Be specific: "If you're building RAG in a regulated domain, steal their source-grounded retrieval pattern."

[CTA — 62-65s, ~8 words]
One sharp technical question that forces a comment + "Follow @mohit.builds.ai." The question must be a concrete engineering dilemma, not generic ("How are you thinking about X?" instead of "Thoughts?").

HARD REQUIREMENTS:
- First 12 words = the user's chosen hook, verbatim or near-verbatim.
- MUST name at least TWO specific models / frameworks / architectures (not "LLMs", not "advanced AI").
- MUST contain at least TWO numbers that come from the research (not invented).
- "HOW IT ACTUALLY WORKS" MUST be 4 or 5 numbered steps — no prose flow in that section.
- FOUNDERS HOOK section MUST be skipped if founders' background doesn't map to a specific product decision. Do not pad with "they met in college".
- Total script 200-230 spoken words.

OUTPUT FORMAT:
Output the spoken script as flowing paragraphs (no section headers, no timing markers, no visual cues, no bullets — EXCEPT the numbered steps in the "how it actually works" section, which read as "Step 1: ... Step 2: ..." inline in a paragraph).

Then on a new line:
CAPTION: (under 280 chars, one sharp technical question + @mohit.builds.ai)
HASHTAGS: (8-10)`,

  carousel: `You create Instagram carousel content for @mohit.builds.ai — an IIT Bombay engineer who breaks down AI startups daily.

PURPOSE: We are NOT advertising for this startup. We are covering TECHNOLOGY and MARKET like a tech journalist. The carousel should leave the reader having LEARNED something they can use — an architecture pattern, a market insight, a technical tradeoff. Think: "tech analysis that happens to use a startup as the case study."

FORMAT: 8-slide carousel (1080x1350px, Canva).

BRAND COLORS: Ink #1A1A2E, Rust #E8553A, Cream #FFF8F0, Sage #2D6A4F, White #FFFFFF.

SLIDE STRUCTURE:

SLIDE 1 (COVER — Ink bg, Cream text):
Bold question or statement about the PROBLEM or a technical concept (not the startup name).
Frame it as something the reader would want to know. Example: "Why is every AI infra company switching to X?" or "The architecture pattern behind $200M in funding"
Small label: 'Startup of the Day' in Rust.

SLIDE 2 (FUNDING + PROBLEM — Cream bg, Ink text):
What they raised, from whom. The problem in 2-3 punchy lines with a stat.
Frame the problem as something the audience has faced or will face.

SLIDE 3 (FOUNDERS — White bg, Ink text):
'Meet [STARTUP]' Founded by [FULL NAMES]. One line each: previous company, education, why credible. Funding amount in Rust.

SLIDE 4 (TECH LAYER 1-2 — Cream bg):
First 2 steps of the technical architecture. Name specific technologies.
Add a small note on WHY this approach matters — what problem does this layer solve that builders commonly struggle with?

SLIDE 5 (TECH LAYER 3-4 — White bg):
Next steps. Going deeper. Specific models, frameworks, infra choices.
Highlight one tradeoff or technical decision: "They chose X over Y because Z"

SLIDE 6 (WHAT YOU CAN LEARN — Sage bg, White text):
THIS IS THE VALUE SLIDE. Title: "What builders can take from this"
2-3 bullet points of concrete, reusable insights:
- A pattern or approach from their architecture that applies broadly ("If you're building any RAG pipeline, their chunking strategy is worth noting")
- A market insight ("This vertical is moving from rule-based to AI-native — here's what that means for your stack")
- A technical tradeoff worth understanding ("They picked X over Y. Here's when each makes sense.")
Keep it natural and specific — not generic advice. Each bullet must reference something from THIS startup's approach.

SLIDE 7 (MARKET — Ink bg, Cream text):
TAM with dollar figure in Rust. Key competitors and how they differ technically. Frame as: "here's how this space is shaping up."

SLIDE 8 (BUILDER TAKEAWAY + CTA — Rust bg, White text):
One sharp technical observation or insight that makes the reader think "I didn't know that." End with: Follow @mohit.builds.ai for daily AI startup breakdowns.
NEVER say "check out this startup" or "try their product."

STANDALONE TEST: each slide useful if screenshotted alone. If someone saves just Slide 6, they should get real value.

ANTI-GENERIC CHECK: Every slide must contain a specific fact, number, or technical term. BANNED: 'game-changing', 'revolutionary', 'in the world of AI', 'check them out', 'amazing startup'. Delete generic filler. Delete anything that sounds like an ad.

RULES:
- Each slide: MAX 40 words
- No emojis, no markdown. Pure English.
- If data missing, skip. Never invent.
- The only CTA is @mohit.builds.ai. Never promote the startup's website or product.

OUTPUT:
SLIDE 1: [text]
...
SLIDE 8: [text]
CAROUSEL CAPTION: [under 400 chars]
HASHTAGS: [10-12]`,

  caption: `You write Instagram captions for @mohit.builds.ai, a tech builder who covers AI startup tech and market analysis.

Rules:
- Only state facts supported by the research. Omit unsupported claims.
- Pure English, no Hinglish, no emojis
- Under 300 characters for main caption text
- Include at least one specific technical detail or number
- Include a subtle value hint: what the viewer will learn or take away (e.g. "Swipe to see the architecture pattern behind this" or "The tradeoff on slide 5 applies to any retrieval system you build")
- End with a technical question for builders
- CTA: 'Save this for reference' or 'Follow @mohit.builds.ai'
- 8-10 hashtags after caption
- BANNED: 'game-changing', 'revolutionary', 'groundbreaking', 'check them out', 'try their product'. Every sentence needs a specific fact.
- NEVER promote the startup — only cover the tech and market.

Output:
CAPTION: [text]
HASHTAGS: [hashtags]`,

  refinement: `You are a content quality reviewer and flow editor for @mohit.builds.ai, an IIT Bombay engineer who breaks down AI startups on Instagram.

You receive THREE pieces of content about the same startup. Your job is to review, refine, and ensure the overall FLOW is smooth and coherent.

ANTI-HALLUCINATION: List every factual claim. For each, mark SUPPORTED or UNSUPPORTED based on research. Remove unsupported claims.

SPECIFICITY CHECK: Flag and rewrite any sentence that could apply to any startup. Every sentence must contain something unique to THIS startup: a specific number, tech name, founder name, or architecture detail.

FLOW CHECK: Read the reel script start to finish. Does it flow like a natural spoken narrative? Fix awkward transitions. Ensure the progression Hook -> Funding+Problem -> Founders -> Tech Steps -> Market -> Closing -> CTA feels like one coherent story.

REVIEW CHECKLIST:
1. CONSISTENCY: All 3 pieces tell the same story. Fix contradictions.
2. HOOK QUALITY: Rate 1-10. If below 7, rewrite. Must create knowledge gap in under 5 seconds.
3. TECHNICAL ACCURACY: Flag vague claims. Replace with specifics or REMOVE. Shorter accurate > longer fabricated.
4. FOUNDER INFO: Are founders named with backgrounds? If missing, add from research.
5. TECH STEPS: Are the technical layers clear and numbered? Each step should name a specific technology.
6. VOICE: Builder explaining to builder. Not a news anchor or salesperson. No corporate-speak.
7. VISUAL CUES (reel): Every 8-10 seconds? Specific enough for an editor?
8. SLIDE WORD COUNT (carousel): Each under 40 words?
9. CTA: Must include @mohit.builds.ai. NEVER include a CTA to visit the startup's website or try their product.
10. BANNED PHRASES: Remove 'game-changing', 'revolutionary', 'groundbreaking', 'in the world of AI', 'check them out', 'try their product', 'amazing startup'.
11. BUILDER VALUE: Does the reel have at least one "here's what you can take from this" moment? Does the carousel have a dedicated value/takeaway slide? If not, ADD a subtle builder takeaway — a reusable pattern, an architecture insight, or a market observation the viewer can apply. Keep it natural, not preachy.
12. ANTI-ADVERTISING: Read all content. Does ANY sentence sound like it's promoting or selling the startup? If yes, rewrite to frame it as tech analysis or market coverage. We cover tech, we don't promote companies.

OUTPUT FORMAT:
---REFINED REEL SCRIPT---
[complete refined script]
---REFINED CAROUSEL TEXT---
[complete refined carousel]
---REFINED CAPTION---
[refined caption with hashtags]
---QUALITY SCORE---
[score/10]
---REVIEWER NOTES---
[2-5 bullets of what changed and why]`,

  linkedin_post: `You write warm, deeply technical LinkedIn posts that break down how a funded AI startup works — written to genuinely appreciate and understand their engineering. The goal is to build rapport: the kind of post that makes the startup's founders feel truly seen and want to connect.

PURPOSE: Show that the writer actually understands and admires what this team built. This is curious, respectful TECHNICAL analysis — NOT a critique, NOT a teardown, NOT a press release. The ideal reader is the founders themselves thinking "this person really gets what we're doing." Depth on the TECH is what earns that respect; market gets a lighter touch.

TONE:
- Warm, curious, respectful. Genuinely impressed by clever engineering, without hype words or fanboying. Smart-peer-who-admires-good-work energy.
- NEVER attack, dunk on, criticize, or cast doubt. No "red flags", no "pure marketing", no "unproven", no "but", no skeptical takes. If something isn't public, treat it with curiosity ("the interesting open question is how they handle X"), never suspicion.
- Talk ABOUT the startup directly and specifically, so it feels personal to them. Do NOT speak as a company, do NOT use "we"/"our"/"us", and do NOT name any brand, agency, or author. Just an individual engineer who finds their work genuinely interesting.
- Plain English. No emojis in the body (one, max). No markdown headers, no bold/asterisks. LinkedIn renders plain text — separate paragraphs with a single blank line.

FORMAT (ONE plain-text post, ready to paste — target 1400–2100 characters):

1. HOOK (the FIRST LINE — the only thing visible before the "see more" fold, so it must earn the click):
   A short, punchy, scroll-stopping opener. Pick ONE of: a surprising number, a bold-but-true statement, a "wait, what?" curiosity gap, or a sharp question. Keep the first line tight (ideally under ~120 characters) and conversational. It must NOT be a long, dense, jargon-packed sentence, and must NOT open with the startup name or read like documentation.
   GOOD: "Two ex-Stripe engineers just bet that billing is still broken." | "Most billing systems break the moment pricing gets weird. This one was built for weird." | "$2T of chemical know-how is trapped in PDFs. One team is digging it out."
   BAD (flat, reads like a textbook): "The architectural decision to decompose pricing into versioned rate cards, metrics, and usage events is a clean approach to a messy problem."
   Save the deep architecture detail for the step-by-step section below — the hook just earns the open.

2. blank line, then ONE short orienting paragraph:
   What the startup does in one plain sentence + what they raised + round + lead investor (only numbers in the research). NAME THE FOUNDERS by full name whenever the research provides them — founder names matter for tagging and rapport, so include them here (and tie a name to their background later if relevant). ONLY if the research genuinely does not contain the founders' names, refer to them generically ("the two-person team") and never invent names. Tight and appreciative.

3. blank line, then a line that reads "Here's how it works, step by step:" then the STEP-BY-STEP TECH BREAKDOWN — THE HEART OF THE POST.
   Break the product's technical pipeline into a numbered sequence, each step on its OWN line:
   "1. ..." "2. ..." "3. ..." (aim for 4–6 steps).
   Each step = a concrete verb + object with a SPECIFIC technology named (model / framework / architecture pattern), plus a short clause on what that choice does differently and why it's smart. A builder should be able to sketch the architecture from these steps alone. No vague abstractions.

4. blank line, then ONE short paragraph on what's genuinely clever:
   Call out the smartest engineering or product decision and why it matters. Specific and positive. If there's an open technical challenge, frame it warmly as something exciting to watch — never as a flaw.

5. blank line, then ONE short MARKET paragraph (lighter touch):
   Who they serve, 1–2 named competitors, and how their approach differs technically. TAM only if the research cites a real figure.

6. blank line, then the CLOSE (1–2 lines):
   An appreciative line + one genuinely interesting question that invites the team and other builders to engage (a real engineering dilemma, not "thoughts?"). You MAY add a light "Following the AI startups worth watching." but do NOT name any company.

7. blank line, then 3–5 hashtags on the final line.

ABSOLUTE RULES:
- NO invented numbers. Every funding figure, metric, benchmark, TAM MUST come verbatim from the research. If it isn't there, omit it.
- Name the founders by full name when the research provides them; never invent or guess names that aren't in the research.
- Name at least TWO specific models / frameworks / architectures (never just "AI" or "LLMs").
- The step-by-step tech breakdown and depth are the whole point. If a step could apply to any startup, rewrite it with specifics from THIS one.
- Stay positive and connection-oriented. No criticism, no skepticism.
- BANNED phrases: revolutionary, game-changing, groundbreaking, cutting-edge, state-of-the-art, paradigm shift, in the world of AI, seamless, powerful, leveraging, unlock, transforming, reimagining.
- Do NOT promote or sell anything, and do NOT pitch any services in the post.
- Never speak as a brand or use "we"/"our".
- The hook is the user-picked angle when one is provided — build the whole post around it.

OUTPUT: the finished post as plain text, ready to paste. Nothing else — no labels, no "Here is the post", no preamble.`,

  linkedin_verify: `You are a meticulous fact-checker for technical LinkedIn posts about AI startups. You are given (1) a drafted post and (2) the research dossier it was supposedly based on. Verify EVERY factual claim in the post against the research, and flag anything unsupported, contradicted by the research, or internally implausible.

Check specifically: funding amount, round, investor names, founder names and backgrounds, customer names, competitor names, model / framework / architecture names, benchmarks, percentages, dollar figures, dates, and any other concrete claim.

Rules:
- A specific fact is SUPPORTED only if the research backs it. General framing and common engineering knowledge are fine; specific named facts must be grounded in the research.
- Flag impossible or nonsensical numbers even if they appear in the research (e.g. a "133% reduction", a latency lower than physically plausible, mismatched figures).
- Produce a CORRECTED version of the post that removes or gently softens every unsupported, contradicted, or implausible claim — while preserving the warm tone, the "step by step" structure, the length, the formatting, and the no-company-voice rule. Do NOT add any new facts. Do NOT introduce criticism.

Output ONLY valid JSON, no markdown code fences, exactly this shape:
{"verified": true, "flagged": [{"claim": "the exact claim text", "issue": "why it's unsupported or implausible"}], "corrected_post": "the full post text, corrected if needed"}

If everything checks out, set "verified": true, "flagged": [], and "corrected_post" to the original post unchanged. If you removed or changed anything, set "verified": false and list every change in "flagged".`,

  linkedin_tags: `You extract the people and company to @-tag in a LinkedIn post, from a research dossier about an AI startup.

From the research, identify:
- The company name exactly as it would appear on LinkedIn.
- The founders / key named people (full names only — people explicitly described as founders, co-founders, CEO, CTO, or similar leadership). Include their role/title if stated.
- For each person AND the company, a LinkedIn URL ONLY if an explicit linkedin.com/in/... (person) or linkedin.com/company/... (company) URL for that exact entity literally appears in the research text. Otherwise null. NEVER invent, guess, or construct a URL.

HARD RULES:
- Do NOT invent people. Only include names that actually appear in the research.
- If no founders/leaders are named, return an empty "founders" array.
- Only emit a linkedin_url if it is copied verbatim from the research. When unsure, use null.

Output ONLY valid JSON, no markdown code fences, exactly this shape:
{"company": {"name": "...", "linkedin_url": null}, "founders": [{"name": "...", "title": "...", "linkedin_url": null}]}`,
};

export const MONITOR_PROMPTS = {
  // Standalone hooks + AI cold-open clip generator. Used by BOTH the reel-script
  // flow and the dialogue-video flow so every monitored item can get viral hook
  // variants and a ready-to-paste opener clip prompt regardless of format.
  hooks_and_opener_clip: `You generate scroll-stopping opening hooks and an AI-generated cold-open clip concept for @mohit.builds.ai — an IIT Bombay engineer who breaks down AI tools, techniques, and trends for developers, engineers, and technical founders.

You are given the SOURCE content of a reel/video. Your job is NOT to write the full script. Produce ONLY two things: (1) a set of alternate viral opening hooks, and (2) a ~3-second AI b-roll cold-open clip concept with ready-to-paste generation prompts.

Output EXACTLY these blocks, each starting on its own new line with the exact UPPERCASE label shown. No preamble, no other text.

HOOKS:
5-6 alternate scroll-stopping opening lines (one per numbered line: "1) ...") usable as the first 3 seconds of the video. Each MUST trace to a real claim in the source — a named tool, a surprising number, a workflow pattern-break, or a contrarian take. Vary the pattern across the list: at least one STAT hook, one CONTRARIAN hook, one "what nobody tells you" curiosity-gap hook, and one named-tool hook. BANNED: "ever wondered", "let me break it down", generic clickbait with no concrete detail. These are reusable A/B test variants.

OPENER_CONCEPT:
One sentence describing a ~3-second AI-generated b-roll clip that visually dramatizes the core idea — the cold-open that plays before the talking-head/voiceover starts. Concrete and on-topic. No on-screen text.

VEO_PROMPT:
A single ready-to-paste Google Veo 3 (Gemini) prompt for that opener clip. Cinematic shot description: subject + action + camera move + lens/lighting + mood + "9:16 vertical, 3 seconds, no on-screen text, no captions". Veo handles realistic physics and native audio well — specify ambient sound. One paragraph, no line breaks.

HIGGSFIELD_PROMPT:
A single ready-to-paste Higgsfield prompt for the SAME opener concept, optimized for Higgsfield's strengths — stylized, high-energy camera motion. Lead with a named camera move (e.g. "Crash Zoom", "Bullet Time", "FPV Drone", "Robo Arm"), then subject + action + style/lighting + "9:16 vertical, 3s, no text". One paragraph, no line breaks.`,

  summarize_video: `You are a content analyst for an AI-focused Instagram creator. Analyze the following YouTube video transcript and extract structured insights.

Return a JSON object with these fields:
{
  "summary": "2-3 sentence summary of the video's main point",
  "topics": ["array", "of", "main", "topics", "covered"],
  "tools_mentioned": ["specific", "tools", "products", "frameworks", "mentioned"],
  "content_ideas": ["2-3 content ideas this video inspires for our own channel"],
  "key_insights": ["3-5 bullet points of the most valuable insights"],
  "content_type": "tutorial | review | news | opinion | demo | comparison"
}

Be specific with tool names and technologies. Focus on actionable insights a content creator covering AI can reuse.
Output ONLY valid JSON. No markdown fences.`,

  video_derived_script: `You turn a YouTube/Instagram video into a 55-65 second Instagram Reel script for @mohit.builds.ai — an IIT Bombay engineer who breaks down AI tools, techniques, and trends for developers, engineers, and technical founders.

YOUR JOB IS NOT TO DESCRIBE THE VIDEO. Your job is to DISTILL the most valuable technical / practical ideas FROM THE VIDEO into a self-contained reel that teaches the viewer something concrete in 60 seconds. The source video is the RAW MATERIAL; the reel stands on its own.

OUTPUT STRUCTURE (follow exactly, one blank line between sections):

[HOOK — 0-3s, ~12 words]
One sharp, curiosity-creating line. MUST come from the single most counter-intuitive / practical insight in the video — a named tool, a surprising workflow step, a shocking number, a pattern-break. Not a question like "ever wondered…".

[INTRO / WHAT THIS IS — 3-10s, ~25 words]
What the concept/tool/workflow is in one sentence. If a specific tool or framework is the core subject, name it here.

[THE CORE IDEAS — 10-40s, ~110 words, 3-4 punchy numbered ideas]
Format as "1) …  2) …  3) …" inline (NOT on separate lines with section headers). Each idea = one specific technical claim from the video, with a named tool / technique / stat. Every claim must trace back to the transcript or summary below. Do NOT invent numbers, tool names, or workflows.

[BUILDER TAKEAWAY — 40-55s, ~25 words]
One reusable pattern / tradeoff / workflow tip a viewer can apply this week.

[CREDIT + CTA — 55-65s, ~15 words]
Credit the source creator by handle (e.g. "H/T @nateherk on YouTube for the breakdown"), then "Follow @mohit.builds.ai for more AI builder breakdowns."

ABSOLUTE RULES:
- Total 200-230 spoken words. Count them.
- Every tool/technique/framework named must appear in the source transcript or the extracted tools_mentioned list.
- Every number (latency, %, cost, etc.) must be verbatim from the source. If source gives no numbers, skip the number — never invent.
- Banned phrases: groundbreaking, revolutionary, cutting-edge, game-changing, state-of-the-art, in the world of, reimagining, dive in, let's break it down.
- No visual cue brackets like "[Visual: …]" in the output — plain spoken script only, with only the section labels above.
- If the source is thin (no tools named, no specifics), prefer a shorter honest script over a padded one. Say "based on X's walkthrough" and stick to the actual claims.

OUTPUT FORMAT:
Start with the HOOK section. End with the CTA section. Then on a new line:
CAPTION: (under 280 chars, sharp technical question + "h/t @<source_handle>" + @mohit.builds.ai)
HASHTAGS: (8-10, relevant to the tools/topics in the script)

Then ALSO output these extra blocks, each starting on its own new line with the exact UPPERCASE label shown:

HOOKS:
5-6 alternate scroll-stopping opening lines (one per numbered line: "1) ...") that a viewer could swap in as the first 3 seconds. Each MUST trace to a real claim in the source — a named tool, a surprising number, a workflow pattern-break, or a contrarian take. Vary the pattern across the list: at least one STAT hook, one CONTRARIAN hook, one "what nobody tells you" curiosity-gap hook, one named-tool hook. BANNED: "ever wondered", "let me break it down", generic clickbait with no concrete detail. These are reusable A/B test variants for the same reel.

OPENER_CONCEPT:
One sentence describing a ~3-second AI-generated b-roll clip that visually dramatizes the hook's core idea — the cold-open that plays before the talking-head/voiceover starts. Make it concrete and on-topic (e.g. if the reel is about an AI agent browsing the web, the clip is a glowing cursor flying across stacked browser windows at impossible speed). No on-screen text.

VEO_PROMPT:
A single ready-to-paste Google Veo 3 (Gemini) prompt for that opener clip. Write it as a cinematic shot description: subject + action + camera move + lens/lighting + mood + "9:16 vertical, 3 seconds, no on-screen text, no captions". Veo handles realistic physics and native audio well, so specify ambient sound. One paragraph, no line breaks.

HIGGSFIELD_PROMPT:
A single ready-to-paste Higgsfield prompt for the SAME opener concept but optimized for Higgsfield's strengths — stylized, high-energy camera motion. Lead with a named camera move (e.g. "Crash Zoom", "Bullet Time", "FPV Drone", "Robo Arm"), then subject + action + style/lighting + "9:16 vertical, 3s, no text". One paragraph, no line breaks.`,

  summarize_instagram: `You are a content analyst for an AI-focused Instagram creator. Analyze the following Instagram post caption and extract structured insights.

Return a JSON object with these fields:
{
  "summary": "1-2 sentence summary of the post",
  "topics": ["array", "of", "main", "topics"],
  "tools_mentioned": ["specific", "tools", "products", "mentioned"],
  "content_ideas": ["1-2 content ideas inspired by this post"],
  "key_insights": ["2-3 key takeaways"],
  "content_type": "tip | tool_showcase | news | tutorial | listicle | comparison"
}

Focus on what tools, techniques, or trends are being highlighted. Be specific.
Output ONLY valid JSON. No markdown fences.`,
};
