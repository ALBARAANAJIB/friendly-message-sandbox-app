# File: backend/scripts/script.py
import sys
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled

def build_text_from_entries(entries):
    texts = []
    for entry in entries:
        if isinstance(entry, dict):
            texts.append(entry.get('text', ''))
        else:
            # objects like FetchedTranscriptSnippet — use .text if present
            texts.append(getattr(entry, 'text', ''))
    return " ".join([t for t in texts if t]).strip()

def debug_print(msg):
    print(msg, file=sys.stderr, flush=True)

def get_transcript(video_id, preferred_lang='en'):
    try:
        # Quick path: get_transcript (often returns plain dict entries)
        try:
            debug_print(f"Attempting get_transcript with languages: [{preferred_lang}, 'en']")
            transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=[preferred_lang, 'en'])
            debug_print(f"get_transcript returned {len(transcript)} entries (type: {type(transcript)})")
            full_text = build_text_from_entries(transcript)
            if full_text:
                print(full_text, flush=True)
                debug_print("TRANSCRIPT_OK: fetched via get_transcript")
                return full_text
            else:
                debug_print("get_transcript returned entries but text was empty.")
        except Exception as e:
            debug_print(f"get_transcript failed: {repr(e)}")

        # Fallback path: list_transcripts + find/fetch
        debug_print("FALLBACK: using list_transcripts and explicit fetch attempts.")
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        # Show some metadata about available transcripts
        available = []
        for t in transcript_list:
            lang = getattr(t, 'language', None) or getattr(t, 'language_code', None)
            # is_generated attribute may or may not exist depending on library version
            generated = getattr(t, 'is_generated', None)
            available.append({"type": type(t).__name__, "lang": lang, "generated": generated})
        debug_print(f"Available transcripts (sample): {available[:10]}")

        found_transcript = None
        try:
            found_transcript = transcript_list.find_transcript([preferred_lang])
            debug_print(f"Found manual transcript for {preferred_lang}: {type(found_transcript).__name__}")
        except NoTranscriptFound:
            try:
                found_transcript = transcript_list.find_generated_transcript([preferred_lang])
                debug_print(f"Found generated transcript for {preferred_lang}: {type(found_transcript).__name__}")
            except NoTranscriptFound:
                debug_print(f"No transcript for preferred lang '{preferred_lang}' (manual/generated).")

        if not found_transcript:
            try:
                found_transcript = transcript_list.find_transcript(['en'])
                debug_print("Found manual transcript for 'en'.")
            except NoTranscriptFound:
                try:
                    found_transcript = transcript_list.find_generated_transcript(['en'])
                    debug_print("Found generated transcript for 'en'.")
                except NoTranscriptFound:
                    debug_print("No English transcript (manual/generated) found.")

        if not found_transcript:
            found_transcript = next(iter(transcript_list), None)
            debug_print(f"Using first available transcript object as last resort: {type(found_transcript).__name__ if found_transcript else None}")

        if not found_transcript:
            raise NoTranscriptFound("No transcripts available at all for this video (fallback failed).")

        full_transcript_data = found_transcript.fetch()
        debug_print(f"fetched {len(full_transcript_data)} transcript entries (types: {[type(x).__name__ for x in full_transcript_data[:5]]})")

        # show short reprs for debugging (first 3)
        for i, sample in enumerate(full_transcript_data[:3]):
            try:
                debug_print(f"sample[{i}]: repr={repr(sample)}")
            except Exception:
                debug_print(f"sample[{i}]: type={type(sample).__name__}")

        full_text = build_text_from_entries(full_transcript_data)
        if full_text:
            print(full_text, flush=True)
            debug_print("TRANSCRIPT_OK: fetched via list_transcripts fallback")
            return full_text
        else:
            debug_print("EMPTY_TRANSCRIPT")
            sys.exit(1)

    except (NoTranscriptFound, TranscriptsDisabled) as e:
        debug_print(f"Error: Could not retrieve a transcript for video ID {video_id}. Reason: {repr(e)}")
        sys.exit(1)
    except Exception as e:
        debug_print(f"An unexpected error occurred for video ID {video_id}: {repr(e)}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python script.py <video_id> [language_code]", file=sys.stderr)
        sys.exit(1)
    video_id = sys.argv[1]
    language_code = sys.argv[2] if len(sys.argv) > 2 else 'en'
    get_transcript(video_id, language_code)
