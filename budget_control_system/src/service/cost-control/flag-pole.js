import Redis from 'ioredis'

const createFlagPoleCacheKey = (jobId) => `flag_${jobId}`

export default class FlagPoleService extends Redis {
  constructor(jobId, budgetLimit, {
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

    this.budgetLimit = budgetLimit
    this.jobId = jobId
    this.isFlagSwitched = false
    this.notifier = notifier
  }

  async isInBudgetLimit(currentCost) {
    if (this.budgetLimit === 0 || this.budgetLimit > currentCost) {
      return true
    }

    console.log('+++currentCost', currentCost)
    console.log('+++isInBudgetLimit', await this.get(this.jobId))

    if (!this.isFlagSwitched) {
      this.set(createFlagPoleCacheKey(this.jobId), this.budgetLimit)
      this.isFlagSwitched = true

      const msgSubject = `Job ${this.jobId} reached budget limit`
      const msgContent = `Job with ID: ${this.jobId} reached budget limit of ${this.budgetLimit}$`
      this.notifier.publish(msgSubject, msgContent)
    }

    return false
  }

  getBudgetLimit() {
    return this.budgetLimit
  }
}
