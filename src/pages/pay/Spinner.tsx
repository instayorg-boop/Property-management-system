/** iOS-style 12-blade activity indicator — each blade fades in turn rather than the whole ring rotating. */
export default function Spinner({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  const blades = Array.from({ length: 12 });
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {blades.map((_, i) => (
        <rect
          key={i}
          x="14.5"
          y="3"
          width="3"
          height="9"
          rx="1.5"
          fill={color}
          className="spinner-blade"
          style={{
            transform: `rotate(${i * 30}deg)`,
            transformOrigin: "16px 16px",
            animationDelay: `${(i * (1000 / 12) - 1000) / 1000}s`,
          }}
        />
      ))}
    </svg>
  );
}
