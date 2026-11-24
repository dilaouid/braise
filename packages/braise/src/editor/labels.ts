/** Les mots de la page de l'éditeur pour les identifiants du contenu (outil de développement : pas dans fr.json). */

const FACES: Record<string, string> = {
  neutral: 'neutre', think: 'pensif', surprised: 'surpris', shocked: 'choqué', laugh: 'rieur', awkward: 'gêné',
  sad: 'triste', resolute: 'résolu', smug: 'narquois', serious: 'sérieux', closed: 'yeux fermés',
};
const POSES: Record<string, string> = {
  startle: 'sursaut', think: 'pensif', laugh: 'rire', groom: 'toilette', scratch: 'se gratte', rise: 'se lève',
};
const EMOTES: Record<string, string> = {
  exclaim: '« ! »', question: '« ? »', dots: '« … »', drop: 'goutte', note: 'note',
};

export const faceLabel = (id: string): string => FACES[id] ?? id;
export const poseLabel = (id: string): string => (id ? (POSES[id] ?? id) : 'aucune');
export const emoteLabel = (id: string): string => (id ? (EMOTES[id] ?? id) : 'aucune');
export const whoLabel = (who: 'moon' | 'cream' | null): string => (who === 'moon' ? 'Moon' : who === 'cream' ? 'Cream' : 'Silence');
