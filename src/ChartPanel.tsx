import React, { useEffect, useRef } from 'react'
import { createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts'

export type Candle = {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
}

export default function ChartPanel({ candles }: { candles: Candle[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!hostRef.current) return

    const el = hostRef.current
    el.innerHTML = ''

    const chart = createChart(el, {
      layout: {
        background: { color: 'transparent' },
        textColor: 'rgba(226,232,240,0.9)',
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.12)' },
        horzLines: { color: 'rgba(148,163,184,0.12)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148,163,184,0.2)',
      },
      timeScale: {
        borderColor: 'rgba(148,163,184,0.2)',
      },
      crosshair: {
        vertLine: { color: 'rgba(148,163,184,0.25)' },
        horzLine: { color: 'rgba(148,163,184,0.25)' },
      },
      width: el.clientWidth,
      height: el.clientHeight,
    })

    const series = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      borderVisible: false,
    })

    series.setData(candles)
    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight })
    })
    ro.observe(el)

    chartRef.current = chart

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [candles])

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
}
