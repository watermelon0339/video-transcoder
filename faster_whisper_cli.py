# ############################################
#
# faster_whisper command line integration
# enables faster transcription than the base
# whisper python package
#
# ############################################
import sys
import os
import traceback
from faster_whisper import WhisperModel
from datetime import timedelta

# Function to convert time in seconds to SRT format (HH:MM:SS,mmm)
def format_timestamp(seconds):
    td = timedelta(seconds=seconds)

    total_seconds = int(td.total_seconds())
    milliseconds = td.microseconds // 1000

    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"

def main():
    if len(sys.argv) < 4:
        print("Usage: python transcribe_fast.py <audio_path> <output_dir> <model_size> [device]")
        sys.exit(1)

    audio_path = sys.argv[1].strip('\"')
    output_dir = sys.argv[2].strip('\"')
    model_size = sys.argv[3]
    device = sys.argv[4] if len(sys.argv) > 4 else "cpu"

    print(f"faster_whisper device: {device}")

    # NOTE:
    # device="cuda" 适合 NVIDIA 显卡的电脑
    # device="cpu" 适合没有 GPU 的 Windows/Linux 电脑，以及 macOS 电脑
    model, resolved_device, resolved_compute_type = load_whisper_model(model_size, device)
    print(
        f"faster_whisper initialized with device={resolved_device}, compute_type={resolved_compute_type}"
    )

    # The result is a generator of segments
    segments, info = model.transcribe(
        audio_path,
        language="zh",
        word_timestamps=False
    )

    # --- Output Preparation ---

    # 1. Ensure the output directory exists
    os.makedirs(output_dir, exist_ok=True)

    srt_output_path = os.path.join(output_dir, "zh.srt")
    txt_output_path = os.path.join(output_dir, "zh.txt")

    # Initialize a list to hold all text for the TXT file
    full_transcript_text = []

    # --- SRT & TXT Generation Loop ---

    subtitle_index = 1

    with open(srt_output_path, "w", encoding="utf-8") as srt_file:
        for segment in segments:
            text = segment.text.strip()
            start_time = format_timestamp(segment.start)
            end_time = format_timestamp(segment.end)

            # 1. SRT FILE CONTENT
            srt_file.write(f"{subtitle_index}\n")
            srt_file.write(f"{start_time} --> {end_time}\n")
            srt_file.write(f"{text}\n")
            srt_file.write("\n")

            # 2. TXT FILE CONTENT (Append text to the list)
            full_transcript_text.append(text)

            subtitle_index += 1

    # --- Final TXT File Write ---

    # Join all segments with a space and write to the TXT file
    final_text = " ".join(full_transcript_text)

    with open(txt_output_path, "w", encoding="utf-8") as txt_file:
        txt_file.write(final_text)

    print(f"Transcription complete. SRT saved to {srt_output_path} and TXT saved to {txt_output_path}")


def load_whisper_model(model_size, requested_device):
    if requested_device == "cuda":
        attempts = [
            ("cuda", "float16"),
            ("cuda", "int8_float16"),
            ("cuda", "int8"),
            ("cpu", "int8"),
        ]
    else:
        attempts = [(requested_device, "int8")]

    last_error = None

    for current_device, compute_type in attempts:
        try:
            print(
                f"Initializing faster_whisper with device={current_device}, compute_type={compute_type}"
            )
            model = WhisperModel(model_size, device=current_device, compute_type=compute_type)
            return model, current_device, compute_type
        except Exception as error:
            last_error = error
            print(
                f"Failed to initialize faster_whisper with device={current_device}, compute_type={compute_type}: {error}",
                file=sys.stderr,
            )

    raise last_error


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Unhandled transcription error:", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
