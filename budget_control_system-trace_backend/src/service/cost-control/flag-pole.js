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
      this.set(createFlagPoleCacheKey(jobId), budgetLimit)
      if (!this.isFlagSwitched) {
        this.isFlagSwitched = true
        if (!skipNotifying) {
          const msgSubject = `Job ${jobId} reached budget limit`
          const msgContent = `Job with ID: ${jobId} reached budget limit of ${budgetLimit}$`
          this.notifier.publish(msgSubject, msgContent)
        }
      }

      this.isFlagSwitched = true
      return false
    }

    return true
  }

  async switchFlagAndStopJob(jobId) {
    this.set(createFlagPoleCacheKey(jobId), 1)
  }
}
