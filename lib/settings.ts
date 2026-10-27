import { getSettings } from "./db";
import { DEFAULT_API_KEYS, BRAND, X_TRACKED_ACCOUNTS } from "@/config/api-keys";

export async function getActiveSettings() {
  try {
    const data = await getSettings();

    return {
      perplexity_api_key:
        data?.perplexity_api_key || DEFAULT_API_KEYS.perplexity_api_key,
      openai_api_key:
        data?.openai_api_key || DEFAULT_API_KEYS.openai_api_key,
      elevenlabs_api_key: DEFAULT_API_KEYS.elevenlabs_api_key,
      apify_api_key:
        data?.apify_api_key || DEFAULT_API_KEYS.apify_api_key,
      youtube_api_key:
        data?.youtube_api_key || DEFAULT_API_KEYS.youtube_api_key,
      instagram_handle:
        data?.instagram_handle || BRAND.instagram_handle,
      creator_name: data?.creator_name || BRAND.creator_name,
      creator_bio: data?.creator_bio || BRAND.creator_bio,
      x_tracked_accounts:
        data?.x_tracked_accounts || X_TRACKED_ACCOUNTS,
      content_tone:
        data?.content_tone ||
        "Builder explaining architecture to a smart friend. Confident, not salesy.",
    };
  } catch {
    return {
      perplexity_api_key: DEFAULT_API_KEYS.perplexity_api_key,
      openai_api_key: DEFAULT_API_KEYS.openai_api_key,
      elevenlabs_api_key: DEFAULT_API_KEYS.elevenlabs_api_key,
      apify_api_key: DEFAULT_API_KEYS.apify_api_key,
      youtube_api_key: DEFAULT_API_KEYS.youtube_api_key,
      instagram_handle: BRAND.instagram_handle,
      creator_name: BRAND.creator_name,
      creator_bio: BRAND.creator_bio,
      x_tracked_accounts: X_TRACKED_ACCOUNTS,
      content_tone:
        "Builder explaining architecture to a smart friend. Confident, not salesy.",
    };
  }
}
