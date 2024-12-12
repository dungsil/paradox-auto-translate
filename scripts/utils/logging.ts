import { createConsola, LogLevels } from 'consola'

const log = createConsola({
  fancy: true,
  level: LogLevels.debug,
})

export { log }
