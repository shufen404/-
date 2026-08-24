from pathlib import Path
import wave

import numpy as np
from scipy import signal


ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "assets" / "audio"
REFERENCE = AUDIO / "mama.wav"
OUTPUT = AUDIO / "moo.wav"


def read_wav(path: Path) -> tuple[int, np.ndarray]:
    with wave.open(str(path), "rb") as source:
        rate = source.getframerate()
        channels = source.getnchannels()
        samples = np.frombuffer(source.readframes(source.getnframes()), dtype=np.int16)
    samples = samples.reshape(-1, channels).mean(axis=1).astype(np.float64) / 32768
    return rate, samples


def write_wav(path: Path, rate: int, samples: np.ndarray) -> None:
    peak = max(1e-9, float(np.max(np.abs(samples))))
    pcm = np.int16(np.clip(samples / peak * 0.88, -1, 1) * 32767)
    with wave.open(str(path), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(pcm.tobytes())


def voiced_region(samples: np.ndarray, rate: int) -> np.ndarray:
    frame = int(rate * 0.03)
    energy = np.convolve(samples * samples, np.ones(frame) / frame, mode="same")
    threshold = np.percentile(energy, 68)
    centers = np.flatnonzero(energy > threshold)
    if not len(centers):
        raise RuntimeError("No voiced region found in reference")
    center = centers[len(centers) // 2]
    radius = int(rate * 0.42)
    return samples[max(0, center - radius):min(len(samples), center + radius)]


def estimate_pitch(samples: np.ndarray, rate: int) -> float:
    samples = signal.detrend(samples) * signal.windows.hann(len(samples))
    correlation = signal.correlate(samples, samples, mode="full", method="fft")[len(samples)-1:]
    low = int(rate / 260)
    high = int(rate / 70)
    lag = low + int(np.argmax(correlation[low:high]))
    return float(np.clip(rate / lag, 78, 210))


def resonator(samples: np.ndarray, rate: int, frequency: float, bandwidth: float) -> np.ndarray:
    radius = np.exp(-np.pi * bandwidth / rate)
    angle = 2 * np.pi * frequency / rate
    denominator = [1, -2 * radius * np.cos(angle), radius * radius]
    return signal.lfilter([1 - radius], denominator, samples)


def clone_moo(reference: np.ndarray, rate: int) -> np.ndarray:
    voice = voiced_region(reference, rate)
    base_pitch = estimate_pitch(voice, rate)
    duration = 1.35
    count = int(rate * duration)
    time = np.arange(count) / rate

    # Preserve the character's pulse irregularity and breath texture from the source voice.
    analytic = signal.hilbert(voice)
    source_envelope = np.abs(analytic)
    source_envelope /= max(1e-9, source_envelope.max())
    source_envelope = signal.resample(source_envelope, count)
    rng = np.random.default_rng(20260819)
    jitter = signal.lfilter([1], [1, -0.996], rng.normal(0, 1, count))
    jitter /= max(1e-9, np.max(np.abs(jitter)))

    pitch = base_pitch * (0.91 - 0.14 * time / duration)
    pitch *= 1 + 0.012 * np.sin(2 * np.pi * 5.1 * time) + 0.006 * jitter
    phase = np.cumsum(2 * np.pi * pitch / rate)
    glottal = sum((1 / harmonic ** 1.15) * np.sin(harmonic * phase) for harmonic in range(1, 14))
    breath = signal.lfilter([1, -1], [1], rng.normal(0, 1, count))
    source = glottal + 0.055 * breath

    # Mandarin "mou": close lips first, then open into a rounded /ou/ vowel.
    nasal = resonator(source, rate, 250, 95)
    vowel = resonator(source, rate, 390, 100)
    vowel += 0.55 * resonator(source, rate, 760, 130)
    vowel += 0.20 * resonator(source, rate, 2380, 190)
    transition = np.clip((time - 0.16) / 0.20, 0, 1)
    output = (1 - transition) * nasal + transition * vowel

    attack = np.sin(np.clip(time / 0.10, 0, 1) * np.pi / 2) ** 2
    release = np.sin(np.clip((duration - time) / 0.34, 0, 1) * np.pi / 2) ** 2
    phrase = 0.80 + 0.20 * source_envelope
    output *= attack * release * phrase
    output = signal.lfilter(*signal.butter(2, [70, 8500], btype="bandpass", fs=rate), output)
    return output


def main() -> None:
    rate, reference = read_wav(REFERENCE)
    output = clone_moo(reference, rate)
    write_wav(OUTPUT, rate, output)
    print(f"reference_pitch_hz={estimate_pitch(voiced_region(reference, rate), rate):.1f}")
    print(OUTPUT)


if __name__ == "__main__":
    main()
