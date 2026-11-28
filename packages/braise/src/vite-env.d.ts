/// <reference types="vite/client" />

// PixiJS fournit ce module pour ses effets de bord, sans déclarations.
declare module 'pixi.js/unsafe-eval' {}

/** Le commit du jeu (voir vite.config.ts). */
declare const __BRAISE_BUILD__: string;
