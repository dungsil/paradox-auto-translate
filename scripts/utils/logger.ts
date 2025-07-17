import { createConsola, LogLevels } from 'consola'

export const log = createConsola({
  fancy: true,
  formatOptions: {
    colors: true,
  },
  level: LogLevels.info,
})
