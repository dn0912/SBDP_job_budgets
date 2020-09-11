import Redis from 'ioredis'

const createFlagPoleCacheKey = (jobId) => `flag_${jobId}`

export default class FlagPoleService extends Redis {
  constructor(jobId, budgetLimit, {
    REDIS_HOST,
    REDIS_PORT,
    REDIS_PASSWORD,
    REDIS_CONNECTION,
  }) {
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
  }

  async createFlag() {
    this.set(createFlagPoleCacheKey(this.jobId), 'RUNNING')
  }

  async isInBudgetLimit(currentCost) {
    if (currentCost > this.budgetLimit) {
      console.log('+++currentCost', currentCost)
      console.log('+++isInBudgetLimit', await this.get(this.jobId))

      if (!this.isFlagSwitched) {
        this.set(createFlagPoleCacheKey(this.jobId), 'STOP')
        this.isFlagSwitched = true
      }

      return false
    }
    return true
  }

  getBudgetLimit() {
    return this.budgetLimit
  }
}
