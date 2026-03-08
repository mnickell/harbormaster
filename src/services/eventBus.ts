import { EventEmitter } from 'events'

const key = '__harbormaster_eventBus__'

if (!(globalThis as Record<string, unknown>)[key]) {
  const bus = new EventEmitter()
  bus.setMaxListeners(50)
  ;(globalThis as Record<string, unknown>)[key] = bus
}

const eventBus = (globalThis as Record<string, unknown>)[key] as EventEmitter
export default eventBus
