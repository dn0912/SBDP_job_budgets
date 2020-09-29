import Redis from 'ioredis'

const createFlagPoleCacheKey = (jobId) => `flag_${jobId}`

export default class FlagPoleService extends Redis {
  constructor({
    REDIS_HOST,
    REDIS_PORT,
    REDIS_PASSWORD,
    REDIS_CONNECTION,
  }, notifier) {
    if (REDIS_CONNECTION) {
      super(REDIS_CONNECTION)
    } else {
      super({
        port: REDIS_PORT, // Redis port
        host: REDIS_HOST, // Redis host
        family: 4, // 4 (IPv4) or 6 (IPv6)
        password: REDIS_PASSWORD,
        db: 0,
      })
    }

    this.isFlagSwitched = false
    this.notifier = notifier
  }

  async isInBudgetLimit(jobId, budgetLimit, currentCost = 0, skipNotifying = false) {
    if (budgetLimit === 0) {
      return true
    }

    if (currentCost > budgetLimit) {
      console.log('+++FlagPoleService currentCost', currentCost)
      console.log('+++FlagPoleService isInBudgetLimit', await this.get(jobId))

      console.log('+++FlagPoleService FLIP SWITCH')
      this.set(createFlagPoleCacheKey(jobId), budgetLimit)
      this.isFlagSwitched = true
      if (!this.isFlagSwitched) {
        const msgSubject = `Job ${jobId} reached budget limit`
        const msgContent = `Job with ID: ${jobId} reached budget limit of ${budgetLimit}$`
        if (!skipNotifying) {
          console.log('+++FlagPoleService SEND SNS NOTIFICATION')
          this.notifier.publish(msgSubject, msgContent)
        }
      }

      return false
    }

    return true
  }

  async switchFlagAndStopJob(jobId) {
    console.log('+++FlagPoleService switchFlagAndStopJob')
    this.set(createFlagPoleCacheKey(jobId), 1)
  }
}
