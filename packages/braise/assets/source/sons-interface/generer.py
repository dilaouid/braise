"""
Génère les trois sons d'interface qui servent à la Lanterne et aux menus :
sfx-ui-move, sfx-ui-confirm, sfx-refuse.

Les versions générées par PixelLab étaient du bruit large bande (0,46 s à plein volume pour le « tic »
de déplacement), ce qui sonnait glitché et violent à chaque mouvement du curseur. Ici ce sont de
simples notes de sinus, courtes, à attaque douce et à décroissance exponentielle, sans aléa :
le résultat est identique à chaque exécution.

Usage (depuis packages/braise) :  python assets/source/sons-interface/generer.py
Demande numpy et ffmpeg (libvorbis) dans le PATH.
"""
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 44100
SORTIE = Path(__file__).resolve().parents[3] / 'public' / 'audio'


def note(freq: float, dur: float, amp: float, attaque: float = 0.004, decroit: float = 5.0, harm: float = 0.18) -> np.ndarray:
    """Une note de sinus avec un soupçon de seconde harmonique, enveloppe douce."""
    t = np.arange(int(SR * dur)) / SR
    onde = np.sin(2 * np.pi * freq * t) + harm * np.sin(2 * np.pi * 2 * freq * t)
    env = np.minimum(1.0, t / attaque) * np.exp(-decroit * t / dur)
    sortie = amp * onde * env / (1 + harm)
    # Fondu de 6 ms en fin de note : jamais de coupure sèche, donc jamais de « clic ».
    n = int(SR * 0.006)
    sortie[-n:] *= np.linspace(1, 0, n)
    return sortie


def silence(dur: float) -> np.ndarray:
    return np.zeros(int(SR * dur))


def ecrire(nom: str, onde: np.ndarray) -> None:
    pic = float(np.abs(onde).max())
    assert pic <= 0.8, f'{nom} sature ({pic:.2f})'
    pcm = (onde * 32767).astype('<i2')
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / f'{nom}.wav'
        with wave.open(str(wav), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        cible = SORTIE / f'{nom}.ogg'
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-ac', '1', '-c:a', 'libvorbis', '-q:a', '4', str(cible)],
            check=True,
        )
    print(f'{nom}: {len(onde) / SR * 1000:.0f} ms, pic {pic:.2f}')


if __name__ == '__main__':
    # Déplacement du curseur : un petit « tic » clair de 45 ms.
    ecrire('sfx-ui-move', note(740, 0.045, 0.45, decroit=6.0))
    # Validation : deux notes qui montent, une quinte, comme une petite clochette.
    ecrire('sfx-ui-confirm', np.concatenate([note(587, 0.07, 0.5, decroit=4.0), note(880, 0.16, 0.5, decroit=5.0)]))
    # Refus : deux pulsations graves et douces, qui descendent.
    ecrire('sfx-refuse', np.concatenate([note(185, 0.075, 0.55, decroit=3.0, harm=0.5), silence(0.03), note(147, 0.1, 0.55, decroit=3.5, harm=0.5)]))
