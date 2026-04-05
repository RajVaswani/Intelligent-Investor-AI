import { getScoreColor } from "@/lib/stockData";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "lg";
}

export function ScoreBadge({ score, size = "sm" }: ScoreBadgeProps) {
  const colorClass = getScoreColor(score);
  const sizeClasses = size === "lg" ? "h-16 w-16 text-xl" : "h-10 w-10 text-sm";

  return (
    <div
      className={`flex items-center justify-center rounded-full border-2 font-bold ${sizeClasses} ${
        score >= 70
          ? "border-gain/30 bg-gain/10"
          : score >= 40
          ? "border-warning/30 bg-warning/10"
          : "border-loss/30 bg-loss/10"
      } ${colorClass}`}
    >
      {score}
    </div>
  );
}
