"""
Génère les sons d'interface : sfx-ui-move, sfx-ui-confirm, sfx-ui-back, sfx-refuse, sfx-ui-ember.

Les versions PixelLab étaient du bruit large bande (0,46 s à plein volume pour le « tic » de déplacement, un
claquement aigu pour la validation) : elles sonnaient grésillantes à chaque mouvement du curseur. Ici, des notes de
lamelle (une fondamentale et un partiel inharmonique qui s'éteint vite, comme un kalimba ou un xylophone de bois),
à attaque douce, passées dans un filtre passe-bas : presque toute l'énergie reste sous 3 kHz. Sans aléa, le résultat
est identique à chaque exécution.

Le script écrit la source WAV dans assets/source/audio/ et l'OGG dans public/audio/. tools/build-audio.mjs ne
normalise pas ces sons (ils sont déjà à niveau ; loudnorm déforme un son de quelques dizaines de millisecondes), et
ils ne sont plus dans assets/pixellab.json : un `pnpm assets` ne ramène plus les anciens.

Usage (depuis packages/braise) :  python assets/source/sons-interface/generer.py
Demande numpy et ffmpeg (libvorbis) dans le PATH.
"""
import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100
PKG = Path(__file__).resolve().parents[3]
SOURCE = PKG / 'assets' / 'source' / 'audio'
SORTIE = PKG / 'public' / 'audio'


def lamelle(freq: float, dur: float, amp: float, decroit: float = 6.0, partiel: float = 0.35, glisse: float = 0.0) -> np.ndarray:
    """
    Une note de lamelle : la fondamentale, une octave discrète, et un partiel à 2,76 fois la fréquence qui
    s'éteint quatre fois plus vite (l'attaque boisée). `glisse` : la hauteur part un peu plus haut et se pose.
    """
    t = np.arange(int(SR * dur)) / SR
    f = freq * (1 + glisse * np.exp(-t / 0.012))
    phase = 2 * np.pi * np.cumsum(f) / SR
    env = np.exp(-decroit * t / dur)
    onde = np.sin(phase) * env
    onde += 0.12 * np.sin(2 * phase) * env ** 1.5
    onde += partiel * np.sin(2.76 * phase) * env ** 4
    attaque = np.minimum(1.0, t / 0.003)
    sortie = amp * onde * attaque / (1 + 0.12 + partiel)
    # Fondu de 8 ms en fin de note : jamais de coupure sèche, donc jamais de « clic ».
    n = int(SR * 0.008)
    sortie[-n:] *= np.linspace(1, 0, n)
    return sortie


def bourdon(freq: float, dur: float, amp: float) -> np.ndarray:
    """Un souffle grave et rond qui monte puis s'éteint : la chaleur sous une note."""
    t = np.arange(int(SR * dur)) / SR
    env = np.sin(np.pi * np.minimum(1.0, t / dur)) ** 2
    return amp * env * (np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * 2 * freq * t)) / 1.3


def placer(base: np.ndarray, note: np.ndarray, debut: float) -> np.ndarray:
    i = int(SR * debut)
    fin = max(len(base), i + len(note))
    out = np.zeros(fin)
    out[: len(base)] += base
    out[i : i + len(note)] += note
    return out


def passe_bas(x: np.ndarray, coupure: float) -> np.ndarray:
    """Un filtre passe-bas à deux pôles (deux passes d'un pôle) : adoucit l'attaque sans la noyer."""
    a = np.exp(-2 * np.pi * coupure / SR)
    for _ in range(2):
        y = np.empty_like(x)
        acc = 0.0
        for i, v in enumerate(x):
            acc = (1 - a) * v + a * acc
            y[i] = acc
        x = y
    return x


def ecrire(nom: str, onde: np.ndarray, coupure: float = 4500, niveau: float = 0.6) -> None:
    """Filtre, ramène le pic à `niveau` (les effets du jeu sont à peu près à ce niveau), écrit le WAV et l'OGG."""
    onde = passe_bas(onde, coupure)
    onde *= niveau / float(np.abs(onde).max())
    pic = float(np.abs(onde).max())
    assert pic <= 0.8, f'{nom} sature ({pic:.2f})'
    pcm = (onde * 32767).astype('<i2')
    wav = SOURCE / f'{nom}.wav'
    with wave.open(str(wav), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    cible = SORTIE / f'{nom}.ogg'
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-ac', '1', '-c:a', 'libvorbis', '-q:a', '6', str(cible)],
        check=True,
    )
    spectre = np.abs(np.fft.rfft(onde)) ** 2
    aigu = spectre[np.fft.rfftfreq(len(onde), 1 / SR) > 3000].sum() / spectre.sum()
    print(f'{nom}: {len(onde) / SR * 1000:.0f} ms, pic {pic:.2f}, énergie au-dessus de 3 kHz {aigu:.1%}')


# Ré majeur, la tonalité de la boîte à musique du refuge.
D4, E4, FS4, A4, D5, FS5, A5, D6 = 293.66, 329.63, 369.99, 440.0, 587.33, 739.99, 880.0, 1174.66

if __name__ == '__main__':
    # Déplacement du curseur : un petit « toc » de bois, 70 ms.
    ecrire('sfx-ui-move', lamelle(A5, 0.07, 0.42, decroit=7.0, partiel=0.25, glisse=0.04), coupure=3800, niveau=0.5)
    # Validation : deux lamelles qui montent d'une quinte, la seconde qui sonne un peu.
    ok = lamelle(D5, 0.12, 0.42, decroit=5.0)
    ok = placer(ok, lamelle(A5, 0.32, 0.42, decroit=6.0), 0.055)
    ecrire('sfx-ui-confirm', ok)
    # Retour : la même figure à l'envers, plus grave et plus courte.
    back = lamelle(A4, 0.09, 0.42, decroit=5.0, partiel=0.2)
    back = placer(back, lamelle(D4, 0.2, 0.4, decroit=6.5, partiel=0.2), 0.05)
    ecrire('sfx-ui-back', back, coupure=3000)
    # Refus : deux coups sourds et graves qui descendent.
    non = lamelle(185.0, 0.09, 0.55, decroit=4.0, partiel=0.15)
    non = placer(non, lamelle(147.0, 0.14, 0.55, decroit=4.5, partiel=0.15), 0.11)
    ecrire('sfx-refuse', non, coupure=2200)
    # Une braise placée dans l'arbre : un arpège qui monte (ré, fa dièse, la, ré) sur un souffle chaud.
    braise = bourdon(D4 / 2, 0.45, 0.16)
    for k, f in enumerate((D5, FS5, A5, D6)):
        braise = placer(braise, lamelle(f, 0.4 if k == 3 else 0.18, 0.3 if k < 3 else 0.34, decroit=6.0, partiel=0.3), 0.045 * k)
    ecrire('sfx-ui-ember', braise)
