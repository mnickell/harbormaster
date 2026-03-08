interface SparklineProps {
  data: number[]
}

export function Sparkline({ data }: SparklineProps) {
  if (!data || data.length === 0) return null

  const max = Math.max(...data, 1)

  return (
    <div className="sparkline">
      {data.map((value, i) => {
        const pct = Math.max(5, (value / max) * 100)
        return (
          <div
            key={i}
            className="sparkline-bar"
            style={{ height: `${pct}%` }}
          />
        )
      })}
    </div>
  )
}
