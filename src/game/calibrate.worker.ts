/// <reference lib="webworker" />
import type { Field } from './outcome'
import { CALIBRATION_LINES } from './economy'
import { calibratePoint } from './calibrate'

/** Калибровка масштаба выплат в фоне: по каждой точке CALIBRATION_LINES шлёт { id, lines, scale }. */
self.onmessage = (e: MessageEvent<{ id: number; field: Field; spins: number }>) => {
  const { id, field, spins } = e.data
  for (const lines of CALIBRATION_LINES) self.postMessage({ id, lines, scale: calibratePoint(field, lines, lines <= 4 ? spins * 4 : spins) })
}
