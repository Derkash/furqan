'use client';

interface BlurOverlayProps {
  isActive: boolean;
}

/**
 * Overlay de flou appliqué pendant l'état "listening"
 * Empêche totalement la lecture du texte pendant l'écoute audio
 */
export default function BlurOverlay({ isActive }: BlurOverlayProps) {
  if (!isActive) return null;

  return (
    <div
      className="absolute inset-0 z-[15] pointer-events-none transition-opacity duration-300"
      style={{
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)', // Safari
        background: 'rgba(253, 250, 243, 0.7)',
      }}
    />
  );
}
